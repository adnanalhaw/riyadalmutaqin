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

/** ردّ موحّد للنقاط غير المُفعّلة بعد. */
const notReady = (feature: string): Response =>
  json(
    { ok: false, status: "not_implemented", feature, message: "هذه الميزة قيد الإعداد وتُربط في مرحلةٍ لاحقة." },
    501,
  );

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
  if (route === "GET /api/auth/me") {
    const user = await getSessionUser(request, env.DB);
    return json({ ok: true, user });
  }

  // ===== المحتوى العام (قراءة من D1) =====
  if (route === "GET /api/lessons") {
    const { results } = await env.DB.prepare(
      `SELECT id, course_id, title, description, doctor_name, type, youtube_id,
              duration, status, scheduled_at
         FROM lessons
        WHERE is_published = 1
        ORDER BY status = 'live' DESC, sort_order ASC, created_at DESC`,
    ).all();
    return json({ ok: true, lessons: results });
  }
  if (route === "GET /api/clips") {
    const { results } = await env.DB.prepare(
      `SELECT id, title, doctor_name, youtube_id, thumbnail, duration
         FROM clips
        WHERE is_published = 1
        ORDER BY created_at DESC`,
    ).all();
    return json({ ok: true, clips: results });
  }
  if (route === "GET /api/audio") {
    const { results } = await env.DB.prepare(
      `SELECT id, title, description, doctor_name, audio_url, background_image, duration
         FROM audio_posts
        ORDER BY created_at DESC`,
    ).all();
    return json({ ok: true, audio: results });
  }

  // ===== المتعلّم: مكتبة الحفظ (يتطلّب تسجيل دخول) =====
  if (path === "/api/library" || path === "/api/library/remove") {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);

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

  // ===== المتعلّم: متابعة التقدّم (يتطلّب تسجيل دخول) =====
  if (path === "/api/progress") {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);

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
    return new Response(obj.body, { headers });
  }

  // ===== المعلّم (يتطلّب دور teacher/admin) =====
  if (path.startsWith("/api/teacher/")) {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.role !== "teacher" && user.role !== "admin") {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    return handleTeacher(request, env, user, path, route);
  }

  return json({ ok: false, error: "Not Found" }, 404);
}

/** تسجيل متعلّم جديد. (المعلّمون يُنشَؤون من الإدارة، لا بالتسجيل الذاتي.) */
async function register(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (name.length < 2 || name.length > 80) return json({ ok: false, error: "الاسم غير صالح." }, 400);
  if (!isValidEmail(email)) return json({ ok: false, error: "البريد الإلكتروني غير صالح." }, 400);
  if (password.length < 8) return json({ ok: false, error: "كلمة المرور يجب أن تكون 8 أحرف فأكثر." }, 400);

  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) return json({ ok: false, error: "هذا البريد مسجّل بالفعل." }, 409);

  const passwordHash = await hashPassword(password);
  const result = await env.DB.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'student')",
  )
    .bind(name, email, passwordHash)
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
    "SELECT id, name, email, role, password_hash, status FROM users WHERE email = ?",
  )
    .bind(email)
    .first<{ id: number; name: string; email: string; role: AuthUser["role"]; password_hash: string; status: string }>();

  const ok = row && row.status === "active" && (await verifyPassword(password, row.password_hash));
  await env.DB.prepare("INSERT INTO login_attempts (ip, email, success) VALUES (?, ?, ?)")
    .bind(ip, email, ok ? 1 : 0)
    .run();

  if (!ok || !row) {
    // رسالة موحّدة لمنع تعداد الحسابات.
    return json({ ok: false, error: "البريد أو كلمة المرور غير صحيحة." }, 401);
  }

  const setCookie = await createSession(env.DB, row.id);
  const user: AuthUser = { id: row.id, name: row.name, email: row.email, role: row.role };
  return json({ ok: true, user }, 200, { "Set-Cookie": setCookie });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const setCookie = await destroySession(request, env.DB);
  return json({ ok: true }, 200, { "Set-Cookie": setCookie });
}

/* ===== أدوات المعلّم ===== */

async function audit(env: Env, email: string, action: string, target: string): Promise<void> {
  await env.DB.prepare("INSERT INTO audit_log (actor_email, action, target) VALUES (?, ?, ?)")
    .bind(email, action, target)
    .run();
}

/** يستخرج معرّف فيديو يوتيوب من رابط أو معرّف خام. */
function extractYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** رفع صورة/صوت إلى R2 وإرجاع رابطه. */
async function uploadMedia(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const entry = form.get("file");
  if (entry == null || typeof entry === "string") return json({ ok: false, error: "لم يُرفَق ملف." }, 400);
  const file = entry as unknown as {
    size: number;
    type: string;
    name: string;
    arrayBuffer(): Promise<ArrayBuffer>;
  };

  const kind = String(form.get("kind") ?? "image") === "audio" ? "audio" : "image";
  const maxBytes = kind === "audio" ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxBytes) return json({ ok: false, error: "حجم الملف كبير جداً." }, 413);
  if (!(file.type || "").startsWith(kind === "audio" ? "audio/" : "image/")) {
    return json({ ok: false, error: "نوع الملف غير مدعوم." }, 415);
  }

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  const key = `${kind}/${crypto.randomUUID()}.${ext}`;
  await env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  return json({ ok: true, key, url: `/api/media/${key}` }, 201);
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

  // قائمة الدروس (تشمل المسودّات)
  if (route === "GET /api/teacher/lessons") {
    const { results } = await env.DB.prepare(
      `SELECT id, title, doctor_name, type, youtube_id, cover_image, status,
              scheduled_at, is_published, is_members_only, created_at
         FROM lessons ORDER BY created_at DESC`,
    ).all();
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

    let status = "published";
    if (type === "live") status = b.mode === "schedule" ? "scheduled" : "live";
    else if (b.status === "draft") status = "draft";
    const isPublished = status === "draft" ? 0 : 1;

    const res = await env.DB.prepare(
      `INSERT INTO lessons (title, description, doctor_name, type, youtube_id, cover_image,
                            status, scheduled_at, is_published, is_members_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(title, description, doctor, type, youtubeId, cover, status, scheduledAt, isPublished, membersOnly)
      .run();
    const id = Number(res.meta.last_row_id);
    await audit(env, user.email, "lesson.create", `lesson:${id}`);
    return json({ ok: true, id }, 201);
  }

  // عمليات على درس بعينه
  const m = path.match(/^\/api\/teacher\/lessons\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM lessons WHERE id = ?").bind(id).run();
      await audit(env, user.email, "lesson.delete", `lesson:${id}`);
      return json({ ok: true });
    }
    if (request.method === "PATCH") {
      const b = await readJson(request);
      const fields: string[] = [];
      const vals: (string | number | null)[] = [];
      const allowed = ["title", "description", "doctor_name", "youtube_id", "cover_image", "status", "scheduled_at"];
      for (const k of allowed) {
        if (k in b) {
          fields.push(`${k} = ?`);
          vals.push(b[k] === null ? null : String(b[k]));
        }
      }
      if ("is_members_only" in b) {
        fields.push("is_members_only = ?");
        vals.push(b.is_members_only ? 1 : 0);
      }
      if ("status" in b) {
        fields.push("is_published = ?");
        vals.push(String(b.status) === "draft" ? 0 : 1);
      }
      if (!fields.length) return json({ ok: false, error: "لا تغييرات." }, 400);
      vals.push(id);
      await env.DB.prepare(`UPDATE lessons SET ${fields.join(", ")} WHERE id = ?`)
        .bind(...vals)
        .run();
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
         (SELECT COUNT(*) FROM audio_posts) AS audio`,
    ).first();
    return json({ ok: true, stats: row });
  }

  // ===== المقاطع =====
  if (route === "GET /api/teacher/clips") {
    const { results } = await env.DB.prepare(
      "SELECT id, title, doctor_name, youtube_id, duration, is_published, created_at FROM clips ORDER BY created_at DESC",
    ).all();
    return json({ ok: true, clips: results });
  }
  if (route === "POST /api/teacher/clips") {
    const b = await readJson(request);
    const title = String(b.title ?? "").trim();
    if (title.length < 2) return json({ ok: false, error: "العنوان مطلوب." }, 400);
    const youtubeId = b.youtube_id ? extractYouTubeId(String(b.youtube_id)) : null;
    const doctor = String(b.doctor_name ?? "").trim() || null;
    const duration = Number.isFinite(Number(b.duration)) ? Math.max(0, Math.floor(Number(b.duration))) : null;
    const res = await env.DB.prepare(
      "INSERT INTO clips (title, doctor_name, youtube_id, duration) VALUES (?, ?, ?, ?)",
    )
      .bind(title, doctor, youtubeId, duration)
      .run();
    const id = Number(res.meta.last_row_id);
    await audit(env, user.email, "clip.create", `clip:${id}`);
    return json({ ok: true, id }, 201);
  }
  const mc = path.match(/^\/api\/teacher\/clips\/(\d+)$/);
  if (mc && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM clips WHERE id = ?").bind(Number(mc[1])).run();
    await audit(env, user.email, "clip.delete", `clip:${mc[1]}`);
    return json({ ok: true });
  }

  // ===== الصوتيات (الصوت يُرفع إلى R2 عبر /api/teacher/media kind=audio) =====
  if (route === "GET /api/teacher/audio") {
    const { results } = await env.DB.prepare(
      "SELECT id, title, description, doctor_name, audio_url, duration, created_at FROM audio_posts ORDER BY created_at DESC",
    ).all();
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
    const res = await env.DB.prepare(
      "INSERT INTO audio_posts (title, description, doctor_name, audio_url, duration) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(title, description, doctor, audioUrl, duration)
      .run();
    const id = Number(res.meta.last_row_id);
    await audit(env, user.email, "audio.create", `audio:${id}`);
    return json({ ok: true, id }, 201);
  }
  const ma = path.match(/^\/api\/teacher\/audio\/(\d+)$/);
  if (ma && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM audio_posts WHERE id = ?").bind(Number(ma[1])).run();
    await audit(env, user.email, "audio.delete", `audio:${ma[1]}`);
    return json({ ok: true });
  }

  // بقيّة واجهات المعلّم تُربط لاحقاً (يوتيوب/تحليلات/نشر).
  return notReady("teacher." + path.slice("/api/teacher/".length));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    // كل ما عدا ذلك: الموقع العام (أصول ثابتة).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
