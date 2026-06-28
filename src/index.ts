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

  // ===== المتعلّم (يتطلّب تسجيل دخول) =====
  if (path === "/api/library") {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    return notReady("library.saved");
  }

  // ===== المعلّم (يتطلّب دور teacher/admin) =====
  if (path.startsWith("/api/teacher/")) {
    const user = await getSessionUser(request, env.DB);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    if (user.role !== "teacher" && user.role !== "admin") {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    return notReady("teacher." + path.slice("/api/teacher/".length));
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
