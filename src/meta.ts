/**
 * ربط ونشر Meta (فيسبوك + انستقرام) عبر Graph API الرسمي.
 *
 * المبدأ: المستخدم المخوّل يربط صفحته مرّة واحدة بتدفّق OAuth الرسمي، فنحفظ
 * **Page Access Token** طويل الأمد — لا كلمة مرور ولا تسجيل دخول نيابةً عنه.
 * بعدها كل منشور يُسلَّم من الخادم إلى الصفحة وحساب انستقرام الأعمال المرتبط بها.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

/** الصلاحيات المطلوبة: قراءة صفحاته، النشر عليها، والنشر على انستقرام الأعمال. */
const SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

export interface MetaEnv {
  DB: D1Database;
  FB_APP_ID?: string;
  FB_APP_SECRET?: string;
}

export interface MetaAccount {
  page_id: string | null;
  user_token?: string | null;
  page_name: string | null;
  page_token: string | null;
  ig_user_id: string | null;
  ig_username: string | null;
}

export function isConfigured(env: MetaEnv): boolean {
  return Boolean(env.FB_APP_ID && env.FB_APP_SECRET);
}

export function buildAuthUrl(env: MetaEnv, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env.FB_APP_ID ?? "",
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${p.toString()}`;
}

/** يقرأ ردّ Graph ويرمي خطأً مفهوماً بدل رقم حالة أعمى. */
async function graphJson<T>(res: Response, what: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok || (data as { error?: unknown }).error) {
    throw new Error(`${what}: ${data.error?.message ?? `HTTP ${res.status}`}`);
  }
  return data as T;
}

/** يبدّل الرمز المؤقّت بتوكن مستخدم، ثم يمدّده لطويل الأمد (٦٠ يوماً). */
export async function exchangeCode(env: MetaEnv, code: string, redirectUri: string): Promise<string> {
  const p = new URLSearchParams({
    client_id: env.FB_APP_ID ?? "",
    client_secret: env.FB_APP_SECRET ?? "",
    redirect_uri: redirectUri,
    code,
  });
  const short = await graphJson<{ access_token: string }>(
    await fetch(`${GRAPH}/oauth/access_token?${p.toString()}`),
    "تبديل الرمز",
  );
  const lp = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env.FB_APP_ID ?? "",
    client_secret: env.FB_APP_SECRET ?? "",
    fb_exchange_token: short.access_token,
  });
  const long = await graphJson<{ access_token: string }>(
    await fetch(`${GRAPH}/oauth/access_token?${lp.toString()}`),
    "تمديد التوكن",
  );
  return long.access_token;
}

export interface PageInfo {
  id: string;
  name: string;
  access_token: string;
  ig_user_id?: string | null;
  ig_username?: string | null;
}

/** صفحات المستخدم التي يملك حقّ النشر عليها (توكن كل صفحة يأتي معها). */
export async function listPages(userToken: string): Promise<PageInfo[]> {
  const d = await graphJson<{ data?: PageInfo[] }>(
    await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`),
    "جلب الصفحات",
  );
  return d.data ?? [];
}

/** حساب انستقرام الأعمال المرتبط بالصفحة (اختياري — قد لا يكون مربوطاً). */
export async function getInstagram(
  pageId: string,
  pageToken: string,
): Promise<{ id: string; username: string | null } | null> {
  try {
    const d = await graphJson<{ instagram_business_account?: { id: string } }>(
      await fetch(
        `${GRAPH}/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(pageToken)}`,
      ),
      "جلب انستقرام",
    );
    const igId = d.instagram_business_account?.id;
    if (!igId) return null;
    const info = await graphJson<{ username?: string }>(
      await fetch(`${GRAPH}/${igId}?fields=username&access_token=${encodeURIComponent(pageToken)}`),
      "جلب اسم انستقرام",
    );
    return { id: igId, username: info.username ?? null };
  } catch {
    return null; // غياب انستقرام لا يُفشل ربط فيسبوك
  }
}

export async function saveAccount(
  env: MetaEnv,
  userId: number,
  page: PageInfo,
  userToken?: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO meta_accounts (user_id, page_id, page_name, page_token, ig_user_id, ig_username, user_token, connected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET page_id=excluded.page_id, page_name=excluded.page_name,
       page_token=excluded.page_token, ig_user_id=excluded.ig_user_id, ig_username=excluded.ig_username,
       user_token=COALESCE(excluded.user_token, meta_accounts.user_token), connected_at=datetime('now')`,
  )
    .bind(userId, page.id, page.name, page.access_token, page.ig_user_id ?? null, page.ig_username ?? null, userToken ?? null)
    .run();
}

export async function getAccount(env: MetaEnv, userId: number): Promise<MetaAccount | null> {
  return await env.DB.prepare(
    "SELECT page_id, page_name, page_token, ig_user_id, ig_username, user_token FROM meta_accounts WHERE user_id = ?",
  )
    .bind(userId)
    .first<MetaAccount>();
}

/** حساب «رسمي» للموقع: أوّل ربطٍ لمدير الموقع/الأدمن — يُستعمل حين لا يملك الناشر ربطاً. */
export async function getSiteAccount(env: MetaEnv): Promise<MetaAccount | null> {
  return await env.DB.prepare(
    `SELECT m.page_id, m.page_name, m.page_token, m.ig_user_id, m.ig_username
       FROM meta_accounts m JOIN users u ON u.id = m.user_id
      WHERE u.role IN ('manager','admin') ORDER BY m.connected_at DESC LIMIT 1`,
  ).first<MetaAccount>();
}

const isVideo = (url: string): boolean => /\/video\/|\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);

/** نشر على صفحة فيسبوك: فيديو أو صورة أو نصّ — حسب ما هو متاح. */
export async function publishFacebook(
  acc: MetaAccount,
  content: string | null,
  mediaUrl: string | null,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!acc.page_id || !acc.page_token) return { ok: false, error: "لا صفحة فيسبوك مربوطة." };
  try {
    let endpoint = `${GRAPH}/${acc.page_id}/feed`;
    const body: Record<string, string> = { access_token: acc.page_token };
    if (mediaUrl && isVideo(mediaUrl)) {
      endpoint = `${GRAPH}/${acc.page_id}/videos`;
      body.file_url = mediaUrl;
      if (content) body.description = content;
    } else if (mediaUrl) {
      endpoint = `${GRAPH}/${acc.page_id}/photos`;
      body.url = mediaUrl;
      if (content) body.caption = content;
    } else {
      body.message = content ?? "";
    }
    const d = await graphJson<{ id?: string; post_id?: string }>(
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      "النشر على فيسبوك",
    );
    return { ok: true, id: d.post_id ?? d.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** ينشئ حاوية انستقرام (فيديو Reel أو صورة) ويعيد معرّفها. */
export async function createIgContainer(
  acc: MetaAccount,
  content: string | null,
  mediaUrl: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!acc.ig_user_id || !acc.page_token) return { ok: false, error: "لا حساب انستقرام أعمال مربوط." };
  try {
    const body: Record<string, string> = { access_token: acc.page_token };
    if (content) body.caption = content;
    if (isVideo(mediaUrl)) {
      body.media_type = "REELS";
      body.video_url = mediaUrl;
    } else {
      body.image_url = mediaUrl;
    }
    const d = await graphJson<{ id?: string }>(
      await fetch(`${GRAPH}/${acc.ig_user_id}/media`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      "تجهيز منشور انستقرام",
    );
    return d.id ? { ok: true, id: d.id } : { ok: false, error: "لم يُرجِع انستقرام معرّف الحاوية." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** حالة الحاوية: FINISHED جاهزة للنشر · IN_PROGRESS ما زال يُعالَج · ERROR فشل. */
export async function igContainerStatus(acc: MetaAccount, creationId: string): Promise<string> {
  try {
    const d = await graphJson<{ status_code?: string }>(
      await fetch(
        `${GRAPH}/${creationId}?fields=status_code&access_token=${encodeURIComponent(acc.page_token ?? "")}`,
      ),
      "حالة الحاوية",
    );
    return d.status_code ?? "IN_PROGRESS";
  } catch {
    return "IN_PROGRESS";
  }
}

export async function publishIgContainer(
  acc: MetaAccount,
  creationId: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const d = await graphJson<{ id?: string }>(
      await fetch(`${GRAPH}/${acc.ig_user_id}/media_publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creation_id: creationId, access_token: acc.page_token }),
      }),
      "نشر انستقرام",
    );
    // لا نُعلن نجاحاً بلا معرّف: ردٌّ 200 بلا id ليس إثبات نشر، وتسجيله كنجاح
    // يُخفي عن المدير منشوراً لم يظهر فعلاً على الحساب.
    return d.id ? { ok: true, id: d.id } : { ok: false, error: "لم يُرجِع انستقرام معرّف المنشور — لم يُؤكَّد النشر." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * نشر كامل على انستقرام: تجهيز الحاوية ثم انتظار معالجتها ثم النشر.
 * الفيديو يحتاج وقت معالجة عند Meta، فننتظر بحدود معقولة؛ وإن لم يجهز نُعيد
 * `pending` مع معرّف الحاوية ليكملها مشغّل cron لاحقاً بدل أن يضيع المنشور.
 */
export async function publishInstagram(
  acc: MetaAccount,
  content: string | null,
  mediaUrl: string | null,
  maxWaitMs = 24000,
): Promise<{ ok: boolean; id?: string; error?: string; pending?: string }> {
  if (!mediaUrl) return { ok: false, error: "انستقرام يتطلّب صورة أو فيديو." };
  const c = await createIgContainer(acc, content, mediaUrl);
  if (!c.ok || !c.id) return { ok: false, error: c.error };

  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const st = await igContainerStatus(acc, c.id);
    if (st === "FINISHED") return await publishIgContainer(acc, c.id);
    if (st === "ERROR" || st === "EXPIRED") return { ok: false, error: `تعذّرت معالجة الوسيط (${st}).` };
    if (Date.now() >= deadline) return { ok: false, pending: c.id, error: "الفيديو ما زال يُعالَج — سيُنشر تلقائياً خلال دقائق." };
    await new Promise((r) => setTimeout(r, 3000));
  }
}
