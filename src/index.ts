/**
 * منصة رياض المتقين — نقطة دخول الـ Worker
 *
 * يقدّم الموقع العام (أصول ثابتة) عبر env.ASSETS، وواجهة API تحت /api.
 * الأدوار: زائر (guest) / متعلّم (student) / معلّم (teacher) / مدير (admin).
 *
 * نقاط API الحالية فعّالة: /api/health.
 * بقيّة النقاط مُهيّأة كهيكل (stubs) تُربط بالواجهة الخلفية في المراحل التالية.
 */

import {
  hashPassword,
  verifyPassword,
  createSession,
  getSessionUser,
  destroySession,
  isValidEmail,
  type AuthUser,
} from "./auth";
import * as yt from "./youtube";

export interface Env {
  /** أصول الموقع العام (Static Assets). */
  ASSETS: Fetcher;
  /** قاعدة البيانات — Cloudflare D1. */
  DB: D1Database;
  /** تخزين الملفات (صوت/صور/فيديو) — Cloudflare R2. */
  MEDIA: R2Bucket;
  /** متغيّرات عامة. */
  ENVIRONMENT: string;
  SITE_NAME: string;
  /** الأصل العام للموقع (لبناء روابط الوسائط المطلقة في النشر المجدول). */
  SITE_URL?: string;
  /** أسرار تكامل يوتيوب (تُضاف عبر wrangler secret put). */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** تكامل تيليجرام للنشر التلقائي (اختياري — يُضاف عبر wrangler secret put). */
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  /** إرسال البريد عبر Resend (لإعادة ضبط كلمة المرور). */
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  /** بريد المالك (سرّ يُثبّته النشر الآلي): يُرقّى حسابه لمدير النظام عند الدخول. */
  OWNER_EMAIL?: string;
  /** Webhook تسليم المنشورات (Make/Zapier/n8n) — يوزّع على بقية المنصّات (سرّ اختياري). */
  PUBLISH_WEBHOOK_URL?: string;
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

/** يقرأ جسم JSON بأمان. */
async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const data = await request.json();
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const clientIp = (request: Request): string => request.headers.get("CF-Connecting-IP") ?? "unknown";

/**
 * حدُّ معدّلٍ عامٌّ لكلّ IP لنقاط النهاية المجهولة (تسجيل/دعم/طلبات تعليم/نسيت كلمة المرور).
 * نُعيد استخدام جدول login_attempts: نخزّن الإجراء في حقل email بسابقة "@@" يتعذّر أن تكون بريداً حقيقيّاً.
 * يُعيد true إذا تجاوز الـ IP الحدّ (فيُرفض الطلب).
 */
async function rateLimited(env: Env, request: Request, action: string, max: number, minutes: number): Promise<boolean> {
  const ip = clientIp(request);
  const tag = `@@${action}`;
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND email = ? AND created_at > datetime('now', ?)",
    ).bind(ip, tag, `-${minutes} minutes`).first<{ c: number }>();
    if ((row?.c ?? 0) >= max) return true;
    await env.DB.prepare("INSERT INTO login_attempts (ip, email, success) VALUES (?, ?, 0)").bind(ip, tag).run();
  } catch { /* لا نمنع المستخدم بسبب خطأ في العدّاد */ }
  return false;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

const redirect = (location: string, setCookie?: string): Response => {
  const headers: Record<string, string> = { Location: location };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(null, { status: 302, headers });
};

/** ردّ يُلزم المستخدم بتعيين كلمة مرور جديدة قبل استخدام المنصّة. */
const mustChange = (): Response =>
  json({ ok: false, error: "يجب تعيين كلمة مرور جديدة أولاً.", code: "must_change_password" }, 403);

/** ردّ موحّد للنقاط غير المُفعّلة بعد. */
const notReady = (feature: string): Response =>
  json(
    { ok: false, status: "not_implemented", feature, message: "هذه الميزة قيد الإعداد وتُربط في مرحلةٍ لاحقة." },
    501,
  );

/** يشتقّ مصدر الزيارة من رابط الإحالة أو وسم utm_source. */
function deriveSource(referrer: string, utm: string, host: string): string {
  if (utm) return utm;
  if (!referrer) return "مباشر";
  let h = "";
  try { h = new URL(referrer).hostname.replace(/^www\./, ""); } catch { h = ""; }
  if (!h) return "مباشر";
  if (h === host || h.endsWith("riyadalmutaqin.com")) return "تصفّح داخليّ";
  if (/(^|\.)google\./.test(h)) return "جوجل";
  if (/(^|\.)bing\./.test(h)) return "Bing";
  if (/youtube\.|youtu\.be/.test(h)) return "يوتيوب";
  if (/facebook\.|(^|\.)fb\./.test(h)) return "فيسبوك";
  if (/instagram\./.test(h)) return "إنستغرام";
  if (/tiktok\./.test(h)) return "تيك توك";
  if (/(^|\.)t\.co$|twitter\.|x\.com/.test(h)) return "إكس/تويتر";
  if (/(^|\.)t\.me$|telegram\./.test(h)) return "تيليجرام";
  if (/whatsapp\.|wa\.me/.test(h)) return "واتساب";
  return h;
}

/** يسجّل مشاهدة صفحة لزائرٍ مجهول (كوكي مُعرّف عشوائيّ، دون أي بيانات شخصية). */
async function trackView(request: Request, env: Env): Promise<Response> {
  let b: { path?: string; referrer?: string; query?: string } = {};
  try { b = await request.json(); } catch { /* تجاهل */ }
  const path = String(b.path || "/").slice(0, 200);
  const referrer = String(b.referrer || "").slice(0, 300);
  let utm = "";
  try { utm = new URLSearchParams(String(b.query || "")).get("utm_source") || ""; } catch { /* تجاهل */ }
  const host = new URL(request.url).hostname;
  const source = deriveSource(referrer, utm, host).slice(0, 60);
  const country = (request.headers.get("CF-IPCountry") || "").slice(0, 4) || null;

  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)rvid=([a-zA-Z0-9-]{8,})/);
  let vid = m ? m[1] : "";
  let setCookie = "";
  if (!vid) {
    vid = crypto.randomUUID();
    setCookie = `rvid=${vid}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  try {
    await env.DB.prepare(
      "INSERT INTO page_views (visitor_id, path, source, referrer, country) VALUES (?, ?, ?, ?, ?)",
    ).bind(vid, path, source, referrer || null, country).run();
  } catch { /* لا نُفشل الصفحة بسبب التتبّع */ }

  const headers: Record<string, string> = {};
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(null, { status: 204, headers });
}

/** تسجيل حدث محتوى (مشاهدة/تحميل مقطع) لزائرٍ مجهولٍ أو مستخدمٍ مسجَّل. */
async function trackClipEvent(request: Request, env: Env): Promise<Response> {
  let b: { clip_id?: number; kind?: string } = {};
  try { b = await request.json(); } catch { /* تجاهل */ }
  const clipId = Number(b.clip_id);
  const kind = b.kind === "download" ? "download" : "view";
  if (!Number.isInteger(clipId)) return json({ ok: false, error: "clip_id غير صالح." }, 400);

  const user = await getSessionUser(request, env.DB);
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)rvid=([a-zA-Z0-9-]{8,})/);
  let vid = m ? m[1] : "";
  let setCookie = "";
  if (!vid) {
    vid = crypto.randomUUID();
    setCookie = `rvid=${vid}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  try {
    await env.DB.prepare(
      "INSERT INTO content_events (clip_id, kind, user_id, visitor_id) VALUES (?, ?, ?, ?)",
    ).bind(clipId, kind, user ? user.id : null, vid).run();
  } catch { /* لا نُفشل العميل بسبب التتبّع */ }

  const headers: Record<string, string> = {};
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(null, { status: 204, headers });
}

/**
 * أسعار الذهب والفضّة الحيّة محوّلةً إلى الدينار الكويتي للغرام الواحد (عيار ٢٤).
 * المصدر: سعر السوق العالمي (أونصة بالدولار) مضروباً في سعر صرف الدولار/الدينار.
 * تُخزَّن استجابة المصادر على حافة Cloudflare لدقيقة، فلا نُرهق المزوّد رغم تكرار الطلب.
 */
const TROY_OZ_G = 31.1034768;
async function livePrices(): Promise<Response> {
  const opt = { cf: { cacheTtl: 60, cacheEverything: true } } as RequestInit;
  try {
    const [xau, xag, fx] = await Promise.all([
      fetch("https://api.gold-api.com/price/XAU", opt).then((r) => r.json()),
      fetch("https://api.gold-api.com/price/XAG", opt).then((r) => r.json()),
      fetch("https://open.er-api.com/v6/latest/USD", opt).then((r) => r.json()),
    ]) as [{ price?: number }, { price?: number }, { rates?: { KWD?: number } }];

    const goldUsdOz = Number(xau?.price);
    const silverUsdOz = Number(xag?.price);
    const usdKwd = Number(fx?.rates?.KWD);
    if (!(goldUsdOz > 0) || !(silverUsdOz > 0) || !(usdKwd > 0)) {
      return json({ ok: false, error: "تعذّر جلب الأسعار." }, 502);
    }
    const round3 = (n: number) => Math.round(n * 1000) / 1000;
    const gold = round3((goldUsdOz / TROY_OZ_G) * usdKwd);   // غرام ذهب عيار ٢٤ بالدينار
    const silver = round3((silverUsdOz / TROY_OZ_G) * usdKwd); // غرام فضّة بالدينار

    return json(
      { ok: true, gold_price: gold, silver_price: silver, currency: "د.ك", source: "market", updated: new Date().toISOString() },
      200,
      { "Cache-Control": "public, max-age=60" },
    );
  } catch {
    return json({ ok: false, error: "تعذّر الاتصال بمصدر الأسعار." }, 502);
  }
}

/** موجّه واجهة API. */
async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const route = `${method} ${path}`;

  // فحص الصحّة — مُفعّل.
  if (route === "GET /api/health") {
    return json({
      ok: true,
      service: env.SITE_NAME,
      environment: env.ENVIRONMENT,
      time: new Date().toISOString(),
    });
  }

  // ===== المصادقة (المتعلّم/المعلّم) =====
  if (route === "POST /api/auth/register") return register(request, env);
  if (route === "POST /api/auth/login") return login(request, env);
  if (route === "POST /api/auth/logout") return logout(request, env);
  if (route === "POST /api/auth/forgot") return forgotPassword(request, env);
  if (route === "POST /api/auth/change-password") return changePassword(request, env);
  if (route === "GET /api/auth/me") {
    const user = await getSessionUser(request, env.DB);
    let mustChange = false;
    if (user) {
      const r = await env.DB.prepare("SELECT must_change_password AS m FROM users WHERE id = ?")
        .bind(user.id)
        .first<{ m: number }>();
      mustChange = Boolean(r && r.m);
    }
    return json({ ok: true, user, must_change_password: mustChange });
  }

  // ===== أسعار الذهب/الفضّة الحيّة بالدينار الكويتي (عام) =====
  if (route === "GET /api/gold-price") return livePrices();

  // ===== تتبّع زيارة مجهولة (مشاهدة صفحة + مصدر) =====
  if (route === "POST /api/track") return trackView(request, env);

  // ===== أحداث المحتوى: مشاهدة/تحميل مقطع (عام) =====
  if (route === "POST /api/clip-event") return trackClipEvent(request, env);

  // ===== دليل المعلّمين (عام؛ مع حالة المتابعة إن سجّل الطالب دخوله) =====
  if (route === "GET /api/teachers") {
    const user = await getSessionUser(request, env.DB);
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.name,
              (SELECT COUNT(*) FROM follows f WHERE f.teacher_id = u.id)                       AS followers,
              (SELECT COUNT(*) FROM clips c WHERE c.author_id = u.id AND c.is_published = 1)    AS clips
         FROM users u
        WHERE u.role IN ('teacher','admin') AND u.status = 'active'
        ORDER BY followers DESC, u.name ASC`,
    ).all();
    let following: number[] = [];
    if (user) {
      const { results: fr } = await env.DB.prepare(
        "SELECT teacher_id FROM follows WHERE follower_id = ?",
      ).bind(user.id).all<{ teacher_id: number }>();
      following = fr.map((r) => r.teacher_id);
    }
    return json({ ok: true, teachers: results, following, me: user ? user.id : null });
  }

  // ملف معلّم عام
  const teacherPub = path.match(/^\/api\/teachers\/(\d+)$/);
  if (teacherPub && request.method === "GET") {
    const id = Number(teacherPub[1]);
    const t = await env.DB.prepare(
      `SELECT u.id, u.name,
              (SELECT COUNT(*) FROM follows f WHERE f.teacher_id = u.id) AS followers
         FROM users u
        WHERE u.id = ? AND u.role IN ('teacher','admin') AND u.status = 'active'`,
    ).bind(id).first();
    if (!t) return json({ ok: false, error: "المعلّم غير موجود." }, 404);
    const { results: lessons } = await env.DB.prepare(
      `SELECT id, title, doctor_name, type, youtube_id, status, created_at
         FROM lessons
        WHERE author_id = ? AND is_published = 1 AND approval_status = 'approved'
        ORDER BY created_at DESC LIMIT 24`,
    ).bind(id).all();
    const { results: clips } = await env.DB.prepare(
      `SELECT id, title, doctor_name, youtube_id, duration
         FROM clips
        WHERE author_id = ? AND is_published = 1 AND approval_status = 'approved'
        ORDER BY created_at DESC LIMIT 24`,
    ).bind(id).all();
    const me = await getSessionUser(request, env.DB);
    let following = false;
    if (me) {
      const f = await env.DB.prepare(
        "SELECT 1 AS x FROM follows WHERE follower_id = ? AND teacher_id = ?",
      ).bind(me.id, id).first();
      following = Boolean(f);
    }
    return json({ ok: true, teacher: t, lessons, clips, following });
  }

  // ===== متابعة/إلغاء متابعة معلّم (يتطلّب تسجيل دخول) =====
  if (route === "POST /api/follow") {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();
    const b = await readJson(request);
    const teacherId = Number(b.teacher_id);
    const action = String(b.action ?? "follow");
    if (!Number.isInteger(teacherId)) return json({ ok: false, error: "معرّف غير صالح." }, 400);
    if (teacherId === user.id) return json({ ok: false, error: "لا يمكنك متابعة نفسك." }, 400);
    const t = await env.DB.prepare(
      "SELECT id FROM users WHERE id = ? AND role IN ('teacher','admin') AND status = 'active'",
    ).bind(teacherId).first();
    if (!t) return json({ ok: false, error: "المعلّم غير موجود." }, 404);
    if (action === "unfollow") {
      await env.DB.prepare("DELETE FROM follows WHERE follower_id = ? AND teacher_id = ?")
        .bind(user.id, teacherId).run();
      return json({ ok: true, following: false });
    }
    await env.DB.prepare(
      "INSERT OR IGNORE INTO follows (follower_id, teacher_id) VALUES (?, ?)",
    ).bind(user.id, teacherId).run();
    return json({ ok: true, following: true });
  }

  // ===== المحتوى العام (قراءة من D1) =====
  if (route === "GET /api/lessons") {
    const { results } = await env.DB.prepare(
      `SELECT id, course_id, title, description, doctor_name, type, youtube_id,
              duration, status, scheduled_at
         FROM lessons
        WHERE is_published = 1 AND approval_status = 'approved'
        ORDER BY status = 'live' DESC, sort_order ASC, created_at DESC`,
    ).all();
    return json({ ok: true, lessons: results });
  }
  if (route === "GET /api/clips") {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.title, c.doctor_name, c.youtube_id, c.video_url, c.thumbnail, c.duration,
              c.author_id, u.name AS author_name,
              (SELECT COUNT(DISTINCT COALESCE(e.user_id, e.visitor_id))
                 FROM content_events e WHERE e.clip_id = c.id AND e.kind = 'view') AS views
         FROM clips c
         LEFT JOIN users u ON u.id = c.author_id
        WHERE c.is_published = 1 AND c.approval_status = 'approved'
        ORDER BY c.created_at DESC`,
    ).all();
    return json({ ok: true, clips: results });
  }
  if (route === "GET /api/audio") {
    const { results } = await env.DB.prepare(
      `SELECT id, title, description, doctor_name, audio_url, background_image, duration
         FROM audio_posts
        WHERE is_published = 1 AND approval_status = 'approved'
        ORDER BY created_at DESC`,
    ).all();
    return json({ ok: true, audio: results });
  }

  // إعدادات عامة للقراءة فقط (روابط التواصل وغيرها)
  if (route === "GET /api/settings/public") {
    const keys = ["social_youtube", "social_tiktok", "social_facebook", "social_instagram", "site_tagline"];
    const settings: Record<string, string> = {};
    try {
      const { results } = await env.DB.prepare(
        `SELECT key, value FROM site_settings WHERE key IN (${keys.map(() => "?").join(",")})`,
      ).bind(...keys).all<{ key: string; value: string }>();
      for (const row of results || []) settings[row.key] = row.value ?? "";
    } catch {
      // الجدول قد لا يكون مُرحَّلاً بعد — الواجهة تستخدم القيم الافتراضية.
    }
    return json({ ok: true, settings });
  }

  // سؤال من الكوربوس المعتمد فقط (عام) — لا اختلاق؛ بلا مصدر لا جواب.
  if (route === "POST /api/ask") {
    const b = await readJson(request);
    const q = String(b.question ?? "").trim();
    if (q.length < 3) return json({ ok: false, error: "اكتب سؤالاً أوضح." }, 400);
    if (q.length > 500) return json({ ok: false, error: "السؤال طويل جداً." }, 400);
    if (await rateLimited(env, request, "ask", 30, 10)) {
      return json({ ok: false, error: "محاولات كثيرة. حاوِل بعد قليل." }, 429);
    }
    // بحث بسيط بالكلمات في الأسئلة/الأجوبة المعتمدة
    const words = q
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 6);
    if (!words.length) return json({ ok: false, error: "تعذّر فهم السؤال." }, 400);
    const like = words.map(() => "(question LIKE ? OR answer LIKE ? OR source LIKE ?)").join(" OR ");
    const binds: string[] = [];
    for (const w of words) {
      const p = `%${w}%`;
      binds.push(p, p, p);
    }
    const { results } = await env.DB.prepare(
      `SELECT id, question, answer, source, topic
         FROM ai_contributions
        WHERE status = 'approved' AND kind = 'qa' AND answer IS NOT NULL AND length(answer) > 0
          AND (${like})
        ORDER BY length(question) ASC
        LIMIT 5`,
    ).bind(...binds).all();
    if (!results.length) {
      return json({
        ok: true,
        found: false,
        message: "لا جواب معتمد في الكوربوس بعد لهذا السؤال. ساهم بإجابة موثّقة من المصدر.",
        contribute: "/train",
        matches: [],
      });
    }
    return json({ ok: true, found: true, matches: results });
  }

  // ===== المتعلّم: مكتبة الحفظ (يتطلّب تسجيل دخول) =====
  if (path === "/api/library" || path === "/api/library/remove") {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();

    // قائمة المحفوظات
    if (route === "GET /api/library") {
      const { results } = await env.DB.prepare(
        `SELECT l.id, l.title, l.description, l.doctor_name, l.type, l.youtube_id, l.duration,
                b.created_at AS saved_at
           FROM bookmarks b JOIN lessons l ON l.id = b.lesson_id
          WHERE b.user_id = ?
          ORDER BY b.created_at DESC`,
      )
        .bind(user.id)
        .all();
      return json({ ok: true, items: results });
    }

    // حفظ درس — يُقيَّد دائماً بمستخدم الجلسة (منع IDOR).
    if (route === "POST /api/library") {
      const body = await readJson(request);
      const lessonId = Number(body.lesson_id);
      if (!Number.isInteger(lessonId)) return json({ ok: false, error: "lesson_id غير صالح." }, 400);
      const lesson = await env.DB.prepare("SELECT id FROM lessons WHERE id = ? AND is_published = 1")
        .bind(lessonId)
        .first();
      if (!lesson) return json({ ok: false, error: "الدرس غير موجود." }, 404);
      await env.DB.prepare(
        "INSERT OR IGNORE INTO bookmarks (user_id, lesson_id) VALUES (?, ?)",
      )
        .bind(user.id, lessonId)
        .run();
      return json({ ok: true, saved: true });
    }

    // إزالة من المحفوظات
    if (route === "POST /api/library/remove") {
      const body = await readJson(request);
      const lessonId = Number(body.lesson_id);
      if (!Number.isInteger(lessonId)) return json({ ok: false, error: "lesson_id غير صالح." }, 400);
      await env.DB.prepare("DELETE FROM bookmarks WHERE user_id = ? AND lesson_id = ?")
        .bind(user.id, lessonId)
        .run();
      return json({ ok: true, saved: false });
    }
  }

  // ===== دفتر الزكاة (يتطلّب تسجيل دخول؛ مربوط بالمستخدم) =====
  if (path === "/api/zakat" || path.startsWith("/api/zakat/")) {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();

    if (route === "GET /api/zakat") {
      const settings = await env.DB.prepare(
        "SELECT gold_price, silver_price, currency, basis FROM zakat_settings WHERE user_id = ?",
      ).bind(user.id).first();
      const { results: entries } = await env.DB.prepare(
        "SELECT id, entry_date, type, amount, note FROM zakat_entries WHERE user_id = ? ORDER BY entry_date ASC, id ASC",
      ).bind(user.id).all();
      const { results: holdings } = await env.DB.prepare(
        "SELECT kind, grams, value, hawl_start, note FROM zakat_holdings WHERE user_id = ?",
      ).bind(user.id).all();
      return json({ ok: true, settings: settings || null, entries, holdings });
    }

    if (route === "POST /api/zakat/settings") {
      const b = await readJson(request);
      const num = (v: unknown) => (v != null && v !== "" ? Math.max(0, Number(v)) : null);
      const gold = num(b.gold_price);
      const silver = num(b.silver_price);
      const currency = String(b.currency ?? "د.ك").trim().slice(0, 12) || "د.ك";
      const basis = b.basis === "silver" ? "silver" : "gold";
      await env.DB.prepare(
        `INSERT INTO zakat_settings (user_id, gold_price, silver_price, currency, basis, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET gold_price=excluded.gold_price, silver_price=excluded.silver_price,
                                            currency=excluded.currency, basis=excluded.basis, updated_at=datetime('now')`,
      ).bind(user.id, gold, silver, currency, basis).run();
      return json({ ok: true });
    }

    // ممتلكات نوعٍ من الزكاة (ذهب/فضّة/أسهم/عروض تجارة) — سجلٌّ واحدٌ لكلّ نوع.
    if (route === "POST /api/zakat/holding") {
      const b = await readJson(request);
      const kind = String(b.kind ?? "");
      if (!["gold", "silver", "stocks", "trade"].includes(kind)) return json({ ok: false, error: "نوع غير صالح." }, 400);
      const num = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : null);
      const grams = num(b.grams);
      const value = num(b.value);
      const note = String(b.note ?? "").trim().slice(0, 200) || null;
      let hawl = String(b.hawl_start ?? "").slice(0, 10);
      if (hawl && !/^\d{4}-\d{2}-\d{2}$/.test(hawl)) hawl = "";
      await env.DB.prepare(
        `INSERT INTO zakat_holdings (user_id, kind, grams, value, hawl_start, note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, kind) DO UPDATE SET grams=excluded.grams, value=excluded.value,
                                                  hawl_start=excluded.hawl_start, note=excluded.note, updated_at=datetime('now')`,
      ).bind(user.id, kind, grams, value, hawl || null, note).run();
      return json({ ok: true });
    }

    const zh = path.match(/^\/api\/zakat\/holding\/(gold|silver|stocks|trade)$/);
    if (zh && request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM zakat_holdings WHERE user_id = ? AND kind = ?")
        .bind(user.id, zh[1]).run();
      return json({ ok: true });
    }

    if (route === "POST /api/zakat/entry") {
      const b = await readJson(request);
      const date = String(b.entry_date ?? "").slice(0, 10);
      const type = b.type === "expense" ? "expense" : "income";
      const amount = Number(b.amount);
      const note = String(b.note ?? "").trim().slice(0, 200) || null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: "التاريخ غير صالح." }, 400);
      if (!Number.isFinite(amount) || amount <= 0) return json({ ok: false, error: "المبلغ غير صالح." }, 400);
      const res = await env.DB.prepare(
        "INSERT INTO zakat_entries (user_id, entry_date, type, amount, note) VALUES (?, ?, ?, ?, ?)",
      ).bind(user.id, date, type, amount, note).run();
      return json({ ok: true, id: Number(res.meta.last_row_id) }, 201);
    }

    const ze = path.match(/^\/api\/zakat\/entry\/(\d+)$/);
    if (ze && request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM zakat_entries WHERE id = ? AND user_id = ?")
        .bind(Number(ze[1]), user.id).run();
      return json({ ok: true });
    }

    return json({ ok: false, error: "Not Found" }, 404);
  }

  // ===== ختمة القرآن (مربوطة بالحساب، تتطلّب تسجيل دخول) =====
  if (path === "/api/khatma" || path.startsWith("/api/khatma/")) {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();

    if (route === "GET /api/khatma") {
      const row = await env.DB.prepare(
        "SELECT total_pages, current_page, target_date, started_at, khatmat_done FROM khatma WHERE user_id = ?",
      ).bind(user.id).first();
      return json({ ok: true, khatma: row || null });
    }

    if (route === "POST /api/khatma") {
      const b = await readJson(request);
      const total = 604;
      let page = Number(b.current_page);
      if (!Number.isFinite(page)) page = 0;
      page = Math.max(0, Math.min(total, Math.floor(page)));
      let target = String(b.target_date ?? "").slice(0, 10);
      if (target && !/^\d{4}-\d{2}-\d{2}$/.test(target)) target = "";
      await env.DB.prepare(
        `INSERT INTO khatma (user_id, total_pages, current_page, target_date, started_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET current_page = excluded.current_page,
           target_date = excluded.target_date, updated_at = datetime('now')`,
      ).bind(user.id, total, page, target || null).run();
      return json({ ok: true });
    }

    // إتمام ختمة: نزيد العدّاد ونبدأ ختمةً جديدة.
    if (route === "POST /api/khatma/complete") {
      await env.DB.prepare(
        `INSERT INTO khatma (user_id, total_pages, current_page, khatmat_done, started_at, updated_at)
         VALUES (?, 604, 0, 1, datetime('now'), datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET khatmat_done = khatmat_done + 1,
           current_page = 0, target_date = NULL, started_at = datetime('now'), updated_at = datetime('now')`,
      ).bind(user.id).run();
      const row = await env.DB.prepare("SELECT khatmat_done FROM khatma WHERE user_id = ?").bind(user.id).first();
      return json({ ok: true, khatmat_done: row?.khatmat_done ?? 1 });
    }

    return json({ ok: false, error: "Not Found" }, 404);
  }

  // ===== ساهم بتدريب الذكاء الاصطناعي (مساهمة تطوعية شفافة · اعتماد المدير شرط) =====
  if (path === "/api/train" || path.startsWith("/api/train/")) {
    // إحصاءات عامة لصفحة الشرح — شفافية: الأرقام حقيقية من القاعدة، صفر يظهر صفراً
    if (route === "GET /api/train/stats") {
      const row = await env.DB.prepare(
        `SELECT
           (SELECT COUNT(*) FROM ai_contributions WHERE status='approved')                AS approved,
           (SELECT COUNT(*) FROM ai_contributions)                                        AS total,
           (SELECT COUNT(DISTINCT user_id) FROM ai_contributions)                         AS contributors`,
      ).first<{ approved: number; total: number; contributors: number }>();
      return json({ ok: true, stats: row ?? { approved: 0, total: 0, contributors: 0 } });
    }

    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();

    // مساهماتي وحالاتها (المعتمد/المردود مع ملاحظة المدير — حلقة تعلّم للمساهم)
    if (route === "GET /api/train/mine") {
      const { results } = await env.DB.prepare(
        `SELECT id, kind, question, answer, source, topic, status, review_note, created_at
         FROM ai_contributions WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
      ).bind(user.id).all();
      return json({ ok: true, contributions: results });
    }

    if (route === "POST /api/train/contribute") {
      // بقرار المشغّل: المساهمة لكل مستخدمي الموقع عدا حساب الأدمن (فصل الأدوار)
      if (user.role === "admin") {
        return json({ ok: false, error: "حساب الإدارة لا يساهم في البيانات — المساهمة لحسابات المتعلّمين والمعلّمين.", code: "admin_excluded" }, 403);
      }
      const b = await readJson(request);
      const kind = b.kind === "question" ? "question" : "qa";
      const question = String(b.question ?? "").trim().slice(0, 1000);
      // نوع «سؤال فقط» لا يحمل جواباً ولا مصدراً أصلاً — يسدّ التفاف «جواب بلا إسناد بنوع مموَّه»
      const answer = kind === "question" ? null : String(b.answer ?? "").trim().slice(0, 4000) || null;
      const source = kind === "question" ? null : String(b.source ?? "").trim().slice(0, 500) || null;
      const topicList = ["فقه", "عقيدة", "حديث", "تفسير", "سيرة", "أخلاق", "أذكار ودعاء", "عام"];
      const topic = topicList.includes(String(b.topic)) ? String(b.topic) : "عام";
      if (question.length < 10) return json({ ok: false, error: "اكتب السؤال كاملاً (10 أحرف على الأقل)." }, 400);
      if (kind === "qa" && (!answer || answer.length < 15)) {
        return json({ ok: false, error: "نوع «سؤال وجواب» يتطلّب جواباً وافياً (15 حرفاً على الأقل)." }, 400);
      }
      if (kind === "qa" && !source) {
        return json({ ok: false, error: "المصدر إلزامي لكل جواب — لا نُدرّب الذكاء على كلام بلا إسناد." }, 400);
      }
      if (b.consent !== true) {
        return json({ ok: false, error: "يلزم الإقرار بأن المساهمة تُستخدم لتطوير الذكاء الاصطناعي.", code: "consent_required" }, 400);
      }
      // سقف يومي يحمي جودة الطابور من الإغراق — 30 مساهمة/يوم لكل مستخدم.
      // الفحص والإدراج عبارة واحدة ذرّية (INSERT..SELECT بشرط العدّ) — طلبات متوازية
      // بفحص منفصل كانت تتجاوز السقف بسباق check-then-insert على D1.
      const res = await env.DB.prepare(
        `INSERT INTO ai_contributions (user_id, kind, question, answer, source, topic, consent_version)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, '1.0'
         WHERE (SELECT COUNT(*) FROM ai_contributions
                WHERE user_id = ?1 AND created_at > datetime('now','-1 day')) < 30`,
      ).bind(user.id, kind, question, answer, source, topic).run();
      if (!res.meta.changes) {
        return json({ ok: false, error: "بلغت سقف اليوم (30 مساهمة) — عُد غداً، جزاك الله خيراً.", code: "daily_cap" }, 429);
      }
      await notifyRole(env, "manager", {
        type: "ai_training",
        title: "مساهمة تدريب جديدة بانتظار مراجعتك",
        body: question.slice(0, 120),
        link: "/manager/training",
      });
      return json({ ok: true, id: Number(res.meta.last_row_id) }, 201);
    }

    // ── المراجعة والاعتماد: مدير الموقع بالذات (والأدمن كصلاحية عليا — نمط المنصّة) ──
    if (user.role !== "manager" && user.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);

    if (route === "GET /api/train/review") {
      const status = ["pending", "approved", "rejected"].includes(url.searchParams.get("status") ?? "")
        ? url.searchParams.get("status") : "pending";
      const { results } = await env.DB.prepare(
        `SELECT c.id, c.kind, c.question, c.answer, c.source, c.topic, c.status, c.review_note,
                c.created_at, c.reviewed_at, u.name AS contributor, u.role AS contributor_role
         FROM ai_contributions c JOIN users u ON u.id = c.user_id
         WHERE c.status = ? ORDER BY c.id ASC LIMIT 200`,
      ).bind(status).all();
      const counts = await env.DB.prepare(
        `SELECT
           (SELECT COUNT(*) FROM ai_contributions WHERE status='pending')  AS pending,
           (SELECT COUNT(*) FROM ai_contributions WHERE status='approved') AS approved,
           (SELECT COUNT(*) FROM ai_contributions WHERE status='rejected') AS rejected`,
      ).first();
      return json({ ok: true, contributions: results, counts });
    }

    const tr = path.match(/^\/api\/train\/review\/(\d+)$/);
    if (tr && request.method === "POST") {
      const id = Number(tr[1]);
      const b = await readJson(request);
      const action = b.action === "reject" ? "reject" : "approve";
      const note = String(b.note ?? "").trim().slice(0, 500) || null;
      const cur = await env.DB.prepare("SELECT id, kind, question, answer, source, status FROM ai_contributions WHERE id = ?")
        .bind(id).first<{ id: number; kind: string; question: string; answer: string | null; source: string | null; status: string }>();
      if (!cur) return json({ ok: false, error: "المساهمة غير موجودة." }, 404);
      if (action === "reject") {
        await env.DB.prepare(
          `UPDATE ai_contributions SET status='rejected', review_note=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`,
        ).bind(note, user.id, id).run();
        await audit(env, user.email, "train.reject", `contribution:${id}`);
        return json({ ok: true, status: "rejected" });
      }
      // اعتماد — مع إمكانية تصحيح المدير للنص؛ الأصل يُحفظ مرة واحدة (أمانة علمية).
      // «غائب من الطلب» يُبقي المخزون، و«مُفرَّغ قصداً» يُفرِّغ فعلاً — لا ارتداد صامتاً:
      // ما يراه المدير على الشاشة لحظة الاعتماد هو ما يُخزَّن ويُصدَّر حرفياً.
      const q = b.question === undefined ? cur.question : String(b.question).trim().slice(0, 1000);
      const a = b.answer === undefined ? cur.answer : String(b.answer).trim().slice(0, 4000) || null;
      const s = b.source === undefined ? cur.source : String(b.source).trim().slice(0, 500) || null;
      if (!q || q.length < 10) return json({ ok: false, error: "لا يُعتمد سؤال فارغ — صحّحه أو رُدّ المساهمة." }, 400);
      if (a && !s) return json({ ok: false, error: "المصدر إلزامي لكل جواب معتمد — لا نُدرّب الذكاء على كلام بلا إسناد." }, 400);
      // إضافة المدير جواباً (بمصدره) تُرقّي النوع إلى سؤال-وجواب؛ ومسح الجواب يعيده سؤالاً
      const newKind = a ? "qa" : "question";
      const edited = q !== cur.question || a !== cur.answer || s !== cur.source;
      await env.DB.prepare(
        `UPDATE ai_contributions SET status='approved', kind=?, question=?, answer=?, source=?, review_note=?,
           reviewed_by=?, reviewed_at=datetime('now'),
           orig_question = CASE WHEN ? AND orig_question IS NULL THEN ? ELSE orig_question END,
           orig_answer   = CASE WHEN ? AND orig_answer   IS NULL THEN ? ELSE orig_answer   END,
           orig_source   = CASE WHEN ? AND orig_source   IS NULL THEN ? ELSE orig_source   END
         WHERE id=?`,
      ).bind(newKind, q, a, s, note, user.id, edited ? 1 : 0, cur.question, edited ? 1 : 0, cur.answer, edited ? 1 : 0, cur.source, id).run();
      await audit(env, user.email, "train.approve", `contribution:${id}`);
      return json({ ok: true, status: "approved" });
    }

    // تصدير الكوربوس المعتمد JSONL — مجهّل الهوية: لا معرّف مستخدم ولا اسم في التصدير
    if (route === "GET /api/train/export") {
      const { results } = await env.DB.prepare(
        `SELECT kind, question, answer, source, topic, reviewed_at
         FROM ai_contributions WHERE status='approved' ORDER BY id ASC`,
      ).all();
      const lines = (results as Array<Record<string, unknown>>).map((r) => JSON.stringify(r)).join("\n");
      await audit(env, user.email, "train.export", `approved:${(results as unknown[]).length}`);
      return new Response(lines, {
        headers: {
          "content-type": "application/jsonl; charset=utf-8",
          "content-disposition": `attachment; filename="riyad-corpus-${new Date().toISOString().slice(0, 10)}.jsonl"`,
        },
      });
    }

    return json({ ok: false, error: "Not Found" }, 404);
  }

  // ===== المتعلّم: متابعة التقدّم (يتطلّب تسجيل دخول) =====
  if (path === "/api/progress") {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();

    if (route === "GET /api/progress") {
      const { results } = await env.DB.prepare(
        "SELECT lesson_id, completed, last_position, updated_at FROM progress WHERE user_id = ?",
      )
        .bind(user.id)
        .all();
      return json({ ok: true, progress: results });
    }

    if (route === "POST /api/progress") {
      const body = await readJson(request);
      const lessonId = Number(body.lesson_id);
      if (!Number.isInteger(lessonId)) return json({ ok: false, error: "lesson_id غير صالح." }, 400);
      const completed = body.completed ? 1 : 0;
      const lastPosition = Number.isFinite(Number(body.last_position)) ? Math.max(0, Math.floor(Number(body.last_position))) : 0;
      await env.DB.prepare(
        `INSERT INTO progress (user_id, lesson_id, completed, last_position, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, lesson_id)
         DO UPDATE SET completed = excluded.completed,
                       last_position = excluded.last_position,
                       updated_at = datetime('now')`,
      )
        .bind(user.id, lessonId, completed, lastPosition)
        .run();
      return json({ ok: true });
    }
  }

  // ===== خدمة الوسائط من R2 (عام للقراءة) =====
  if (method === "GET" && path.startsWith("/api/media/")) {
    const key = decodeURIComponent(path.slice("/api/media/".length));
    const obj = await env.MEDIA.get(key);
    if (!obj) return json({ ok: false, error: "Not Found" }, 404);
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("cache-control", "public, max-age=86400");
    // تحصين: نمنع تنفيذ أي محتوى نشط يُخدَم من الأصل (SVG/HTML قديمة) — دفاعٌ في العمق.
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Security-Policy", "default-src 'none'; sandbox; style-src 'unsafe-inline'");
    const ct = (headers.get("content-type") || "").toLowerCase();
    if (ct.includes("svg") || ct.includes("html") || ct.includes("xml") || ct.includes("script")) {
      headers.set("content-type", "application/octet-stream");
      headers.set("Content-Disposition", "attachment");
    }
    return new Response(obj.body, { headers });
  }

  // ===== تقديم طلب تعليم (عام) =====
  if (route === "POST /api/teacher-applications") return submitTeacherApplication(request, env);

  // ===== تواصل مع الدعم (عام) =====
  if (route === "POST /api/support") return submitSupportTicket(request, env);

  // ===== المساجد/الجمعيات (عام + إدارة للمالك) =====
  if (path.startsWith("/api/mosques")) {
    return handleMosques(request, env, path, route);
  }

  // ===== الإشعارات (أي مستخدم مسجّل حسب دوره) =====
  if (path.startsWith("/api/notifications")) {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();
    return handleNotifications(request, env, user, route);
  }

  // ===== المدير (يتطلّب دور admin) =====
  if (path.startsWith("/api/admin/")) {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();
    if (user.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
    return handleAdmin(request, env, user, path, route);
  }

  // ===== مدير الموقع (يتطلّب دور manager/admin) =====
  if (path.startsWith("/api/manager/")) {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();
    if (user.role !== "manager" && user.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
    return handleManager(request, env, user, path, route);
  }

  // ===== المعلّم / المدير / الأدمن: إدارة محتوى ونشر (كلٌّ على قنواته) =====
  if (path.startsWith("/api/teacher/")) {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();
    if (user.role !== "teacher" && user.role !== "admin" && user.role !== "manager") {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    return handleTeacher(request, env, user, path, route);
  }

  return json({ ok: false, error: "Not Found" }, 404);
}

/** واجهات المدير: إدارة حسابات المعلّمين والأدوار. */
async function handleAdmin(
  request: Request,
  env: Env,
  admin: AuthUser,
  path: string,
  route: string,
): Promise<Response> {
  // قائمة المستخدمين
  if (route === "GET /api/admin/users") {
    const { results } = await env.DB.prepare(
      `SELECT id, name, email, role, status, created_at FROM users ORDER BY
         CASE role WHEN 'admin' THEN 0 WHEN 'teacher' THEN 1 ELSE 2 END, created_at DESC`,
    ).all();
    return json({ ok: true, users: results });
  }

  // إنشاء حساب معلّم (المدير وحده)
  if (route === "POST /api/admin/teachers") {
    const b = await readJson(request);
    const name = String(b.name ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    if (name.length < 2 || name.length > 80) return json({ ok: false, error: "الاسم غير صالح." }, 400);
    if (!isValidEmail(email)) return json({ ok: false, error: "البريد الإلكتروني غير صالح." }, 400);
    if (password.length < 8) return json({ ok: false, error: "كلمة المرور يجب أن تكون 8 أحرف فأكثر." }, 400);

    const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (exists) return json({ ok: false, error: "هذا البريد مسجّل بالفعل." }, 409);

    const passwordHash = await hashPassword(password);
    const res = await env.DB.prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'teacher')",
    )
      .bind(name, email, passwordHash)
      .run();
    const id = Number(res.meta.last_row_id);
    await audit(env, admin.email, "admin.teacher.create", `user:${id}`);
    return json({ ok: true, id }, 201);
  }

  // إنشاء حساب معلّم أو مدير موقع (كلمة مرور مؤقّتة تصل بالبريد — لا تُمرَّر كلمة مرور)
  if (route === "POST /api/admin/accounts") {
    const b = await readJson(request);
    const name = String(b.name ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const role = String(b.role ?? "");
    if (name.length < 2 || name.length > 80) return json({ ok: false, error: "الاسم غير صالح." }, 400);
    if (!isValidEmail(email)) return json({ ok: false, error: "البريد الإلكتروني غير صالح." }, 400);
    if (!["teacher", "manager"].includes(role)) return json({ ok: false, error: "الدور يجب أن يكون معلّماً أو مدير موقع." }, 400);
    const r = await createUserAccount(env, { name, email, role: role as "teacher" | "manager" });
    if (!r.ok) return json({ ok: false, error: r.error }, 400);
    await audit(env, admin.email, `admin.${role}.create`, `user:${r.id}`);
    return json({ ok: true, id: r.id }, 201);
  }

  // تعديل دور/حالة مستخدم
  const mu = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (mu && request.method === "PATCH") {
    const id = Number(mu[1]);
    if (id === admin.id) return json({ ok: false, error: "لا يمكنك تعديل دورك أو حالتك بنفسك." }, 400);
    const b = await readJson(request);
    const fields: string[] = [];
    const vals: (string | number)[] = [];
    if ("role" in b) {
      const role = String(b.role);
      if (!["student", "teacher", "admin", "manager"].includes(role)) return json({ ok: false, error: "دور غير صالح." }, 400);
      fields.push("role = ?");
      vals.push(role);
    }
    if ("status" in b) {
      const status = String(b.status);
      if (!["active", "suspended"].includes(status)) return json({ ok: false, error: "حالة غير صالحة." }, 400);
      fields.push("status = ?");
      vals.push(status);
    }
    if (!fields.length) return json({ ok: false, error: "لا تغييرات." }, 400);
    vals.push(id);
    await env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...vals).run();
    await audit(env, admin.email, "admin.user.update", `user:${id}`);
    return json({ ok: true });
  }

  // ===== نظرة عامّة على النظام كاملاً =====
  if (route === "GET /api/admin/overview") {
    const stats = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE role='student')                       AS students,
         (SELECT COUNT(*) FROM users WHERE role='teacher')                        AS teachers,
         (SELECT COUNT(*) FROM users WHERE role='manager')                        AS managers,
         (SELECT COUNT(*) FROM users WHERE role='admin')                          AS admins,
         (SELECT COUNT(*) FROM users WHERE status='suspended')                    AS suspended,
         (SELECT COUNT(*) FROM lessons)                                           AS lessons,
         (SELECT COUNT(*) FROM clips)                                             AS clips,
         (SELECT COUNT(*) FROM teacher_applications WHERE status='pending')       AS pending_apps,
         (SELECT COUNT(*) FROM clips   WHERE approval_status='pending')           AS pending_clips,
         (SELECT COUNT(*) FROM lessons WHERE approval_status='pending')           AS pending_lessons,
         (SELECT COUNT(*) FROM support_tickets WHERE status='open')               AS open_tickets,
         (SELECT COUNT(*) FROM follows)                                           AS follows,
         (SELECT COUNT(*) FROM page_views WHERE created_at >= datetime('now','-30 days')) AS views_30d`,
    ).first();
    return json({ ok: true, stats });
  }

  // ===== الدعم: قائمة التذاكر =====
  if (route === "GET /api/admin/tickets") {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "open";
    const { results } = await env.DB.prepare(
      `SELECT t.id, t.name, t.email, t.category, t.subject, t.message, t.status, t.created_at,
              u.role AS user_role
         FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id
        WHERE t.status = ? ORDER BY t.created_at DESC LIMIT 100`,
    ).bind(status).all();
    return json({ ok: true, tickets: results });
  }

  // إغلاق/فتح تذكرة
  const mt = path.match(/^\/api\/admin\/tickets\/(\d+)$/);
  if (mt && request.method === "POST") {
    const id = Number(mt[1]);
    const b = await readJson(request);
    if (b.action === "close") {
      await env.DB.prepare(
        "UPDATE support_tickets SET status='closed', closed_at=datetime('now'), closed_by=? WHERE id=?",
      ).bind(admin.id, id).run();
    } else if (b.action === "reopen") {
      await env.DB.prepare(
        "UPDATE support_tickets SET status='open', closed_at=NULL, closed_by=NULL WHERE id=?",
      ).bind(id).run();
    } else return json({ ok: false, error: "إجراء غير صالح." }, 400);
    await audit(env, admin.email, `admin.ticket.${b.action}`, `ticket:${id}`);
    return json({ ok: true });
  }

  // ===== سجلّ دخول المستخدمين (متى دخل كلّ مستخدم) =====
  if (route === "GET /api/admin/logins") {
    // سجلّ زمنيّ لآخر عمليّات الدخول.
    const { results: recent } = await env.DB.prepare(
      `SELECT e.id, e.created_at, e.country, e.role, u.name, u.email
         FROM login_events e LEFT JOIN users u ON u.id = e.user_id
        ORDER BY e.created_at DESC LIMIT 200`,
    ).all();
    // ملخّص لكلّ مستخدم: آخر دخول وعدد مرّاته.
    const { results: perUser } = await env.DB.prepare(
      `SELECT u.id, u.name, u.email, u.role, u.created_at AS joined,
              (SELECT MAX(created_at) FROM login_events e WHERE e.user_id = u.id) AS last_login,
              (SELECT COUNT(*)        FROM login_events e WHERE e.user_id = u.id) AS login_count
         FROM users u
        ORDER BY last_login DESC NULLS LAST, u.created_at DESC
        LIMIT 300`,
    ).all();
    return json({ ok: true, recent, perUser });
  }

  return json({ ok: false, error: "Not Found" }, 404);
}

/** تقديم طلب تعليم (عام) — يُنشئ سجلّاً ويُشعِر مدير الموقع. */
async function submitTeacherApplication(request: Request, env: Env): Promise<Response> {
  if (await rateLimited(env, request, "teach", 5, 60)) {
    return json({ ok: false, error: "محاولات كثيرة. حاوِل بعد قليل." }, 429);
  }
  const b = await readJson(request);
  const fullName = String(b.full_name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const phone = String(b.phone ?? "").trim().slice(0, 40) || null;
  const country = String(b.country ?? "").trim().slice(0, 80) || null;
  const nationality = String(b.nationality ?? "").trim().slice(0, 80) || null;
  const qualifications = String(b.qualifications ?? "").trim().slice(0, 2000) || null;
  const bio = String(b.bio ?? "").trim().slice(0, 2000) || null;
  let sampleUrl = String(b.sample_url ?? "").trim().slice(0, 500) || null;
  if (sampleUrl && !/^https?:\/\//i.test(sampleUrl)) sampleUrl = null;

  if (fullName.length < 3 || fullName.length > 100) return json({ ok: false, error: "الاسم الكامل مطلوب." }, 400);
  if (!isValidEmail(email)) return json({ ok: false, error: "البريد الإلكتروني غير صالح." }, 400);
  if (!qualifications) return json({ ok: false, error: "اذكر مؤهّلاتك وخبرتك العلمية." }, 400);

  // حدّ بسيط: طلبٌ واحد معلّق لكل بريد.
  const dup = await env.DB.prepare(
    "SELECT id FROM teacher_applications WHERE email = ? AND status = 'pending'",
  ).bind(email).first();
  if (dup) return json({ ok: false, error: "لديك طلبٌ قيد المراجعة بالفعل." }, 409);

  const res = await env.DB.prepare(
    `INSERT INTO teacher_applications (full_name, email, phone, country, nationality, qualifications, bio, sample_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(fullName, email, phone, country, nationality, qualifications, bio, sampleUrl).run();
  const id = Number(res.meta.last_row_id);

  await notifyRole(env, "manager", {
    type: "teacher_application",
    title: "طلب تعليم جديد",
    body: `${fullName} (${email}) قدّم طلباً للانضمام معلّماً.`,
    link: "/manager/applications",
    email: true,
  });
  return json({ ok: true, id }, 201);
}

/** تواصل مع الدعم (عام) — يُنشئ تذكرة ويُشعِر الأدمن. */
async function submitSupportTicket(request: Request, env: Env): Promise<Response> {
  if (await rateLimited(env, request, "support", 10, 60)) {
    return json({ ok: false, error: "محاولات كثيرة. حاوِل بعد قليل." }, 429);
  }
  const b = await readJson(request);
  const user = await getSessionUser(request, env.DB);
  const name = (user?.name || String(b.name ?? "").trim()).slice(0, 100) || null;
  const email = (user?.email || String(b.email ?? "").trim().toLowerCase()).slice(0, 160) || null;
  const category = String(b.category ?? "").trim().slice(0, 40) || null;
  const subject = String(b.subject ?? "").trim().slice(0, 160) || null;
  const message = String(b.message ?? "").trim().slice(0, 4000);

  if (message.length < 5) return json({ ok: false, error: "اكتب رسالتك (٥ أحرف فأكثر)." }, 400);
  if (!user && email && !isValidEmail(email)) return json({ ok: false, error: "البريد الإلكتروني غير صالح." }, 400);

  const res = await env.DB.prepare(
    "INSERT INTO support_tickets (user_id, name, email, category, subject, message) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(user ? user.id : null, name, email, category, subject, message).run();
  const id = Number(res.meta.last_row_id);

  await notifyRole(env, "admin", {
    type: "support",
    title: "رسالة دعم جديدة",
    body: (subject ? subject + " — " : "") + (name || email || "زائر"),
    link: "/admin/support",
    email: true,
  });
  return json({ ok: true, id }, 201);
}

/** واجهات المساجد/الجمعيات — اشتراك خدمة (Free/Pro) وليس تبرعات. */
async function handleMosques(request: Request, env: Env, path: string, route: string): Promise<Response> {
  // قائمة عامة
  if (route === "GET /api/mosques") {
    const { results } = await env.DB.prepare(
      `SELECT id, name, slug, city, country, lat, lng, plan, description
         FROM mosque_orgs WHERE is_published = 1
        ORDER BY plan = 'pro' DESC, name ASC LIMIT 200`,
    ).all();
    return json({ ok: true, mosques: results });
  }

  // تفاصيل عامة بالـ slug
  const bySlug = path.match(/^\/api\/mosques\/by-slug\/([^/]+)$/);
  if (bySlug && request.method === "GET") {
    const slug = decodeURIComponent(bySlug[1]);
    const row = await env.DB.prepare(
      `SELECT id, name, slug, city, country, lat, lng, address, iqama_json, description,
              external_url, plan, is_published
         FROM mosque_orgs WHERE slug = ? AND is_published = 1`,
    ).bind(slug).first();
    if (!row) return json({ ok: false, error: "المسجد غير موجود." }, 404);
    return json({ ok: true, mosque: row });
  }

  // إنشاء / قائمة ملكي — يتطلّب دخولاً
  const user = await getSessionUser(request, env.DB);

  if (route === "GET /api/mosques/mine") {
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    const { results } = await env.DB.prepare(
      `SELECT id, name, slug, city, country, plan, is_published, created_at
         FROM mosque_orgs WHERE owner_user_id = ? ORDER BY created_at DESC`,
    ).bind(user.id).all();
    return json({ ok: true, mosques: results });
  }

  if (route === "POST /api/mosques") {
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.mustChangePassword) return mustChange();
    const b = await readJson(request);
    const name = String(b.name ?? "").trim();
    if (name.length < 2) return json({ ok: false, error: "اسم المسجد/الجمعية مطلوب." }, 400);
    const base = name
      .toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || `mosque-${Date.now()}`;
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const city = String(b.city ?? "").trim().slice(0, 80) || null;
    const country = String(b.country ?? "Kuwait").trim().slice(0, 80) || "Kuwait";
    const description = String(b.description ?? "").trim().slice(0, 2000) || null;
    const address = String(b.address ?? "").trim().slice(0, 300) || null;
    const defaultIqama = JSON.stringify({ Fajr: 25, Dhuhr: 20, Asr: 20, Maghrib: 10, Isha: 20 });
    const res = await env.DB.prepare(
      `INSERT INTO mosque_orgs (name, slug, city, country, address, description, iqama_json, owner_user_id, plan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'free')`,
    ).bind(name, slug, city, country, address, description, defaultIqama, user.id).run();
    const id = Number(res.meta.last_row_id);
    await audit(env, user.email, "mosque.create", `mosque:${id}`);
    return json({ ok: true, id, slug, plan: "free" }, 201);
  }

  const m = path.match(/^\/api\/mosques\/(\d+)$/);
  if (m) {
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    const id = Number(m[1]);
    const row = await env.DB.prepare(`SELECT * FROM mosque_orgs WHERE id = ?`).bind(id).first<{
      id: number; owner_user_id: number; plan: string; slug: string; name: string;
      city: string | null; country: string | null; address: string | null;
      description: string | null; iqama_json: string | null; external_url: string | null;
      is_published: number;
    }>();
    if (!row) return json({ ok: false, error: "غير موجود." }, 404);
    const isStaff = user.role === "admin" || user.role === "manager";
    if (row.owner_user_id !== user.id && !isStaff) return json({ ok: false, error: "forbidden" }, 403);

    if (request.method === "GET") {
      // إحصاء مشاهدات الصفحة
      const views = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM page_views WHERE path = ? OR path = ?`,
      ).bind(`/mosque/${row.slug}`, `/mosque/${row.slug}/`).first<{ c: number }>();
      let series: { day: string; c: number }[] = [];
      if (row.plan === "pro") {
        const { results } = await env.DB.prepare(
          `SELECT date(created_at) AS day, COUNT(*) AS c FROM page_views
            WHERE (path = ? OR path = ?) AND created_at >= datetime('now','-7 days')
            GROUP BY date(created_at) ORDER BY day ASC`,
        ).bind(`/mosque/${row.slug}`, `/mosque/${row.slug}/`).all<{ day: string; c: number }>();
        series = results || [];
      }
      return json({
        ok: true,
        mosque: row,
        stats: { views: views?.c ?? 0, pro: row.plan === "pro", series },
      });
    }

    if (request.method === "PATCH") {
      const b = await readJson(request);
      const fields: string[] = [];
      const vals: (string | number | null)[] = [];
      const allowed = ["name", "city", "country", "address", "description", "external_url", "iqama_json"];
      for (const k of allowed) {
        if (k in b) {
          fields.push(`${k} = ?`);
          vals.push(b[k] === null ? null : String(b[k]).slice(0, k === "description" ? 2000 : 500));
        }
      }
      if ("is_published" in b) {
        fields.push("is_published = ?");
        vals.push(b.is_published ? 1 : 0);
      }
      if ("lat" in b) { fields.push("lat = ?"); vals.push(Number(b.lat)); }
      if ("lng" in b) { fields.push("lng = ?"); vals.push(Number(b.lng)); }
      // ترقية Pro: المدير فقط (أو عبر طلب)
      if ("plan" in b && isStaff) {
        const plan = String(b.plan) === "pro" ? "pro" : "free";
        fields.push("plan = ?");
        vals.push(plan);
      }
      if (!fields.length) return json({ ok: false, error: "لا تغييرات." }, 400);
      vals.push(id);
      await env.DB.prepare(`UPDATE mosque_orgs SET ${fields.join(", ")} WHERE id = ?`).bind(...vals).run();
      await audit(env, user.email, "mosque.update", `mosque:${id}`);
      return json({ ok: true });
    }
  }

  // طلب ترقية Pro
  const up = path.match(/^\/api\/mosques\/(\d+)\/request-pro$/);
  if (up && request.method === "POST") {
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    const id = Number(up[1]);
    const row = await env.DB.prepare(`SELECT id, owner_user_id, plan FROM mosque_orgs WHERE id = ?`)
      .bind(id).first<{ id: number; owner_user_id: number; plan: string }>();
    if (!row || row.owner_user_id !== user.id) return json({ ok: false, error: "forbidden" }, 403);
    if (row.plan === "pro") return json({ ok: false, error: "المشترك بالفعل على Pro." }, 409);
    const b = await readJson(request);
    const note = String(b.note ?? "").trim().slice(0, 500) || null;
    await env.DB.prepare(
      `INSERT INTO mosque_plan_requests (mosque_id, user_id, note) VALUES (?, ?, ?)`,
    ).bind(id, user.id, note).run();
    await notifyRole(env, "manager", {
      type: "mosque_pro",
      title: "طلب اشتراك مسجد Pro",
      body: `${user.name} يطلب ترقية مسجد #${id}`,
      link: "/manager",
      email: true,
    });
    return json({ ok: true }, 201);
  }

  // مدير: قائمة طلبات Pro + موافقة
  if (route === "GET /api/mosques/plan-requests") {
    if (!user || (user.role !== "manager" && user.role !== "admin")) {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.mosque_id, r.note, r.status, r.created_at, m.name AS mosque_name, u.name AS user_name, u.email
         FROM mosque_plan_requests r
         JOIN mosque_orgs m ON m.id = r.mosque_id
         JOIN users u ON u.id = r.user_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC LIMIT 100`,
    ).all();
    return json({ ok: true, requests: results });
  }
  const apr = path.match(/^\/api\/mosques\/plan-requests\/(\d+)$/);
  if (apr && request.method === "POST") {
    if (!user || (user.role !== "manager" && user.role !== "admin")) {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    const rid = Number(apr[1]);
    const b = await readJson(request);
    const action = b.action === "reject" ? "reject" : "approve";
    const req = await env.DB.prepare(`SELECT * FROM mosque_plan_requests WHERE id = ?`)
      .bind(rid).first<{ id: number; mosque_id: number; status: string }>();
    if (!req || req.status !== "pending") return json({ ok: false, error: "الطلب غير متاح." }, 404);
    if (action === "approve") {
      await env.DB.prepare(
        `UPDATE mosque_orgs SET plan = 'pro', plan_expires_at = datetime('now','+365 days') WHERE id = ?`,
      ).bind(req.mosque_id).run();
      await env.DB.prepare(`UPDATE mosque_plan_requests SET status = 'approved' WHERE id = ?`).bind(rid).run();
    } else {
      await env.DB.prepare(`UPDATE mosque_plan_requests SET status = 'rejected' WHERE id = ?`).bind(rid).run();
    }
    await audit(env, user.email, `mosque.plan.${action}`, `request:${rid}`);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Not Found" }, 404);
}

/** إشعارات الأدوار: قائمة + عدّ غير المقروء + تعليم كمقروء. */
async function handleNotifications(request: Request, env: Env, user: AuthUser, route: string): Promise<Response> {
  // الأدمن يرى إشعارات المدير+الأدمن؛ الباقون يرون دورهم (+ إشعارات موجّهة لمعرّفهم).
  const roleFilter =
    user.role === "admin" ? ["manager", "admin"] :
    user.role === "manager" ? ["manager"] :
    [user.role];
  const placeholders = roleFilter.map(() => "?").join(",");

  if (route === "GET /api/notifications") {
    const { results } = await env.DB.prepare(
      `SELECT id, type, title, body, link, is_read, created_at
         FROM notifications
        WHERE recipient_role IN (${placeholders})
           OR recipient_id = ?
        ORDER BY created_at DESC LIMIT 50`,
    ).bind(...roleFilter, user.id).all();
    const unread = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM notifications
        WHERE is_read = 0 AND (recipient_role IN (${placeholders}) OR recipient_id = ?)`,
    ).bind(...roleFilter, user.id).first<{ c: number }>();
    return json({ ok: true, notifications: results, unread: unread ? unread.c : 0 });
  }

  if (route === "POST /api/notifications/read") {
    const b = await readJson(request);
    if (b.id) {
      await env.DB.prepare(
        `UPDATE notifications SET is_read = 1
          WHERE id = ? AND (recipient_role IN (${placeholders}) OR recipient_id = ?)`,
      ).bind(Number(b.id), ...roleFilter, user.id).run();
    } else {
      await env.DB.prepare(
        `UPDATE notifications SET is_read = 1
          WHERE recipient_role IN (${placeholders}) OR recipient_id = ?`,
      ).bind(...roleFilter, user.id).run();
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "Not Found" }, 404);
}

/** واجهات مدير الموقع: طلبات التعليم، الموافقة على المحتوى، لوحة القيادة. */
async function handleManager(
  request: Request,
  env: Env,
  user: AuthUser,
  path: string,
  route: string,
): Promise<Response> {
  // ===== لوحة القيادة: أعداد المعلّق =====
  if (route === "GET /api/manager/dashboard") {
    const row = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM teacher_applications WHERE status = 'pending')      AS pending_apps,
         (SELECT COUNT(*) FROM clips WHERE approval_status = 'pending')            AS pending_clips,
         (SELECT COUNT(*) FROM lessons WHERE approval_status = 'pending')          AS pending_lessons,
         (SELECT COUNT(*) FROM channel_posts WHERE approval_status = 'pending')    AS pending_posts,
         (SELECT COUNT(*) FROM audio_posts WHERE approval_status = 'pending')      AS pending_audio,
         (SELECT COUNT(*) FROM ai_documents WHERE approval_status = 'pending')     AS pending_docs,
         (SELECT COUNT(*) FROM users WHERE role = 'teacher')                       AS teachers,
         (SELECT COUNT(*) FROM users WHERE role = 'student')                       AS students,
         (SELECT COUNT(*) FROM mosque_orgs)                                        AS mosques,
         (SELECT COUNT(*) FROM mosque_orgs WHERE plan = 'pro')                     AS mosques_pro,
         (SELECT COUNT(*) FROM mosque_plan_requests WHERE status = 'pending')      AS pending_mosque_pro`,
    ).first();
    return json({ ok: true, stats: row });
  }

  // ===== تحليل البيانات الموسّع (بلدان، أوقات الدخول، وظائف، حسب الدور) =====
  if (route === "GET /api/manager/analytics") {
    // البلدان: من زيارات الموقع المجهولة (آخر ٣٠ يوماً).
    const { results: visitorCountries } = await env.DB.prepare(
      `SELECT COALESCE(country,'؟') AS country, COUNT(DISTINCT visitor_id) AS c
         FROM page_views WHERE created_at >= datetime('now','-30 days')
        GROUP BY country ORDER BY c DESC LIMIT 12`,
    ).all();
    // بلد إقامة المسجّلين.
    const { results: userCountries } = await env.DB.prepare(
      `SELECT COALESCE(country,'غير محدّد') AS country, COUNT(*) AS c
         FROM users WHERE role = 'student' GROUP BY country ORDER BY c DESC LIMIT 12`,
    ).all();
    // أوقات الدخول المفضّلة بتوقيت UTC+3 (السعودية/الكويت).
    const { results: loginHours } = await env.DB.prepare(
      `SELECT CAST(strftime('%H', datetime(created_at,'+3 hours')) AS INTEGER) AS hour, COUNT(*) AS c
         FROM login_events GROUP BY hour ORDER BY hour`,
    ).all();
    // وظائف المسجّلين.
    const { results: occupations } = await env.DB.prepare(
      `SELECT occupation, COUNT(*) AS c FROM users
        WHERE role = 'student' AND occupation IS NOT NULL AND occupation <> ''
        GROUP BY occupation ORDER BY c DESC LIMIT 12`,
    ).all();
    // المراحل الدراسية.
    const { results: stages } = await env.DB.prepare(
      `SELECT education_stage AS stage, COUNT(*) AS c FROM users
        WHERE role = 'student' AND education_stage IS NOT NULL AND education_stage <> ''
        GROUP BY education_stage ORDER BY c DESC LIMIT 12`,
    ).all();
    // أعداد حسب الدور.
    const { results: byRole } = await env.DB.prepare(
      `SELECT role, COUNT(*) AS c FROM users GROUP BY role`,
    ).all();
    return json({ ok: true, visitorCountries, userCountries, loginHours, occupations, stages, byRole });
  }

  // ===== طلبات التعليم =====
  if (route === "GET /api/manager/applications") {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "pending";
    const { results } = await env.DB.prepare(
      `SELECT id, full_name, email, phone, country, nationality, qualifications, bio, sample_url,
              status, notes, created_at, reviewed_at
         FROM teacher_applications WHERE status = ? ORDER BY created_at DESC LIMIT 100`,
    ).bind(status).all();
    return json({ ok: true, applications: results });
  }

  // الموافقة/الرفض على طلب تعليم
  const ma = path.match(/^\/api\/manager\/applications\/(\d+)$/);
  if (ma && request.method === "POST") {
    const id = Number(ma[1]);
    const b = await readJson(request);
    const action = String(b.action ?? "");
    const notes = String(b.notes ?? "").trim().slice(0, 1000) || null;
    const app = await env.DB.prepare(
      "SELECT id, full_name, email, status FROM teacher_applications WHERE id = ?",
    ).bind(id).first<{ id: number; full_name: string; email: string; status: string }>();
    if (!app) return json({ ok: false, error: "الطلب غير موجود." }, 404);
    if (app.status !== "pending") return json({ ok: false, error: "هذا الطلب رُوجِع مسبقاً." }, 409);

    if (action === "approve") {
      const created = await createUserAccount(env, { name: app.full_name, email: app.email, role: "teacher" });
      if (!created.ok) return json({ ok: false, error: created.error }, 400);
      await env.DB.prepare(
        `UPDATE teacher_applications
            SET status = 'approved', notes = ?, reviewed_by = ?, reviewed_at = datetime('now'), user_id = ?
          WHERE id = ?`,
      ).bind(notes, user.id, created.id, id).run();
      await audit(env, user.email, "manager.application.approve", `application:${id}`);
      return json({ ok: true, user_id: created.id });
    }
    if (action === "reject") {
      await env.DB.prepare(
        `UPDATE teacher_applications
            SET status = 'rejected', notes = ?, reviewed_by = ?, reviewed_at = datetime('now')
          WHERE id = ?`,
      ).bind(notes, user.id, id).run();
      await audit(env, user.email, "manager.application.reject", `application:${id}`);
      return json({ ok: true });
    }
    return json({ ok: false, error: "إجراء غير صالح." }, 400);
  }

  // ===== قائمة الموافقة على المحتوى =====
  if (route === "GET /api/manager/pending") {
    const { results: clips } = await env.DB.prepare(
      `SELECT c.id, c.title, c.doctor_name, c.video_url, c.youtube_id, c.created_at, u.name AS author_name
         FROM clips c LEFT JOIN users u ON u.id = c.author_id
        WHERE c.approval_status = 'pending' ORDER BY c.created_at DESC LIMIT 100`,
    ).all();
    const { results: lessons } = await env.DB.prepare(
      `SELECT l.id, l.title, l.doctor_name, l.type, l.youtube_id, l.created_at, u.name AS author_name
         FROM lessons l LEFT JOIN users u ON u.id = l.author_id
        WHERE l.approval_status = 'pending' ORDER BY l.created_at DESC LIMIT 100`,
    ).all();
    const { results: posts } = await env.DB.prepare(
      `SELECT p.id, p.content, p.media_url, p.channels, p.created_at, u.name AS author_name
         FROM channel_posts p LEFT JOIN users u ON u.id = p.author_id
        WHERE p.approval_status = 'pending' ORDER BY p.created_at DESC LIMIT 100`,
    ).all();
    const { results: audio } = await env.DB.prepare(
      `SELECT a.id, a.title, a.doctor_name, a.audio_url, a.duration, a.created_at, u.name AS author_name
         FROM audio_posts a LEFT JOIN users u ON u.id = a.author_id
        WHERE a.approval_status = 'pending' ORDER BY a.created_at DESC LIMIT 100`,
    ).all();
    return json({ ok: true, clips, lessons, posts, audio });
  }

  // إعدادات الموقع (مدير/أدمن)
  if (route === "GET /api/manager/settings") {
    const { results } = await env.DB.prepare(`SELECT key, value FROM site_settings ORDER BY key`).all<{ key: string; value: string }>();
    const settings: Record<string, string> = {};
    for (const row of results || []) settings[row.key] = row.value ?? "";
    return json({ ok: true, settings });
  }
  if (route === "POST /api/manager/settings") {
    const b = await readJson(request);
    const allowed = ["social_youtube", "social_tiktok", "social_facebook", "social_instagram", "site_tagline"];
    let updated = 0;
    for (const key of allowed) {
      if (!(key in b)) continue;
      const value = String(b[key] ?? "").trim().slice(0, 500);
      await env.DB.prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).bind(key, value).run();
      updated++;
    }
    await audit(env, user.email, "manager.settings", `keys:${updated}`);
    return json({ ok: true, updated });
  }

  // مستندات التدريب (قائمة / اعتماد)
  if (route === "GET /api/manager/documents") {
    const reqUrl = new URL(request.url);
    const status = ["pending", "approved", "rejected", "all"].includes(reqUrl.searchParams.get("status") ?? "")
      ? (reqUrl.searchParams.get("status") as string)
      : "pending";
    const where = status === "all" ? "" : " WHERE d.approval_status = ?";
    const binds = status === "all" ? [] : [status];
    const { results } = await env.DB.prepare(
      `SELECT d.id, d.title, d.r2_key, d.mime, d.bytes, d.source_rights, d.approval_status, d.notes,
              d.created_at, d.reviewed_at, u.name AS uploader
         FROM ai_documents d LEFT JOIN users u ON u.id = d.uploaded_by
        ${where}
        ORDER BY d.created_at DESC LIMIT 200`,
    ).bind(...binds).all();
    return json({ ok: true, documents: results });
  }
  const md = path.match(/^\/api\/manager\/documents\/(\d+)$/);
  if (md && request.method === "POST") {
    const id = Number(md[1]);
    const b = await readJson(request);
    const status = b.action === "approve" ? "approved" : b.action === "reject" ? "rejected" : "";
    if (!status) return json({ ok: false, error: "إجراء غير صالح." }, 400);
    const notes = String(b.notes ?? "").trim().slice(0, 500) || null;
    await env.DB.prepare(
      `UPDATE ai_documents SET approval_status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
         notes = COALESCE(?, notes), status = CASE WHEN ? = 'approved' THEN 'active' ELSE 'archived' END
       WHERE id = ?`,
    ).bind(status, user.id, notes, status, id).run();
    await audit(env, user.email, `manager.document.${b.action}`, `document:${id}`);
    return json({ ok: true });
  }

  // الموافقة/الرفض على عنصر محتوى
  const mp = path.match(/^\/api\/manager\/(clips|lessons|posts|audio)\/(\d+)$/);
  if (mp && request.method === "POST") {
    const kind = mp[1];
    const table = kind === "posts" ? "channel_posts" : kind === "audio" ? "audio_posts" : kind;
    const id = Number(mp[2]);
    const b = await readJson(request);
    const status = b.action === "approve" ? "approved" : b.action === "reject" ? "rejected" : "";
    if (!status) return json({ ok: false, error: "إجراء غير صالح." }, 400);
    // عند الموافقة على درس/مقطع/صوت: ننشره أيضاً (is_published).
    if (table === "clips" || table === "lessons" || table === "audio_posts") {
      await env.DB.prepare(
        `UPDATE ${table} SET approval_status = ?, reviewed_by = ?, is_published = ? WHERE id = ?`,
      ).bind(status, user.id, status === "approved" ? 1 : 0, id).run();
    } else {
      await env.DB.prepare(
        `UPDATE channel_posts SET approval_status = ?, reviewed_by = ? WHERE id = ?`,
      ).bind(status, user.id, id).run();
    }
    await audit(env, user.email, `manager.${kind}.${b.action}`, `${kind}:${id}`);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Not Found" }, 404);
}

/** تسجيل متعلّم جديد. (المعلّمون يُنشَؤون من الإدارة، لا بالتسجيل الذاتي.) */
async function register(request: Request, env: Env): Promise<Response> {
  if (await rateLimited(env, request, "register", 8, 60)) {
    return json({ ok: false, error: "محاولات كثيرة. حاوِل بعد قليل." }, 429);
  }
  const body = await readJson(request);
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  // بيانات المتعلّم الموسّعة (اختيارية عدا الاسم/البريد/كلمة المرور).
  const birthDate = String(body.birth_date ?? "").trim().slice(0, 10) || null;
  const educationStage = String(body.education_stage ?? "").trim().slice(0, 60) || null;
  const country = String(body.country ?? "").trim().slice(0, 80) || null;
  const city = String(body.city ?? "").trim().slice(0, 80) || null;
  const nationality = String(body.nationality ?? "").trim().slice(0, 80) || null;
  const occupation = String(body.occupation ?? "").trim().slice(0, 80) || null;

  if (name.length < 2 || name.length > 80) return json({ ok: false, error: "الاسم غير صالح." }, 400);
  if (!isValidEmail(email)) return json({ ok: false, error: "البريد الإلكتروني غير صالح." }, 400);
  if (password.length < 8) return json({ ok: false, error: "كلمة المرور يجب أن تكون 8 أحرف فأكثر." }, 400);

  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) return json({ ok: false, error: "هذا البريد مسجّل بالفعل." }, 409);

  const passwordHash = await hashPassword(password);
  const result = await env.DB.prepare(
    `INSERT INTO users (name, full_name, email, password_hash, role,
                        birth_date, education_stage, country, city, nationality, occupation)
     VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(name, name, email, passwordHash, birthDate, educationStage, country, city, nationality, occupation)
    .run();

  const userId = Number(result.meta.last_row_id);
  const setCookie = await createSession(env.DB, userId);
  const user: AuthUser = { id: userId, name, email, role: "student" };
  return json({ ok: true, user }, 201, { "Set-Cookie": setCookie });
}

/** تسجيل الدخول مع حدٍّ لمعدّل المحاولات. */
async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const ip = clientIp(request);

  // تحصين: الحسابات التجريبيّة (@riyad.test) كانت كلماتها معروفةً في الشيفرة — نمنع الدخول بها نهائيّاً.
  if (email.endsWith("@riyad.test")) {
    return json({ ok: false, error: "البريد أو كلمة المرور غير صحيحة." }, 401);
  }

  // حدّ المحاولات: 10 محاولات فاشلة خلال 15 دقيقة لكل IP.
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > datetime('now','-15 minutes')",
  )
    .bind(ip)
    .first<{ c: number }>();
  if ((recent?.c ?? 0) >= 10) {
    return json({ ok: false, error: "محاولات كثيرة. حاوِل بعد قليل." }, 429);
  }

  const row = await env.DB.prepare(
    "SELECT id, name, email, role, password_hash, status, must_change_password FROM users WHERE email = ?",
  )
    .bind(email)
    .first<{ id: number; name: string; email: string; role: AuthUser["role"]; password_hash: string; status: string; must_change_password: number }>();

  const ok = row && row.status === "active" && (await verifyPassword(password, row.password_hash));
  await env.DB.prepare("INSERT INTO login_attempts (ip, email, success) VALUES (?, ?, ?)")
    .bind(ip, email, ok ? 1 : 0)
    .run();

  if (!ok || !row) {
    // رسالة موحّدة لمنع تعداد الحسابات.
    return json({ ok: false, error: "البريد أو كلمة المرور غير صحيحة." }, 401);
  }

  // 👑 ترقية المالك الآمنة: البريد المطابق لسرّ OWNER_EMAIL يُرقّى لمدير النظام عند أول
  // دخول ناجح (ملكية البريد + كلمة المرور معاً — لا مسار آخر لصنع مدير أول، لأن ملف
  // SQL اليدويّ خارج قدرة المشغّل). السرّ يُثبَّت من النشر الآلي ولا يدخل git.
  let role = row.role;
  const owner = String(env.OWNER_EMAIL ?? "").trim().toLowerCase();
  if (owner && email === owner && role !== "admin") {
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(row.id).run();
    role = "admin";
    await audit(env, email, "auth.owner_promoted", `user:${row.id}`);
  }

  const setCookie = await createSession(env.DB, row.id);
  // تسجيل وقت الدخول (لتحليل الأوقات والبلدان المفضّلة).
  try {
    const country = (request.headers.get("CF-IPCountry") || "").slice(0, 4) || null;
    await env.DB.prepare("INSERT INTO login_events (user_id, role, country) VALUES (?, ?, ?)")
      .bind(row.id, role, country).run();
  } catch { /* لا نُفشل الدخول بسبب التتبّع */ }
  const user: AuthUser = { id: row.id, name: row.name, email: row.email, role };
  return json({ ok: true, user, must_change_password: Boolean(row.must_change_password) }, 200, { "Set-Cookie": setCookie });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const setCookie = await destroySession(request, env.DB);
  return json({ ok: true }, 200, { "Set-Cookie": setCookie });
}

/* ===== إعادة ضبط كلمة المرور (بريد عبر Resend) ===== */

/** يرسل بريداً عبر Resend. */
async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!env.RESEND_API_KEY) return { ok: false, error: "خدمة البريد غير مُعَدّة." };
  const from = env.MAIL_FROM || "رياض المتقين <no-reply@riyadalmutaqin.com>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (res.ok) return { ok: true };
    const t = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status} ${t.slice(0, 140)}` };
  } catch (err) {
    return { ok: false, error: String((err as Error).message) };
  }
}

/** كلمة مرور مؤقّتة قابلة للقراءة (≥ 8 أحرف). */
function tempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return "Rm" + Array.from(bytes).map((b) => b.toString(36)).join("").slice(0, 9);
}

/**
 * إنشاء حساب بدورٍ محدّد مع كلمة مرورٍ مؤقّتة تصل بالبريد وإلزام تغييرها.
 * لا تُمرَّر كلمة المرور إطلاقاً عبر الواجهة — تُولَّد هنا وتُرسَل للمستخدم وحده.
 */
async function createUserAccount(
  env: Env,
  data: { name: string; email: string; role: "teacher" | "manager" | "student" },
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(data.email).first();
  if (exists) return { ok: false, error: "هذا البريد مسجّل بالفعل." };

  const temp = tempPassword();
  const roleAr = data.role === "manager" ? "مدير الموقع" : data.role === "teacher" ? "معلّم" : "متعلّم";
  const html =
    `<div dir="rtl" style="font-family:Tajawal,Arial,sans-serif">` +
    `<h2>رياض المتقين</h2><p>مرحباً ${data.name}،</p>` +
    `<p>أُنشئ لك حسابٌ بصفة <strong>${roleAr}</strong> في منصّة رياض المتقين.</p>` +
    `<p>بريد الدخول: <strong>${data.email}</strong></p>` +
    `<p>كلمة المرور المؤقّتة:</p>` +
    `<p style="font-size:1.4rem;font-weight:bold;letter-spacing:1px">${temp}</p>` +
    `<p>ادخل بها من <a href="https://riyadalmutaqin.com/login">صفحة الدخول</a>، وسيُطلب منك تعيين كلمة مرورٍ جديدة فوراً.</p></div>`;
  const sent = await sendEmail(env, data.email, "حسابك في رياض المتقين", html);
  if (!sent.ok) return { ok: false, error: "تعذّر إرسال بريد التفعيل. تأكّد من إعداد خدمة البريد." };

  const hash = await hashPassword(temp);
  const res = await env.DB.prepare(
    "INSERT INTO users (name, full_name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?, 1)",
  ).bind(data.name, data.name, data.email, hash, data.role).run();
  return { ok: true, id: Number(res.meta.last_row_id) };
}

/** إنشاء إشعارٍ لكل من يحمل دوراً معيّناً + بريدٌ اختياري لهم. */
async function notifyRole(
  env: Env,
  role: string,
  n: { type: string; title: string; body?: string; link?: string; email?: boolean },
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO notifications (recipient_role, type, title, body, link) VALUES (?, ?, ?, ?, ?)",
    ).bind(role, n.type, n.title, n.body ?? null, n.link ?? null).run();
  } catch { /* لا نُفشل الطلب بسبب الإشعار */ }

  if (n.email) {
    try {
      const { results } = await env.DB.prepare(
        "SELECT email, name FROM users WHERE role = ? AND status = 'active'",
      ).bind(role).all<{ email: string; name: string }>();
      const html =
        `<div dir="rtl" style="font-family:Tajawal,Arial,sans-serif">` +
        `<h2>رياض المتقين</h2><p>${escapeHtml(n.title)}</p>` +
        (n.body ? `<p>${escapeHtml(n.body)}</p>` : "") +
        (n.link ? `<p><a href="https://riyadalmutaqin.com${n.link}">فتح اللوحة</a></p>` : "") +
        `</div>`;
      for (const r of results) await sendEmail(env, r.email, n.title, html);
    } catch { /* تجاهل فشل البريد */ }
  }
}

/** تهريب HTML بسيط لرسائل البريد. */
function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** نسيت كلمة المرور: يرسل كلمة مؤقّتة ويُلزم بتغييرها. الردّ موحّد لمنع تعداد الحسابات. */
async function forgotPassword(request: Request, env: Env): Promise<Response> {
  const b = await readJson(request);
  const email = String(b.email ?? "").trim().toLowerCase();
  const generic = json({ ok: true, message: "إن كان بريدك مسجّلاً فستصلك رسالةٌ بكلمة مرورٍ مؤقّتة." });
  // حدٌّ لكلّ IP فوق الحدّ لكلّ حساب: يمنع إغراق حسابٍ أو إساءة استخدام البريد.
  if (await rateLimited(env, request, "forgot", 6, 60)) return generic;
  if (!isValidEmail(email)) return generic;

  // نبدأ توليد التجزئة دائماً (PBKDF2 مكلِف) لتوحيد زمن الاستجابة ومنع تعداد الحسابات بالتوقيت.
  const temp = tempPassword();
  const hashPromise = hashPassword(temp);

  const row = await env.DB.prepare("SELECT id, name, status, last_reset_at FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number; name: string; status: string; last_reset_at: string | null }>();
  if (!row || row.status !== "active") { await hashPromise; return generic; }

  // حدّ التكرار: طلبٌ واحد كل ٥ دقائق لكل حساب.
  const recent = await env.DB.prepare(
    "SELECT 1 AS x FROM users WHERE id = ? AND last_reset_at IS NOT NULL AND last_reset_at > datetime('now','-5 minutes')",
  )
    .bind(row.id)
    .first();
  if (recent) { await hashPromise; return generic; }

  const html =
    `<div dir="rtl" style="font-family:Tajawal,Arial,sans-serif">` +
    `<h2>رياض المتقين</h2><p>مرحباً ${row.name || ""}،</p>` +
    `<p>كلمة مرورك المؤقّتة هي:</p>` +
    `<p style="font-size:1.4rem;font-weight:bold;letter-spacing:1px">${temp}</p>` +
    `<p>ادخل بها ثم سيُطلب منك تعيين كلمة مرورٍ جديدة فوراً.</p>` +
    `<p>إن لم تطلب ذلك فتجاهل هذه الرسالة.</p></div>`;

  // نرسل البريد أولاً؛ لا نغيّر كلمة المرور إلا إذا نجح الإرسال (حتى لا يُحبَس المستخدم).
  const sent = await sendEmail(env, email, "كلمة مرور مؤقّتة — رياض المتقين", html);
  if (!sent.ok) { await hashPromise; return generic; }

  const hash = await hashPromise;
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 1, last_reset_at = datetime('now') WHERE id = ?",
  )
    .bind(hash, row.id)
    .run();
  await audit(env, email, "auth.forgot", `user:${row.id}`);
  return generic;
}

/** تغيير كلمة المرور (يتطلّب جلسة) — يُزيل علم الإلزام. */
async function changePassword(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env.DB);
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  const b = await readJson(request);
  const np = String(b.new_password ?? "");
  if (np.length < 8) return json({ ok: false, error: "كلمة المرور يجب أن تكون 8 أحرف فأكثر." }, 400);
  const hash = await hashPassword(np);
  await env.DB.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?")
    .bind(hash, user.id)
    .run();
  // إبطال كل الجلسات (يقطع أي جهاز آخر) ثم إصدار جلسة جديدة للجهاز الحالي.
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  const setCookie = await createSession(env.DB, user.id);
  await audit(env, user.email, "auth.change_password", `user:${user.id}`);
  return json({ ok: true }, 200, { "Set-Cookie": setCookie });
}

/* ===== أدوات المعلّم ===== */

async function audit(env: Env, email: string, action: string, target: string): Promise<void> {
  await env.DB.prepare("INSERT INTO audit_log (actor_email, action, target) VALUES (?, ?, ?)")
    .bind(email, action, target)
    .run();
}

/** القنوات المدعومة للنشر. */
const CHANNELS = ["youtube", "tiktok", "facebook", "x", "instagram", "telegram"] as const;
type Channel = (typeof CHANNELS)[number];

/** هل تكامل تيليجرام مُعَدّ (أسرار موجودة)؟ */
const telegramConfigured = (env: Env): boolean =>
  Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);

/** الرابط الأساس المطلق لبناء روابط الوسائط العامة (لتيليجرام). */
function siteBase(env: Env, fallbackOrigin = ""): string {
  return (env.SITE_URL || fallbackOrigin).replace(/\/+$/, "");
}

/** نداء عامّ لواجهة Bot API. */
async function tgCall(
  env: Env,
  method: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, ...payload }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, error: data.description || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: String((err as Error).message) };
  }
}

/** ينشر منشوراً (نصّ + وسائط اختيارية) إلى قناة تيليجرام عبر الطريقة المناسبة. */
async function sendTelegramPost(
  env: Env,
  content: string | null,
  mediaUrl: string | null,
  baseOrigin: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!telegramConfigured(env)) return { ok: false, error: "تيليجرام غير مُعَدّ." };
  const caption = content || undefined;
  if (mediaUrl) {
    const abs = /^https?:\/\//.test(mediaUrl) ? mediaUrl : `${siteBase(env, baseOrigin)}${mediaUrl}`;
    // روابط الوسائط النسبية تحتاج أصلاً عاماً ليجلبها تيليجرام؛ بدونه نرسل الرابط كنصّ.
    if (!/^https?:\/\//.test(abs)) {
      return tgCall(env, "sendMessage", { text: `${content ? content + "\n" : ""}${mediaUrl}` });
    }
    const isVideo = mediaUrl.includes("/video/") || /\.(mp4|mov|webm|m4v)$/i.test(mediaUrl);
    return tgCall(env, isVideo ? "sendVideo" : "sendPhoto", isVideo ? { video: abs, caption } : { photo: abs, caption });
  }
  return tgCall(env, "sendMessage", { text: content || "📎 منشور جديد", disable_web_page_preview: false });
}

/** هل ضُبط Webhook توزيع المنشورات؟ */
const webhookConfigured = (env: Env): boolean => !!env.PUBLISH_WEBHOOK_URL;

/** يستخرج معرّف فيديو يوتيوب من رابط أو معرّف خام. */
function extractYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** يسلّم المنشور للقنوات — يفضّل ربطات المستخدم الخاصة، مع سقوط اختياري على أسرار الموقع. */
async function deliverToChannels(
  env: Env,
  channels: Channel[],
  content: string | null,
  mediaUrl: string | null,
  origin: string,
  userCreds?: {
    telegram?: { bot_token: string; chat_id: string };
    webhook?: { url: string };
  },
): Promise<{ delivered: { channel: Channel; ok: boolean; error?: string; via?: string }[]; status: string }> {
  const delivered: { channel: Channel; ok: boolean; error?: string; via?: string }[] = [];

  if (channels.includes("telegram")) {
    if (userCreds?.telegram?.bot_token && userCreds.telegram.chat_id) {
      const r = await sendTelegramPostWithCreds(
        userCreds.telegram.bot_token,
        userCreds.telegram.chat_id,
        content,
        mediaUrl,
        origin,
        env,
      );
      delivered.push({ channel: "telegram", ok: r.ok, error: r.error, via: "user_telegram" });
    } else if (telegramConfigured(env)) {
      const r = await sendTelegramPost(env, content, mediaUrl, origin);
      delivered.push({ channel: "telegram", ok: r.ok, error: r.error, via: "site_telegram" });
    } else {
      delivered.push({
        channel: "telegram",
        ok: false,
        error: "اربط تيليجرام الخاص بك من إعدادات النشر (بوت + chat_id).",
        via: "none",
      });
    }
  }

  const rest = channels.filter((c) => c !== "telegram");
  if (rest.length) {
    const hook = userCreds?.webhook?.url || env.PUBLISH_WEBHOOK_URL;
    if (hook) {
      const r = await sendWebhookPostToUrl(hook, rest, content, mediaUrl, origin, env);
      for (const c of rest) {
        delivered.push({
          channel: c,
          ok: r.ok,
          error: r.error,
          via: userCreds?.webhook?.url ? "user_webhook" : "site_webhook",
        });
      }
    } else {
      for (const c of rest) {
        delivered.push({
          channel: c,
          ok: false,
          error: "اربط Webhook الخاص بك (Make/Zapier) من إعدادات النشر، أو انشر يدوياً.",
          via: "none",
        });
      }
    }
  }

  const anyOk = delivered.some((d) => d.ok);
  const anyAttempt = delivered.some((d) => d.via && d.via !== "none");
  let status = "queued";
  if (anyOk) status = "published";
  else if (anyAttempt && delivered.every((d) => d.via !== "none" && !d.ok)) status = "failed";
  return { delivered, status };
}

async function sendTelegramPostWithCreds(
  botToken: string,
  chatId: string,
  content: string | null,
  mediaUrl: string | null,
  baseOrigin: string,
  env: Env,
): Promise<{ ok: boolean; error?: string }> {
  const call = async (method: string, payload: Record<string, unknown>) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, ...payload }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (res.ok && data.ok) return { ok: true as const };
      return { ok: false as const, error: data.description || `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false as const, error: String((err as Error).message) };
    }
  };
  if (mediaUrl) {
    const abs = /^https?:\/\//.test(mediaUrl) ? mediaUrl : `${siteBase(env, baseOrigin)}${mediaUrl}`;
    if (!/^https?:\/\//.test(abs)) {
      return call("sendMessage", { text: `${content ? content + "\n" : ""}${mediaUrl}` });
    }
    const isVideo = mediaUrl.includes("/video/") || /\.(mp4|mov|webm|m4v)$/i.test(mediaUrl);
    if (isVideo) return call("sendVideo", { video: abs, caption: content || undefined });
    return call("sendPhoto", { photo: abs, caption: content || undefined });
  }
  return call("sendMessage", { text: content || "📎 منشور جديد", disable_web_page_preview: false });
}

async function sendWebhookPostToUrl(
  url: string,
  channels: string[],
  content: string | null,
  mediaUrl: string | null,
  baseOrigin: string,
  env: Env,
): Promise<{ ok: boolean; error?: string }> {
  const abs = mediaUrl && !/^https?:\/\//.test(mediaUrl) ? `${siteBase(env, baseOrigin)}${mediaUrl}` : mediaUrl;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        site: "رياض المتقين",
        channels,
        content,
        media_url: abs,
        sent_at: new Date().toISOString(),
      }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function loadUserPublishCreds(
  env: Env,
  userId: number,
): Promise<{ telegram?: { bot_token: string; chat_id: string }; webhook?: { url: string } }> {
  const out: { telegram?: { bot_token: string; chat_id: string }; webhook?: { url: string } } = {};
  try {
    const { results } = await env.DB.prepare(
      `SELECT channel, config_json FROM social_connections
        WHERE user_id = ? AND is_active = 1 AND channel IN ('telegram','webhook')`,
    ).bind(userId).all<{ channel: string; config_json: string }>();
    for (const row of results || []) {
      let cfg: Record<string, string> = {};
      try { cfg = JSON.parse(row.config_json || "{}"); } catch { cfg = {}; }
      if (row.channel === "telegram" && cfg.bot_token && cfg.chat_id) {
        out.telegram = { bot_token: String(cfg.bot_token), chat_id: String(cfg.chat_id) };
      }
      if (row.channel === "webhook" && cfg.url) {
        out.webhook = { url: String(cfg.url) };
      }
    }
  } catch {
    // الجدول قد لا يكون مُرحَّلاً بعد
  }
  return out;
}

/** رفع صورة/صوت/مستند إلى R2 وإرجاع رابطه. */
async function uploadMedia(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const entry = form.get("file");
  if (entry == null || typeof entry === "string") return json({ ok: false, error: "لم يُرفَق ملف." }, 400);
  const file = entry as unknown as {
    size: number;
    type: string;
    name: string;
    stream(): ReadableStream;
  };

  // الصور والصوت وفيديو المونتاج ومستندات PDF تُخزَّن في R2.
  const kindRaw = String(form.get("kind") ?? "image");
  const kind =
    kindRaw === "audio" ? "audio" :
    kindRaw === "video" ? "video" :
    kindRaw === "document" ? "document" : "image";
  const limits = { audio: 50, image: 10, video: 100, document: 40 } as const;
  const maxBytes = limits[kind] * 1024 * 1024;
  if (file.size > maxBytes) return json({ ok: false, error: "حجم الملف كبير جداً." }, 413);
  const type = (file.type || "").toLowerCase();
  if (kind === "document") {
    const okDoc = type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!okDoc) return json({ ok: false, error: "يُقبل ملف PDF فقط للمستندات." }, 415);
  } else if (!type.startsWith(`${kind}/`)) {
    return json({ ok: false, error: "نوع الملف غير مدعوم." }, 415);
  }
  // قائمة بيضاء صارمة للصور: نمنع SVG/HTML (تنفّذ سكربتات إن قُدّمت من نفس الأصل) — XSS مخزّن.
  const allowedImage = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];
  if (kind === "image" && !allowedImage.includes(type)) {
    return json({ ok: false, error: "صيغة الصورة غير مدعومة (JPG/PNG/GIF/WebP/AVIF فقط)." }, 415);
  }

  const ext = (file.name.split(".").pop() || (kind === "document" ? "pdf" : "bin"))
    .toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const key = `${kind}/${crypto.randomUUID()}.${ext}`;
  // البثّ مباشرةً إلى R2 (لا arrayBuffer) لتفادي تجاوز حدّ ذاكرة الـ isolate مع الفيديو.
  const contentType = kind === "document" ? (type || "application/pdf") : file.type;
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType } });
  return json({ ok: true, key, url: `/api/media/${key}`, mime: contentType, bytes: file.size }, 201);
}

async function handleTeacher(
  request: Request,
  env: Env,
  user: AuthUser,
  path: string,
  route: string,
): Promise<Response> {
  // رفع الوسائط
  if (route === "POST /api/teacher/media") return uploadMedia(request, env);

  // قائمة الدروس (تشمل المسودّات) — المعلّم يرى محتواه فقط، الأدمن يرى الكلّ.
  if (route === "GET /api/teacher/lessons") {
    const own = user.role !== "admin";
    const { results } = await env.DB.prepare(
      `SELECT id, title, doctor_name, type, youtube_id, cover_image, status,
              scheduled_at, is_published, is_members_only, approval_status, created_at
         FROM lessons${own ? " WHERE author_id = ?" : ""} ORDER BY created_at DESC`,
    ).bind(...(own ? [user.id] : [])).all();
    return json({ ok: true, lessons: results });
  }

  // إنشاء درس
  if (route === "POST /api/teacher/lessons") {
    const b = await readJson(request);
    const title = String(b.title ?? "").trim();
    if (title.length < 2) return json({ ok: false, error: "العنوان مطلوب." }, 400);

    let type = String(b.type ?? "recorded");
    if (!["live", "recorded", "youtube"].includes(type)) type = "recorded";
    const doctor = String(b.doctor_name ?? "").trim() || null;
    const description = String(b.description ?? "").trim() || null;
    const youtubeId = b.youtube_id ? extractYouTubeId(String(b.youtube_id)) : null;
    if (type === "youtube" && !youtubeId) {
      return json({ ok: false, error: "رابط يوتيوب غير صالح." }, 400);
    }
    const cover = b.cover_image ? String(b.cover_image) : null;
    const scheduledAt = b.scheduled_at ? String(b.scheduled_at) : null;
    const membersOnly = b.is_members_only ? 1 : 0;
    const courseId = Number.isFinite(Number(b.course_id)) ? Number(b.course_id) : null;

    let status = "published";
    if (type === "live") status = b.mode === "schedule" ? "scheduled" : "live";
    else if (b.status === "draft") status = "draft";
    let isPublished = status === "draft" ? 0 : 1;

    // البث المباشر الآن يتطلّب معرّف يوتيوب لايف لعرضه للزوّار.
    if (type === "live" && b.mode !== "schedule" && !youtubeId) {
      return json({ ok: false, error: "أدخِل رابط أو معرّف بث يوتيوب لايف لعرضه على الموقع." }, 400);
    }

    // محتوى المعلّم يحتاج موافقة مدير الموقع قبل النشر؛ الأدمن يُنشَر مباشرةً.
    // استثناء: البث الحيّ يظهر فوراً للزوّار (مع بقاء سجلّ الاعتماد إن لزم لاحقاً كمسجّل).
    const needsApproval = user.role === "teacher" && status !== "live";
    const approval = needsApproval ? "pending" : "approved";
    if (needsApproval) isPublished = 0;
    if (status === "live") isPublished = 1;

    const res = await env.DB.prepare(
      `INSERT INTO lessons (course_id, title, description, doctor_name, type, youtube_id, cover_image,
                            status, scheduled_at, is_published, is_members_only, author_id, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(courseId, title, description, doctor, type, youtubeId, cover, status, scheduledAt, isPublished, membersOnly, user.id, approval)
      .run();
    const id = Number(res.meta.last_row_id);
    await audit(env, user.email, "lesson.create", `lesson:${id}`);
    if (needsApproval) {
      await notifyRole(env, "manager", {
        type: "content_pending",
        title: "درس بانتظار الموافقة",
        body: `${user.name} أضاف درساً: «${title}».`,
        link: "/manager/approvals",
        email: true,
      });
    }
    return json({ ok: true, id, approval_status: approval }, 201);
  }

  // عمليات على درس بعينه
  const m = path.match(/^\/api\/teacher\/lessons\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    // المعلّم يعدّل/يحذف محتواه فقط؛ الأدمن يتصرّف في كلّ شيء.
    const isAdmin = user.role === "admin";
    const ownClause = isAdmin ? "" : " AND author_id = ?";
    if (request.method === "DELETE") {
      const r = await env.DB.prepare(`DELETE FROM lessons WHERE id = ?${ownClause}`)
        .bind(...(isAdmin ? [id] : [id, user.id])).run();
      if (!r.meta.changes) return json({ ok: false, error: "غير موجود أو لا تملك صلاحيّته." }, 403);
      await audit(env, user.email, "lesson.delete", `lesson:${id}`);
      return json({ ok: true });
    }
    if (request.method === "PATCH") {
      const b = await readJson(request);
      const fields: string[] = [];
      const vals: (string | number | null)[] = [];
      const allowed = ["title", "description", "doctor_name", "cover_image", "status", "scheduled_at"];
      for (const k of allowed) {
        if (k in b) {
          fields.push(`${k} = ?`);
          vals.push(b[k] === null ? null : String(b[k]));
        }
      }
      if ("youtube_id" in b) {
        fields.push("youtube_id = ?");
        vals.push(b.youtube_id ? extractYouTubeId(String(b.youtube_id)) : null);
      }
      if ("course_id" in b) {
        fields.push("course_id = ?");
        const cid = b.course_id === null || b.course_id === "" ? null : Number(b.course_id);
        vals.push(cid != null && Number.isFinite(cid) ? cid : null);
      }
      if ("is_members_only" in b) {
        fields.push("is_members_only = ?");
        vals.push(b.is_members_only ? 1 : 0);
      }
      if ("status" in b) {
        const next = String(b.status);
        // إنهاء البث: يتحوّل إلى مسجّل منشور ويظهر في المكتبة.
        if (next === "published") {
          fields.push("type = CASE WHEN type = 'live' THEN 'youtube' ELSE type END");
          fields.push("is_published = 1");
          fields.push("approval_status = 'approved'");
        } else {
          fields.push("is_published = CASE WHEN approval_status = 'approved' THEN ? ELSE 0 END");
          vals.push(next === "draft" ? 0 : 1);
        }
      }
      if (!fields.length) return json({ ok: false, error: "لا تغييرات." }, 400);
      vals.push(id);
      if (!isAdmin) vals.push(user.id);
      const r = await env.DB.prepare(`UPDATE lessons SET ${fields.join(", ")} WHERE id = ?${ownClause}`)
        .bind(...vals).run();
      if (!r.meta.changes) return json({ ok: false, error: "غير موجود أو لا تملك صلاحيّته." }, 403);
      await audit(env, user.email, "lesson.update", `lesson:${id}`);
      return json({ ok: true });
    }
  }

  // إحصاءات اللوحة
  if (route === "GET /api/teacher/stats") {
    const row = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM lessons) AS lessons,
         (SELECT COUNT(*) FROM users WHERE role = 'student') AS students,
         (SELECT COUNT(*) FROM clips) AS clips,
         (SELECT COUNT(*) FROM follows WHERE teacher_id = ?1) AS followers`,
    ).bind(user.id).first();
    return json({ ok: true, stats: row });
  }

  // ===== المقاطع =====
  if (route === "GET /api/teacher/clips") {
    const own = user.role !== "admin";
    const { results } = await env.DB.prepare(
      `SELECT id, title, doctor_name, youtube_id, video_url, duration, is_published, approval_status, created_at
         FROM clips${own ? " WHERE author_id = ?" : ""} ORDER BY created_at DESC`,
    ).bind(...(own ? [user.id] : [])).all();
    return json({ ok: true, clips: results });
  }
  if (route === "POST /api/teacher/clips") {
    const b = await readJson(request);
    const title = String(b.title ?? "").trim();
    if (title.length < 2) return json({ ok: false, error: "العنوان مطلوب." }, 400);
    const youtubeId = b.youtube_id ? extractYouTubeId(String(b.youtube_id)) : null;
    const videoUrl = b.video_url ? String(b.video_url).slice(0, 500) : null;
    // مسارٌ نسبيّ (/...) أو http(s) فقط — يمنع javascript:/data: ونحوها.
    if (videoUrl && !/^(https?:\/\/|\/(?!\/))/i.test(videoUrl)) {
      return json({ ok: false, error: "رابط الفيديو غير صالح." }, 400);
    }
    const doctor = String(b.doctor_name ?? "").trim() || null;
    const duration = Number.isFinite(Number(b.duration)) ? Math.max(0, Math.floor(Number(b.duration))) : null;
    // محتوى المعلّم يحتاج موافقة مدير الموقع قبل النشر؛ الأدمن يُنشَر مباشرةً.
    const needsApproval = user.role === "teacher";
    const approval = needsApproval ? "pending" : "approved";
    const published = needsApproval ? 0 : 1;
    const res = await env.DB.prepare(
      "INSERT INTO clips (title, doctor_name, youtube_id, video_url, duration, author_id, approval_status, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(title, doctor, youtubeId, videoUrl, duration, user.id, approval, published)
      .run();
    const id = Number(res.meta.last_row_id);
    await audit(env, user.email, "clip.create", `clip:${id}`);
    if (needsApproval) {
      await notifyRole(env, "manager", {
        type: "content_pending",
        title: "مقطع بانتظار الموافقة",
        body: `${user.name} رفع مقطعاً: «${title}».`,
        link: "/manager/approvals",
        email: true,
      });
    }
    return json({ ok: true, id, approval_status: approval }, 201);
  }
  const mc = path.match(/^\/api\/teacher\/clips\/(\d+)$/);
  if (mc && request.method === "DELETE") {
    const id = Number(mc[1]);
    const isAdmin = user.role === "admin";
    const r = await env.DB.prepare(`DELETE FROM clips WHERE id = ?${isAdmin ? "" : " AND author_id = ?"}`)
      .bind(...(isAdmin ? [id] : [id, user.id])).run();
    if (!r.meta.changes) return json({ ok: false, error: "غير موجود أو لا تملك صلاحيّته." }, 403);
    await audit(env, user.email, "clip.delete", `clip:${id}`);
    return json({ ok: true });
  }

  // ===== الصوتيات (الصوت يُرفع إلى R2 عبر /api/teacher/media kind=audio) =====
  if (route === "GET /api/teacher/audio") {
    const own = user.role !== "admin";
    const { results } = await env.DB.prepare(
      `SELECT id, title, doctor_name, audio_url, duration, approval_status, is_published, created_at
         FROM audio_posts${own ? " WHERE author_id = ?" : ""} ORDER BY created_at DESC`,
    ).bind(...(own ? [user.id] : [])).all();
    return json({ ok: true, audio: results });
  }
  if (route === "POST /api/teacher/audio") {
    const b = await readJson(request);
    const title = String(b.title ?? "").trim();
    if (title.length < 2) return json({ ok: false, error: "العنوان مطلوب." }, 400);
    const doctor = String(b.doctor_name ?? "").trim() || null;
    const description = String(b.description ?? "").trim() || null;
    const audioUrl = b.audio_url ? String(b.audio_url) : null;
    const duration = Number.isFinite(Number(b.duration)) ? Math.max(0, Math.floor(Number(b.duration))) : null;
    const needsApproval = user.role === "teacher";
    const approval = needsApproval ? "pending" : "approved";
    const published = needsApproval ? 0 : 1;
    const res = await env.DB.prepare(
      `INSERT INTO audio_posts (title, description, doctor_name, audio_url, duration, author_id, approval_status, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(title, description, doctor, audioUrl, duration, user.id, approval, published)
      .run();
    const id = Number(res.meta.last_row_id);
    await audit(env, user.email, "audio.create", `audio:${id}`);
    if (needsApproval) {
      await notifyRole(env, "manager", {
        type: "content_pending",
        title: "صوت بانتظار الموافقة",
        body: `${user.name} رفع مادّة صوتية: «${title}».`,
        link: "/manager/approvals",
        email: true,
      });
    }
    return json({ ok: true, id, approval_status: approval }, 201);
  }
  const ma = path.match(/^\/api\/teacher\/audio\/(\d+)$/);
  if (ma && request.method === "DELETE") {
    const id = Number(ma[1]);
    const isAdmin = user.role === "admin";
    const r = await env.DB.prepare(`DELETE FROM audio_posts WHERE id = ?${isAdmin ? "" : " AND author_id = ?"}`)
      .bind(...(isAdmin ? [id] : [id, user.id])).run();
    if (!r.meta.changes) return json({ ok: false, error: "غير موجود أو لا تملك صلاحيّته." }, 403);
    await audit(env, user.email, "audio.delete", `audio:${id}`);
    return json({ ok: true });
  }

  // ===== تحليل البيانات (إحصاءات حقيقية من D1) =====
  if (route === "GET /api/teacher/analytics") {
    const overview = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM lessons)                           AS lessons,
         (SELECT COUNT(*) FROM users WHERE role = 'student')      AS students,
         (SELECT COUNT(*) FROM bookmarks)                         AS saves,
         (SELECT COUNT(*) FROM progress WHERE completed = 1)      AS completions`,
    ).first();

    const { results: lessons } = await env.DB.prepare(
      `SELECT l.id, l.title, l.doctor_name,
              (SELECT COUNT(*) FROM bookmarks b WHERE b.lesson_id = l.id)                       AS saves,
              (SELECT COUNT(*) FROM progress  p WHERE p.lesson_id = l.id)                       AS starts,
              (SELECT COUNT(*) FROM progress  p WHERE p.lesson_id = l.id AND p.completed = 1)   AS completions
         FROM lessons l
        ORDER BY saves DESC, starts DESC, l.created_at DESC
        LIMIT 20`,
    ).all();

    const { results: signups } = await env.DB.prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count
         FROM users
        WHERE role = 'student' AND created_at >= date('now', '-6 days')
        GROUP BY date(created_at)`,
    ).all();

    // حركة الزوّار (آخر ٣٠ يوماً) + المصادر + أكثر الصفحات.
    const traffic = await env.DB.prepare(
      `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
         FROM page_views WHERE created_at >= datetime('now','-30 days')`,
    ).first();
    const { results: trafficByDay } = await env.DB.prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
         FROM page_views WHERE created_at >= date('now','-6 days')
        GROUP BY date(created_at)`,
    ).all();
    const { results: topSources } = await env.DB.prepare(
      `SELECT COALESCE(source,'مباشر') AS source, COUNT(*) AS c
         FROM page_views WHERE created_at >= datetime('now','-30 days')
        GROUP BY source ORDER BY c DESC LIMIT 8`,
    ).all();
    const { results: topPages } = await env.DB.prepare(
      `SELECT path, COUNT(*) AS c
         FROM page_views WHERE created_at >= datetime('now','-30 days')
        GROUP BY path ORDER BY c DESC LIMIT 8`,
    ).all();

    return json({ ok: true, overview, lessons, signups, traffic, trafficByDay, topSources, topPages });
  }

  // ===== لوحة المعلّم: المتابعون وأداء المقاطع =====
  if (route === "GET /api/teacher/dashboard") {
    // عدد المتابعين + اتّجاه آخر ٧ أيام.
    const followers = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM follows WHERE teacher_id = ?",
    ).bind(user.id).first<{ c: number }>();
    const { results: followersByDay } = await env.DB.prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count
         FROM follows
        WHERE teacher_id = ? AND created_at >= date('now','-6 days')
        GROUP BY date(created_at)`,
    ).bind(user.id).all();

    // إجماليّات المحتوى (مقاطع هذا المعلّم).
    const totals = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM clips c WHERE c.author_id = ?1)                                  AS clips,
         (SELECT COUNT(DISTINCT COALESCE(e.user_id, e.visitor_id))
            FROM content_events e JOIN clips c ON c.id = e.clip_id
           WHERE c.author_id = ?1 AND e.kind = 'view')                                          AS views,
         (SELECT COUNT(*)
            FROM content_events e JOIN clips c ON c.id = e.clip_id
           WHERE c.author_id = ?1 AND e.kind = 'download')                                      AS downloads`,
    ).bind(user.id).first();

    // أداء كل مقطع: مشاهدون مختلفون + تحميلات.
    const { results: clips } = await env.DB.prepare(
      `SELECT c.id, c.title, c.doctor_name, c.created_at,
              (SELECT COUNT(DISTINCT COALESCE(e.user_id, e.visitor_id))
                 FROM content_events e WHERE e.clip_id = c.id AND e.kind = 'view')      AS views,
              (SELECT COUNT(*)
                 FROM content_events e WHERE e.clip_id = c.id AND e.kind = 'download')  AS downloads
         FROM clips c
        WHERE c.author_id = ?
        ORDER BY views DESC, downloads DESC, c.created_at DESC
        LIMIT 50`,
    ).bind(user.id).all();

    return json({ ok: true, followers: followers ? followers.c : 0, followersByDay, totals, clips });
  }

  // ===== ربطات التواصل الخاصة بالمستخدم (كلٌّ على قناته) =====
  if (route === "GET /api/teacher/social") {
    let results: Record<string, unknown>[] = [];
    try {
      const q = await env.DB.prepare(
        `SELECT id, channel, label, is_active, updated_at, config_json
           FROM social_connections WHERE user_id = ? ORDER BY channel, id`,
      ).bind(user.id).all<Record<string, unknown>>();
      results = (q.results || []).map((row) => {
        let hint = "";
        try {
          const cfg = JSON.parse(String(row.config_json || "{}")) as Record<string, string>;
          if (row.channel === "telegram") hint = cfg.chat_id ? `chat:${cfg.chat_id}` : "";
          if (row.channel === "webhook") hint = cfg.url ? String(cfg.url).slice(0, 48) + "…" : "";
        } catch { /* ignore */ }
        return {
          id: row.id,
          channel: row.channel,
          label: row.label,
          is_active: row.is_active,
          updated_at: row.updated_at,
          hint,
        };
      });
    } catch {
      results = [];
    }
    const yt = await env.DB.prepare(
      "SELECT channel_title, channel_id FROM youtube_accounts WHERE teacher_id = ?",
    ).bind(user.id).first<{ channel_title: string | null; channel_id: string | null }>();
    const creds = await loadUserPublishCreds(env, user.id);
    return json({
      ok: true,
      connections: results,
      youtube: yt ? { connected: true, title: yt.channel_title, id: yt.channel_id } : { connected: false },
      ready: {
        telegram: Boolean(creds.telegram),
        webhook: Boolean(creds.webhook),
        site_telegram_fallback: telegramConfigured(env),
        site_webhook_fallback: webhookConfigured(env),
      },
    });
  }

  if (route === "POST /api/teacher/social") {
    const b = await readJson(request);
    const channel = String(b.channel ?? "");
    if (channel !== "telegram" && channel !== "webhook") {
      return json({ ok: false, error: "القناة غير مدعومة (telegram أو webhook)." }, 400);
    }
    const label = String(b.label ?? "افتراضي").trim().slice(0, 40) || "افتراضي";
    let config: Record<string, string> = {};
    if (channel === "telegram") {
      const bot = String(b.bot_token ?? "").trim();
      const chat = String(b.chat_id ?? "").trim();
      if (!bot || !chat) return json({ ok: false, error: "أدخِل bot_token و chat_id لقناتك." }, 400);
      const test = await fetch(`https://api.telegram.org/bot${bot}/getChat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat }),
      });
      const td = (await test.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (!test.ok || !td.ok) {
        return json({ ok: false, error: "تعذّر التحقق من تيليجرام: " + (td.description || String(test.status)) }, 400);
      }
      config = { bot_token: bot, chat_id: chat };
    } else {
      const url = String(b.url ?? "").trim();
      if (!/^https:\/\//i.test(url)) return json({ ok: false, error: "رابط Webhook يجب أن يبدأ بـ https://" }, 400);
      config = { url };
    }
    await env.DB.prepare(
      `INSERT INTO social_connections (user_id, channel, label, config_json, is_active, updated_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))
       ON CONFLICT(user_id, channel, label) DO UPDATE SET
         config_json = excluded.config_json,
         is_active = 1,
         updated_at = datetime('now')`,
    ).bind(user.id, channel, label, JSON.stringify(config)).run();
    await audit(env, user.email, "social.connect", `${channel}:${label}`);
    return json({ ok: true }, 201);
  }

  const sdel = path.match(/^\/api\/teacher\/social\/(\d+)$/);
  if (sdel && request.method === "DELETE") {
    const id = Number(sdel[1]);
    await env.DB.prepare(`DELETE FROM social_connections WHERE id = ? AND user_id = ?`)
      .bind(id, user.id).run();
    await audit(env, user.email, "social.disconnect", `id:${id}`);
    return json({ ok: true });
  }

  // ===== النشر على القنوات — كل مستخدم على قناته الخاصة =====
  if (route === "GET /api/teacher/posts") {
    const { results } = await env.DB.prepare(
      `SELECT id, content, media_url, channels, scheduled_at, status, approval_status, delivery_log, created_at
         FROM channel_posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(user.id)
      .all();
    const creds = await loadUserPublishCreds(env, user.id);
    return json({
      ok: true,
      posts: results,
      connections: {
        telegram: Boolean(creds.telegram) || telegramConfigured(env),
        webhook: Boolean(creds.webhook) || webhookConfigured(env),
        youtube_oauth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        user_telegram: Boolean(creds.telegram),
        user_webhook: Boolean(creds.webhook),
      },
      channels: CHANNELS,
    });
  }

  if (route === "POST /api/teacher/posts") {
    const b = await readJson(request);
    const content = String(b.content ?? "").trim();
    const mediaUrl = b.media_url ? String(b.media_url) : null;
    const channels = Array.isArray(b.channels)
      ? (b.channels.map(String).filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c)))
      : [];
    if (!content && !mediaUrl) return json({ ok: false, error: "اكتب محتوى أو أرفِق وسائط." }, 400);
    if (!channels.length) return json({ ok: false, error: "اختَر قناةً واحدةً على الأقل." }, 400);

    const schedule = b.action === "schedule";
    const scheduledAt = schedule && b.scheduled_at ? String(b.scheduled_at) : null;
    if (schedule && !scheduledAt) return json({ ok: false, error: "حدّد موعد الجدولة." }, 400);

    // قنوات المستخدم الخاصة: لا موافقة مدير — كلٌّ ينشر على قناته.
    const approval = "approved";
    const initial = schedule ? "scheduled" : "queued";
    const res = await env.DB.prepare(
      `INSERT INTO channel_posts (author_id, content, media_url, channels, scheduled_at, status, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(user.id, content || null, mediaUrl, JSON.stringify(channels), scheduledAt, initial, approval)
      .run();
    const id = Number(res.meta.last_row_id);
    await audit(env, user.email, "post.create", `post:${id}`);

    let status = initial;
    let delivered: { channel: Channel; ok: boolean; error?: string; via?: string }[] = [];
    if (!schedule) {
      const origin = new URL(request.url).origin;
      const creds = await loadUserPublishCreds(env, user.id);
      const out = await deliverToChannels(env, channels, content || null, mediaUrl, origin, creds);
      delivered = out.delivered;
      status = out.status;
      await env.DB.prepare(
        `UPDATE channel_posts SET status = ?, delivery_log = ? WHERE id = ?`,
      ).bind(status, JSON.stringify({ at: new Date().toISOString(), delivered }), id).run();
    }
    return json({ ok: true, id, status, delivered, approval_status: approval }, 201);
  }

  const retry = path.match(/^\/api\/teacher\/posts\/(\d+)\/retry$/);
  if (retry && request.method === "POST") {
    const id = Number(retry[1]);
    const row = await env.DB.prepare(
      `SELECT id, content, media_url, channels, status, author_id
         FROM channel_posts WHERE id = ? AND author_id = ?`,
    ).bind(id, user.id).first<{
      id: number; content: string | null; media_url: string | null; channels: string; status: string;
    }>();
    if (!row) return json({ ok: false, error: "المنشور غير موجود." }, 404);
    if (row.status === "scheduled") {
      return json({ ok: false, error: "المنشور مجدول — انتظر موعده." }, 409);
    }
    let channels: Channel[] = [];
    try {
      channels = (JSON.parse(row.channels || "[]") as string[])
        .filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c));
    } catch {
      channels = [];
    }
    if (!channels.length) return json({ ok: false, error: "لا قنوات على المنشور." }, 400);
    const origin = new URL(request.url).origin;
    const creds = await loadUserPublishCreds(env, user.id);
    const out = await deliverToChannels(env, channels, row.content, row.media_url, origin, creds);
    await env.DB.prepare(
      `UPDATE channel_posts SET status = ?, delivery_log = ?, approval_status = 'approved' WHERE id = ?`,
    ).bind(out.status, JSON.stringify({ at: new Date().toISOString(), delivered: out.delivered, retry: true }), id).run();
    await audit(env, user.email, "post.retry", `post:${id}`);
    return json({ ok: true, id, status: out.status, delivered: out.delivered });
  }

  const mp = path.match(/^\/api\/teacher\/posts\/(\d+)$/);
  if (mp && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM channel_posts WHERE id = ? AND author_id = ?")
      .bind(Number(mp[1]), user.id)
      .run();
    await audit(env, user.email, "post.delete", `post:${mp[1]}`);
    return json({ ok: true });
  }

  // ===== تكامل يوتيوب =====
  if (path.startsWith("/api/teacher/youtube/")) {
    return handleYouTube(request, env, user, route);
  }

  // ===== الدورات (سلاسل علمية) =====
  if (route === "GET /api/teacher/courses") {
    const own = user.role !== "admin";
    const { results } = await env.DB.prepare(
      `SELECT id, title, slug, category, description, is_published, created_at
         FROM courses${own ? " WHERE author_id = ? OR author_id IS NULL" : ""}
        ORDER BY sort_order ASC, created_at DESC`,
    ).bind(...(own ? [user.id] : [])).all();
    return json({ ok: true, courses: results });
  }
  if (route === "POST /api/teacher/courses") {
    const b = await readJson(request);
    const title = String(b.title ?? "").trim();
    if (title.length < 2) return json({ ok: false, error: "عنوان الدورة مطلوب." }, 400);
    const baseSlug = title
      .toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `course-${Date.now()}`;
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
    const category = String(b.category ?? "").trim().slice(0, 80) || null;
    const description = String(b.description ?? "").trim().slice(0, 2000) || null;
    const res = await env.DB.prepare(
      `INSERT INTO courses (title, slug, category, description, author_id, is_published, approval_status)
       VALUES (?, ?, ?, ?, ?, 1, 'approved')`,
    ).bind(title, slug, category, description, user.id).run();
    const id = Number(res.meta.last_row_id);
    await audit(env, user.email, "course.create", `course:${id}`);
    return json({ ok: true, id, slug }, 201);
  }
  const mCourse = path.match(/^\/api\/teacher\/courses\/(\d+)$/);
  if (mCourse && request.method === "DELETE") {
    const id = Number(mCourse[1]);
    const isAdmin = user.role === "admin";
    const r = await env.DB.prepare(
      `DELETE FROM courses WHERE id = ?${isAdmin ? "" : " AND author_id = ?"}`,
    ).bind(...(isAdmin ? [id] : [id, user.id])).run();
    if (!r.meta.changes) return json({ ok: false, error: "غير موجود أو لا تملك صلاحيّته." }, 403);
    await audit(env, user.email, "course.delete", `course:${id}`);
    return json({ ok: true });
  }

  // ===== مستندات PDF للتدريب =====
  if (route === "GET /api/teacher/documents") {
    const own = user.role === "teacher";
    const { results } = await env.DB.prepare(
      `SELECT id, title, r2_key, mime, bytes, source_rights, approval_status, notes, created_at
         FROM ai_documents${own ? " WHERE uploaded_by = ?" : ""}
        ORDER BY created_at DESC LIMIT 100`,
    ).bind(...(own ? [user.id] : [])).all();
    return json({ ok: true, documents: results });
  }
  if (route === "POST /api/teacher/documents") {
    const b = await readJson(request);
    const title = String(b.title ?? "").trim();
    const r2Key = String(b.r2_key ?? "").trim();
    const rights = String(b.source_rights ?? "").trim();
    if (title.length < 2) return json({ ok: false, error: "عنوان المستند مطلوب." }, 400);
    if (!r2Key.startsWith("document/")) return json({ ok: false, error: "ارفع ملف PDF أولاً." }, 400);
    if (!["public_domain", "publisher_permission", "official"].includes(rights)) {
      return json({ ok: false, error: "حدّد مصدر الحقّ في النشر بوضوح." }, 400);
    }
    // المدير/الأدمن: معتمد تلقائياً. المعلّم: معلّق حتى اعتماد المدير.
    const auto = user.role === "manager" || user.role === "admin";
    const approval = auto ? "approved" : "pending";
    const status = auto ? "active" : "active";
    const mime = String(b.mime ?? "application/pdf").slice(0, 80);
    const bytes = Number.isFinite(Number(b.bytes)) ? Math.max(0, Math.floor(Number(b.bytes))) : null;
    const res = await env.DB.prepare(
      `INSERT INTO ai_documents (title, r2_key, uploaded_by, status, approval_status, mime, bytes, source_rights)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(title, r2Key, user.id, status, approval, mime, bytes, rights).run();
    const id = Number(res.meta.last_row_id);
    await audit(env, user.email, "document.create", `document:${id}`);
    if (!auto) {
      await notifyRole(env, "manager", {
        type: "content_pending",
        title: "مستند بانتظار الاعتماد",
        body: `${user.name} رفع كتاباً/مستنداً: «${title}».`,
        link: "/manager/training",
        email: true,
      });
    }
    return json({ ok: true, id, approval_status: approval }, 201);
  }

  // بقيّة واجهات المعلّم تُربط لاحقاً.
  return notReady("teacher." + path.slice("/api/teacher/".length));
}

async function handleYouTube(
  request: Request,
  env: Env,
  user: AuthUser,
  route: string,
): Promise<Response> {
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/teacher/youtube/callback`;

  // حالة الربط
  if (route === "GET /api/teacher/youtube/status") {
    const acc = await env.DB.prepare(
      "SELECT channel_title, refresh_token FROM youtube_accounts WHERE teacher_id = ?",
    )
      .bind(user.id)
      .first<{ channel_title: string | null; refresh_token: string | null }>();
    return json({
      ok: true,
      configured: yt.isConfigured(env),
      connected: Boolean(acc && acc.refresh_token),
      channel: acc?.channel_title ?? null,
    });
  }

  // بدء الربط
  if (route === "GET /api/teacher/youtube/connect") {
    if (!yt.isConfigured(env)) {
      return json({ ok: false, error: "لم تُضبَط مفاتيح Google بعد. راجِع دليل الإعداد." }, 503);
    }
    const state = crypto.randomUUID();
    const cookie = `yt_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
    return redirect(yt.buildAuthUrl(env, redirectUri, state), cookie);
  }

  // عودة Google
  if (route === "GET /api/teacher/youtube/callback") {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const saved = readCookie(request, "yt_state");
    if (!code || !state || !saved || state !== saved) {
      return redirect(`${origin}/teacher/lessons?yt=error`);
    }
    try {
      const tokens = await yt.exchangeCode(env, code, redirectUri);
      const channel = await yt.getChannel(tokens.access_token);
      await yt.saveAccount(env, user.id, tokens, channel);
      await audit(env, user.email, "youtube.connect", channel?.id ?? "");
      return redirect(`${origin}/teacher/lessons?yt=connected`, "yt_state=; Path=/; Max-Age=0");
    } catch {
      return redirect(`${origin}/teacher/lessons?yt=error`);
    }
  }

  // فكّ الربط
  if (route === "POST /api/teacher/youtube/disconnect") {
    await env.DB.prepare("DELETE FROM youtube_accounts WHERE teacher_id = ?").bind(user.id).run();
    await audit(env, user.email, "youtube.disconnect", "");
    return json({ ok: true });
  }

  // الرفع التلقائي إلى يوتيوب + إنشاء درس
  if (route === "POST /api/teacher/youtube/upload") {
    if (!yt.isConfigured(env)) return json({ ok: false, error: "تكامل يوتيوب غير مُعَدّ." }, 503);
    const accessToken = await yt.getValidAccessToken(env, user.id);
    if (!accessToken) return json({ ok: false, error: "اربط حساب يوتيوب أولاً." }, 400);

    const form = await request.formData();
    const fileEntry = form.get("file");
    if (fileEntry == null || typeof fileEntry === "string") return json({ ok: false, error: "لم يُرفَق ملف فيديو." }, 400);
    const file = fileEntry as unknown as { size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };
    if (file.size > 256 * 1024 * 1024) {
      return json({ ok: false, error: "حجم الفيديو يتجاوز الحدّ الحالي (256MB)." }, 413);
    }
    const title = String(form.get("title") ?? "").trim();
    if (title.length < 2) return json({ ok: false, error: "العنوان مطلوب." }, 400);
    const doctor = String(form.get("doctor_name") ?? "").trim();
    const privacy = ["public", "unlisted", "private"].includes(String(form.get("privacy")))
      ? String(form.get("privacy"))
      : "public";
    const description = doctor ? `المحاضر: ${doctor}` : "";

    try {
      const bytes = await file.arrayBuffer();
      const video = await yt.uploadVideo(accessToken, bytes, file.type || "video/*", { title, description, privacy });
      const res = await env.DB.prepare(
        `INSERT INTO lessons (title, description, doctor_name, type, youtube_id, status, is_published)
         VALUES (?, ?, ?, 'youtube', ?, 'published', 1)`,
      )
        .bind(title, description || null, doctor || null, video.id)
        .run();
      const lessonId = Number(res.meta.last_row_id);
      await audit(env, user.email, "youtube.upload", `video:${video.id}`);
      return json({ ok: true, youtube_id: video.id, lesson_id: lessonId }, 201);
    } catch (err) {
      return json({ ok: false, error: "تعذّر الرفع إلى يوتيوب: " + String((err as Error).message) }, 502);
    }
  }

  return notReady("teacher.youtube");
}

// نطاقات Google Translate (تُحمَّل عند الطلب فقط عند ضغط المستخدم زرّ اللغة).
const GT_SCRIPT = "https://translate.google.com https://translate.googleapis.com https://www.gstatic.com";
const GT_IMG = "https://www.gstatic.com https://translate.googleapis.com https://*.gstatic.com";
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${GT_SCRIPT}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://i.ytimg.com https://*.ytimg.com ${GT_IMG}`,
  "media-src 'self' blob: https://cdn.islamic.network",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://translate.google.com",
  // api.aladhan.com لمواقيت الصلاة؛ openstreetmap/overpass لخريطة المساجد؛ alquran.cloud للقرآن؛ google لخدمة الترجمة.
  "connect-src 'self' https://api.aladhan.com https://overpass-api.de https://nominatim.openstreetmap.org https://api.alquran.cloud https://translate.googleapis.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

// CSP خاصّة بصفحة المونتاج: تسمح بمعالجة الفيديو داخل المتصفّح عبر ffmpeg.wasm
// (تنفيذ WebAssembly + عاملٌ من blob). محصورةٌ بهذه الصفحة وحدها لأقصى تحصين.
const EDITOR_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://i.ytimg.com https://*.ytimg.com",
  "media-src 'self' blob:",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "connect-src 'self' blob: https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/** يضيف ترويسات الأمان لكل استجابة (وCSP لصفحات HTML). */
function harden(res: Response, pathname = ""): Response {
  const headers = new Headers(res.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  if ((headers.get("content-type") || "").includes("text/html")) {
    // صفحة المونتاج تحتاج سياسةً موسّعةً قليلاً لتشغيل معالج الفيديو محلياً.
    const isEditor = pathname === "/teacher/editor" || pathname === "/teacher/editor.html";
    headers.set("Content-Security-Policy", isEditor ? EDITOR_CSP : CONTENT_SECURITY_POLICY);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** يعالج المنشورات المجدولة المستحقّة (يُستدعى من مُشغّل cron). */
async function processScheduledPosts(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, author_id, content, media_url, channels FROM channel_posts
      WHERE status = 'scheduled' AND approval_status = 'approved'
        AND scheduled_at IS NOT NULL AND scheduled_at <= datetime('now')
      ORDER BY scheduled_at ASC LIMIT 25`,
  ).all<{ id: number; author_id: number; content: string | null; media_url: string | null; channels: string | null }>();

  for (const p of results) {
    let channels: Channel[] = [];
    try {
      channels = (JSON.parse(p.channels || "[]") as string[])
        .filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c));
    } catch {
      channels = [];
    }
    const creds = await loadUserPublishCreds(env, p.author_id);
    const out = await deliverToChannels(env, channels, p.content, p.media_url, env.SITE_URL || "", creds);
    await env.DB.prepare(
      `UPDATE channel_posts SET status = ?, delivery_log = ? WHERE id = ?`,
    ).bind(out.status, JSON.stringify({ at: new Date().toISOString(), delivered: out.delivered, cron: true }), p.id).run();
  }
}

/** تقديم الأصول مع توجيه صفحات المسجد وملف المعلّم الديناميكية. */
async function servePage(request: Request, env: Env, pathname: string): Promise<Response> {
  // /mosque/<slug> → صفحة العرض (ما عدا المسارات الثابتة)
  const mosquePage = pathname.match(/^\/mosque\/([^/]+)\/?$/);
  if (mosquePage) {
    const slug = mosquePage[1];
    if (slug !== "manage" && slug !== "pricing" && slug !== "index.html" && slug !== "view.html") {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/mosque/view.html";
      return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    }
  }
  // /u/<id> → ملف معلّم عام
  const teacherPage = pathname.match(/^\/u\/(\d+)\/?$/);
  if (teacherPage) {
    const assetUrl = new URL(request.url);
    assetUrl.pathname = "/u/view.html";
    return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // توحيد النطاق: www → الجذر. يمنع انقطاع الجلسة بين نطاقَين (الكوكي مرتبطٌ بمضيفٍ واحد).
    if (url.hostname === "www.riyadalmutaqin.com") {
      url.hostname = "riyadalmutaqin.com";
      return Response.redirect(url.toString(), 301);
    }

    const res =
      url.pathname === "/api" || url.pathname.startsWith("/api/")
        ? await handleApi(request, env)
        : await servePage(request, env, url.pathname);

    return harden(res, url.pathname);
  },

  // مُشغّل دوري: ينشر المنشورات المجدولة المستحقّة (انظر crons في wrangler.toml).
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processScheduledPosts(env));
  },
} satisfies ExportedHandler<Env>;
