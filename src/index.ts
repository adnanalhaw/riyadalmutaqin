/**
 * منصة رياض المتقين — نقطة دخول الـ Worker
 *
 * المرحلة ٠ (التأسيس):
 *  - يقدّم الموقع العام كأصول ثابتة عبر env.ASSETS.
 *  - يوفّر واجهة API تحت /api، وأول نقطة فيها /api/health.
 *  - يربط قاعدة البيانات D1 (DB) والتخزين R2 (MEDIA) — تُستخدم في المراحل التالية.
 */

export interface Env {
  /** أصول الموقع العام (Static Assets). */
  ASSETS: Fetcher;
  /** قاعدة البيانات — Cloudflare D1. */
  DB: D1Database;
  /** تخزين الملفات (صوت/صور) — Cloudflare R2. */
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

/** موجّه واجهة API. تُضاف بقيّة النقاط في المراحل اللاحقة. */
async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // فحص الصحّة — معيار قبول المرحلة ٠.
  if (path === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      service: env.SITE_NAME,
      environment: env.ENVIRONMENT,
      time: new Date().toISOString(),
    });
  }

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
