/**
 * ربط ونشر Meta (فيسبوك + انستقرام) عبر Graph API الرسمي.
 *
 * المبدأ: المستخدم المخوّل يربط صفحته مرّة واحدة بتدفّق OAuth الرسمي، فنحفظ
 * **Page Access Token** طويل الأمد — لا كلمة مرور ولا تسجيل دخول نيابةً عنه.
 * بعدها كل منشور يُسلَّم من الخادم إلى الصفحة وحساب انستقرام الأعمال المرتبط بها.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * صلاحيات OAuth لصفحات فيسبوك — تطبيق رياض المتقين نشر (1051352257686375).
 * حالة الاستخدام «Manage everything on your Page» تتطلّب `business_management`
 * إضافةً إلى صلاحيات الصفحات: بدونها `/me/accounts` يُرجع قائمة فارغة إذا كانت
 * الصفحة مربوطة بحساب أعمال (Meta Business) — وهذا حال صفحة رياض المتقين.
 * لا تُطلب أي صلاحية انستقرام في الحوار: `instagram_business_basic` و
 * `instagram_business_content_publish` يرفضهما Meta على هذا التطبيق
 * (Invalid Scopes) حتى إن ظهرت «جاهزة للاختبار» في لوحة المطوّر.
 * ربط صفحة→حساب انستقرام الأعمال يبقى عبر حقل Graph `instagram_business_account`
 * بعد موافقة الصفحة — بلا صلاحية انستقرام في OAuth.
 */
export const META_OAUTH_SCOPES = [
  "business_management",
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
] as const;

const SCOPES = META_OAUTH_SCOPES.join(",");

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
    // من سبق وربط بدون business_management لن يُسأل عن الصلاحية الجديدة إلا بإعادة الطلب.
    auth_type: "rerequest",
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

type GraphPage = { id?: string; name?: string; access_token?: string };

async function graphGet<T>(pathAndQuery: string, token: string, what: string): Promise<T> {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  return graphJson<T>(
    await fetch(`${GRAPH}/${pathAndQuery}${sep}access_token=${encodeURIComponent(token)}`),
    what,
  );
}

function asPageInfo(raw: GraphPage[] | undefined): PageInfo[] {
  const out: PageInfo[] = [];
  for (const p of raw ?? []) {
    if (p.id && p.access_token) out.push({ id: p.id, name: p.name ?? p.id, access_token: p.access_token });
  }
  return out;
}

/** إن وُجدت صفحة بلا توكن نشر نطلبه من عقدة الصفحة نفسها. */
async function withPageTokens(raw: GraphPage[], userToken: string): Promise<PageInfo[]> {
  const ready = asPageInfo(raw);
  if (ready.length) return ready;
  const out: PageInfo[] = [];
  for (const p of raw) {
    if (!p.id) continue;
    try {
      const d = await graphGet<GraphPage>(`${p.id}?fields=id,name,access_token`, userToken, "توكن الصفحة");
      if (d.access_token) {
        out.push({ id: d.id ?? p.id, name: d.name ?? p.name ?? p.id, access_token: d.access_token });
      }
    } catch {
      // صفحة بلا حقّ توكن — نتخطّاها
    }
  }
  return out;
}

/**
 * صفحات المستخدم التي يملك حقّ النشر عليها.
 * المسار الرسمي: GET /me/accounts (يعيد Page Access Token مع كل صفحة).
 * إن كانت القائمة فارغة رغم وجود صفحة أعمال نجرّب البدائل التي توثّقها Meta
 * لتطبيقات إدارة الصفحات / Business Manager:
 * - /me/accounts?business={id} بعد /me/businesses
 * - /me/assigned_pages (صفحات مُسندة بمهام — User Assigned Pages)
 */
export async function listPages(userToken: string): Promise<PageInfo[]> {
  const accounts = await graphGet<{ data?: GraphPage[] }>(
    "me/accounts?fields=id,name,access_token",
    userToken,
    "جلب الصفحات",
  );
  const fromAccounts = await withPageTokens(accounts.data ?? [], userToken);
  if (fromAccounts.length) return fromAccounts;

  try {
    const businesses = await graphGet<{ data?: Array<{ id: string }> }>(
      "me/businesses?fields=id",
      userToken,
      "جلب الأعمال",
    );
    for (const b of businesses.data ?? []) {
      const scoped = await graphGet<{ data?: GraphPage[] }>(
        `me/accounts?fields=id,name,access_token&business=${encodeURIComponent(b.id)}`,
        userToken,
        "صفحات العمل",
      );
      const pages = await withPageTokens(scoped.data ?? [], userToken);
      if (pages.length) return pages;
    }
  } catch {
    // بلا business_management أو بلا أعمال — ننتقل للبديل التالي
  }

  try {
    const assigned = await graphGet<{ data?: GraphPage[] }>(
      "me/assigned_pages?fields=id,name,access_token",
      userToken,
      "الصفحات المُسندة",
    );
    const pages = await withPageTokens(assigned.data ?? [], userToken);
    if (pages.length) return pages;
  } catch {
    // /me/assigned_pages يفشل على مستخدم غير business-scoped — طبيعي
  }

  return [];
}

/** سبب قصير يُمرَّر في ?why= حين تبقى القائمة فارغة بعد البدائل. */
export type EmptyPagesWhy = "need_biz" | "need_pages" | "empty";

export async function explainEmptyPages(userToken: string): Promise<EmptyPagesWhy> {
  try {
    const perms = await graphGet<{ data?: Array<{ permission?: string; status?: string }> }>(
      "me/permissions",
      userToken,
      "صلاحيات التوكن",
    );
    const granted = new Set(
      (perms.data ?? [])
        .filter((p) => p.status === "granted" && p.permission)
        .map((p) => p.permission as string),
    );
    if (!granted.has("business_management")) return "need_biz";
    if (!granted.has("pages_show_list")) return "need_pages";
  } catch {
    // فشل التشخيص لا يمنع الرسالة العامة
  }
  return "empty";
}

/**
 * يقرأ حساب انستقرام الأعمال من حقل الصفحة `instagram_business_account`.
 * يرمي عند خطأ Graph؛ يعيد null إن لم يكن الحساب مربوطاً بالصفحة.
 */
export async function fetchInstagram(
  pageId: string,
  pageToken: string,
): Promise<{ id: string; username: string | null } | null> {
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
}

/** حساب انستقرام الأعمال المرتبط بالصفحة (اختياري — قد لا يكون مربوطاً). */
export async function getInstagram(
  pageId: string,
  pageToken: string,
): Promise<{ id: string; username: string | null } | null> {
  try {
    return await fetchInstagram(pageId, pageToken);
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

/** يعيد اكتشاف انستقرام للصفحة المحفوظة ويحدّث `meta_accounts` دون OAuth جديد. */
export async function refreshSavedInstagram(
  env: MetaEnv,
  userId: number,
): Promise<{ ig_user_id: string | null; ig_username: string | null }> {
  const acc = await getAccount(env, userId);
  if (!acc?.page_id || !acc.page_token) {
    throw new Error("لا صفحة فيسبوك مربوطة.");
  }
  const ig = await fetchInstagram(acc.page_id, acc.page_token);
  await env.DB.prepare(
    "UPDATE meta_accounts SET ig_user_id = ?, ig_username = ? WHERE user_id = ?",
  )
    .bind(ig?.id ?? null, ig?.username ?? null, userId)
    .run();
  return { ig_user_id: ig?.id ?? null, ig_username: ig?.username ?? null };
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
    return { ok: true, id: d.id };
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
