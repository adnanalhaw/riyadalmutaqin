/**
 * تكامل يوتيوب (OAuth 2.0 + رفع الفيديو) لرياض المتقين.
 *
 * المفاتيح تُحفظ كأسرار بيئة (لا في الكود):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * رموز كل معلّم (refresh/access) تُحفظ في جدول youtube_accounts.
 */

export interface YTEnv {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

export function isConfigured(env: YTEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** رابط موافقة Google. */
export function buildAuthUrl(env: YTEnv, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID as string,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

/** تبديل الرمز المؤقّت برموز الوصول/التحديث. */
export async function exchangeCode(env: YTEnv, code: string, redirectUri: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID as string,
    client_secret: env.GOOGLE_CLIENT_SECRET as string,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error("token_exchange_failed: " + (await r.text()));
  return r.json();
}

async function refreshAccessToken(env: YTEnv, refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID as string,
    client_secret: env.GOOGLE_CLIENT_SECRET as string,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error("token_refresh_failed: " + (await r.text()));
  return r.json();
}

/** معلومات القناة لصاحب الرمز. */
export async function getChannel(accessToken: string): Promise<{ id: string; title: string } | null> {
  const r = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { authorization: "Bearer " + accessToken } },
  );
  if (!r.ok) return null;
  const data = (await r.json()) as { items?: Array<{ id: string; snippet?: { title?: string } }> };
  const item = data.items && data.items[0];
  return item ? { id: item.id, title: item.snippet?.title ?? "" } : null;
}

/** يحفظ/يحدّث ربط حساب يوتيوب لمعلّم. */
export async function saveAccount(
  env: YTEnv,
  teacherId: number,
  tokens: TokenResponse,
  channel: { id: string; title: string } | null,
): Promise<void> {
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO youtube_accounts (teacher_id, channel_id, channel_title, access_token, refresh_token, token_expiry, scope)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(teacher_id) DO UPDATE SET
       channel_id = excluded.channel_id,
       channel_title = excluded.channel_title,
       access_token = excluded.access_token,
       refresh_token = COALESCE(excluded.refresh_token, youtube_accounts.refresh_token),
       token_expiry = excluded.token_expiry,
       scope = excluded.scope`,
  )
    .bind(
      teacherId,
      channel?.id ?? null,
      channel?.title ?? null,
      tokens.access_token,
      tokens.refresh_token ?? null,
      expiry,
      tokens.scope ?? SCOPES,
    )
    .run();
}

/** رمز وصول صالح (يُحدَّث تلقائياً عند انتهائه). */
export async function getValidAccessToken(env: YTEnv, teacherId: number): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT access_token, refresh_token, token_expiry FROM youtube_accounts WHERE teacher_id = ?",
  )
    .bind(teacherId)
    .first<{ access_token: string | null; refresh_token: string | null; token_expiry: string | null }>();
  if (!row || !row.refresh_token) return null;

  const stillValid = row.access_token && row.token_expiry && Date.parse(row.token_expiry) > Date.now() + 60_000;
  if (stillValid) return row.access_token;

  const refreshed = await refreshAccessToken(env, row.refresh_token);
  const expiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await env.DB.prepare("UPDATE youtube_accounts SET access_token = ?, token_expiry = ? WHERE teacher_id = ?")
    .bind(refreshed.access_token, expiry, teacherId)
    .run();
  return refreshed.access_token;
}

/** رفع فيديو إلى يوتيوب (resumable upload) وإرجاع معرّف الفيديو. */
export async function uploadVideo(
  accessToken: string,
  bytes: ArrayBuffer,
  contentType: string,
  meta: { title: string; description?: string; privacy?: string },
): Promise<{ id: string }> {
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + accessToken,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": contentType,
        "x-upload-content-length": String(bytes.byteLength),
      },
      body: JSON.stringify({
        snippet: { title: meta.title, description: meta.description ?? "" },
        status: { privacyStatus: meta.privacy ?? "unlisted", selfDeclaredMadeForKids: false },
      }),
    },
  );
  if (!init.ok) throw new Error("upload_init_failed: " + (await init.text()));
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("upload_init_no_location");

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { authorization: "Bearer " + accessToken, "content-type": contentType },
    body: bytes,
  });
  if (!put.ok) throw new Error("upload_put_failed: " + (await put.text()));
  const data = (await put.json()) as { id: string };
  return { id: data.id };
}
