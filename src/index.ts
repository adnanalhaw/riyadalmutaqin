/**
 * منصة رياض المتقين — نقطة دخول الـ Worker
 *
 * يقدّم الموقع العام (أصول ثابتة) عبر env.ASSETS، وواجهة API تحت /api.
 * الأدوار: زائر (guest) / متعلّم (student) / معلّم (teacher) / مدير (admin).
 *
 * نقاط API الحالية فعّالة: /api/health.
 * بقيّة النقاط مُهيّأة كهيكل (stubs) تُربط بالواجهة الخلفية في المراحل التالية.
 */

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

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

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

  // ===== المصادقة (المتعلّم/المعلّم) — هيكل =====
  if (path === "/api/auth/register") return notReady("auth.register");
  if (path === "/api/auth/login") return notReady("auth.login");
  if (path === "/api/auth/logout") return notReady("auth.logout");
  if (path === "/api/auth/me") return notReady("auth.me");

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

  // ===== المتعلّم =====
  if (path === "/api/library") return notReady("library.saved");

  // ===== المعلّم =====
  if (path.startsWith("/api/teacher/lessons")) return notReady("teacher.lessons");
  if (path === "/api/teacher/upload") return notReady("teacher.upload");
  if (path === "/api/teacher/youtube/connect") return notReady("teacher.youtube.connect");
  if (path === "/api/teacher/youtube/publish") return notReady("teacher.youtube.publish");
  if (path === "/api/teacher/analytics") return notReady("teacher.analytics");
  if (path === "/api/teacher/publish") return notReady("teacher.publish");

  return json({ ok: false, error: "Not Found" }, 404);
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
