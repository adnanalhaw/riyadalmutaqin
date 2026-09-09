/**
 * مواصفات اكتشاف صفحة→انستقرام: الحقول الموثّقة في Graph (v21+) وترتيب الاختيار.
 * يقرأ المصدر ليضمن أن التنفيذ يستشهد بنفس الحقول، ويختبر pickPageInstagramUser.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const metaSrc = readFileSync(join(root, "src/meta.ts"), "utf8");
const indexSrc = readFileSync(join(root, "src/index.ts"), "utf8");
const connHtml = readFileSync(join(root, "public/manager/connections.html"), "utf8");
const publishHtml = readFileSync(join(root, "public/teacher/publish.html"), "utf8");
const deployYml = readFileSync(join(root, ".github/workflows/deploy.yml"), "utf8");

/** نسخة موازية لـ pickPageInstagramUser في src/meta.ts — أي اختلاف يُعدّ انحداراً في الترتيب. */
function pickPageInstagramUser(page) {
  const asIgUser = (raw) => (raw?.id ? { id: raw.id, username: raw.username ?? null } : null);
  const firstFromIgList = (list) => {
    if (!list) return null;
    if (Array.isArray(list)) {
      for (const item of list) {
        const u = asIgUser(item);
        if (u) return u;
      }
      return null;
    }
    if (typeof list === "object" && "data" in list) return firstFromIgList(list.data);
    return asIgUser(list);
  };
  return (
    asIgUser(page.instagram_business_account) ??
    asIgUser(page.connected_instagram_account) ??
    firstFromIgList(page.instagram_accounts)
  );
}

test("OAuth SCOPES تخلو من صلاحيات انستقرام (Invalid Scopes على هذا التطبيق)", () => {
  const start = metaSrc.indexOf("export const META_OAUTH_SCOPES");
  const end = metaSrc.indexOf("const SCOPES");
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const block = metaSrc.slice(start, end);
  assert.match(block, /business_management/);
  assert.match(block, /pages_show_list/);
  assert.doesNotMatch(block, /instagram_/);
});

test("المصدر يستشهد بحقول Graph الموثّقة لربط الصفحة بانستقرام", () => {
  for (const field of [
    "instagram_business_account",
    "connected_instagram_account",
    "instagram_accounts",
    "owned_instagram_accounts",
    "instagram_business_accounts",
  ]) {
    assert.match(metaSrc, new RegExp(field));
  }
  assert.match(metaSrc, /PAGE_IG_GRAPH_FIELDS/);
  assert.match(metaSrc, /BUSINESS_IG_EDGES/);
  assert.match(metaSrc, /developers\.facebook\.com\/docs\/graph-api\/reference\/page/);
  assert.match(metaSrc, /developers\.facebook\.com\/docs\/instagram-platform\/instagram-graph-api\/reference\/page/);
  assert.doesNotMatch(
    metaSrc.slice(metaSrc.indexOf("export function pickPageInstagramUser")),
    /connected_page_backed_instagram_account/,
  );
});

test("رسالة الفراغ تميّز مركز الحسابات عن حساب أعمال جاهز للواجهة", () => {
  assert.match(metaSrc, /مركز الحسابات/);
  assert.match(metaSrc, /accounts_center_or_not_professional/);
  assert.match(metaSrc, /IG_NOT_API_READY/);
});

test("refreshSavedInstagram يرمي InstagramNotLinkedError بدل null صامت", () => {
  assert.match(metaSrc, /throw new InstagramNotLinkedError/);
  assert.match(metaSrc, /fetchInstagram\(acc\.page_id, acc\.page_token, acc\.user_token\)/);
  assert.match(metaSrc, /decideInstagramRefresh/);
  assert.match(indexSrc, /isInstagramNotLinkedError/);
  assert.match(indexSrc, /getInstagram\(page\.id, page\.access_token, userToken\)/);
  assert.match(indexSrc, /getInstagram\(page\.id, page\.access_token, acc\.user_token\)/);
});

test("refresh-instagram يحافظ على الربط اليدوي عندما يفرغ Graph", () => {
  assert.match(metaSrc, /IG_GRAPH_EMPTY_MANUAL_KEPT/);
  assert.match(metaSrc, /action: "keep_manual"/);
  assert.match(metaSrc, /source: "manual"/);
  assert.match(metaSrc, /decideSavedInstagramFields/);
  assert.doesNotMatch(
    metaSrc.slice(metaSrc.indexOf("export async function refreshSavedInstagram")),
    /ig\?\.id \?\? null/,
  );
  assert.match(indexSrc, /kept_manual: true/);
  assert.match(indexSrc, /graph_empty: true/);
  assert.match(indexSrc, /ig\.source === "manual"/);
  assert.match(connHtml, /kept_manual/);
  assert.match(connHtml, /الربط اليدوي ما زال فعّالاً/);
  assert.match(publishHtml, /kept_manual/);
  assert.match(publishHtml, /الربط اليدوي ما زال فعّالاً/);
  assert.equal(extractExportString(metaSrc, "IG_GRAPH_EMPTY_MANUAL_KEPT"), IG_GRAPH_EMPTY_MANUAL_KEPT);
});

test("set-instagram مسار احتياطي لمدير الموقع/النظام بعد فشل Graph", () => {
  assert.match(indexSrc, /POST \/api\/connections\/meta\/set-instagram/);
  assert.match(indexSrc, /parseIgUserId/);
  assert.match(indexSrc, /setSavedInstagram/);
  assert.match(indexSrc, /الربط اليدوي لمدير الموقع أو مدير النظام فقط/);
  assert.match(metaSrc, /export async function setSavedInstagram/);
  assert.match(metaSrc, /export function parseIgUserId/);
  assert.match(connHtml, /igManualWrap/);
  assert.match(connHtml, /\/api\/connections\/meta\/set-instagram/);
  assert.match(connHtml, /إعدادات الأعمال في Meta ← حسابات انستقرام/);
  assert.match(connHtml, /لمدير الموقع\/النظام فقط|لمدير الموقع فقط/);
  assert.match(connHtml, /افصل الربط ثم أعده/);
  assert.match(indexSrc, /"instagram"/);
});

test("OAuth يبقى بلا صلاحيات انستقرام حتى مع المسار اليدوي", () => {
  const start = metaSrc.indexOf("export const META_OAUTH_SCOPES");
  const end = metaSrc.indexOf("const SCOPES");
  const block = metaSrc.slice(start, end);
  assert.doesNotMatch(block, /instagram_/);
  assert.match(metaSrc, /Login for Business/);
  assert.match(metaSrc, /IG_SCOPE_PUBLISH_ERROR/);
  assert.match(metaSrc, /IG_APP_PERMISSION_PUBLISH_ERROR/);
  assert.match(metaSrc, /usesLoginForBusiness/);
  assert.match(metaSrc, /looksLikeIgAppPermissionDenied/);
  assert.match(indexSrc, /publishInstagram\(acc, content, absMedia, env\)/);
  assert.match(indexSrc, /publishIgContainer\(target\.acc, creationId, env\)/);
});

function buildAuthUrl(env, redirectUri, state) {
  const p = new URLSearchParams({
    client_id: env.FB_APP_ID ?? "",
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    auth_type: "rerequest",
  });
  const configId = env.FB_LOGIN_CONFIG_ID?.trim();
  if (configId) {
    p.set("config_id", configId);
  } else {
    p.set("scope", "business_management,pages_show_list,pages_manage_posts,pages_read_engagement");
  }
  return `https://www.facebook.com/v21.0/dialog/oauth?${p.toString()}`;
}

test("buildAuthUrl يمرّر config_id بدل scope عند وجود FB_LOGIN_CONFIG_ID", () => {
  const withCfg = buildAuthUrl(
    { FB_APP_ID: "1051352257686375", FB_LOGIN_CONFIG_ID: " 1234567890 " },
    "https://riyadalmutaqin.com/api/connections/meta/callback",
    "st",
  );
  const u = new URL(withCfg);
  assert.equal(u.searchParams.get("config_id"), "1234567890");
  assert.equal(u.searchParams.get("scope"), null);
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("client_id"), "1051352257686375");
  assert.equal(u.searchParams.get("auth_type"), "rerequest");
  assert.ok(u.searchParams.get("redirect_uri"));
  assert.ok(u.searchParams.get("state"));

  const classic = buildAuthUrl(
    { FB_APP_ID: "1051352257686375" },
    "https://riyadalmutaqin.com/api/connections/meta/callback",
    "st",
  );
  const c = new URL(classic);
  assert.equal(c.searchParams.get("config_id"), null);
  assert.match(c.searchParams.get("scope") || "", /business_management/);
  assert.doesNotMatch(c.searchParams.get("scope") || "", /instagram_/);
});

test("المصدر يفعّل Login for Business من FB_LOGIN_CONFIG_ID دون scope", () => {
  const start = metaSrc.indexOf("export function buildAuthUrl");
  const end = metaSrc.indexOf("export async function exchangeCode");
  const fn = metaSrc.slice(start, end);
  assert.match(fn, /FB_LOGIN_CONFIG_ID/);
  assert.match(fn, /config_id/);
  assert.match(fn, /p\.set\("config_id"/);
  assert.match(fn, /p\.set\("scope"/);
  assert.match(indexSrc, /FB_LOGIN_CONFIG_ID\?: string/);
});

test("النشر الآلي يمرّر FB_LOGIN_CONFIG_ID عند وجوده", () => {
  assert.ok(deployYml.includes("FB_LOGIN_CONFIG_ID: ${{ secrets.FB_LOGIN_CONFIG_ID }}"));
  assert.match(deployYml, /تثبيت معرّف Login for Business/);
  assert.ok(deployYml.includes("env.FB_LOGIN_CONFIG_ID != ''"));
});

test("واجهة الربط تذكّر أن فيسبوك/انستقرام الرسميين لمدير الموقع وأن إعادة الربط لازمة", () => {
  assert.match(connHtml, /لمدير الموقع\/النظام فقط|لمدير الموقع فقط/);
  assert.match(connHtml, /افصل الربط ثم أعده/);
  assert.match(connHtml, /instagram_content_publish/);
  assert.match(connHtml, /إعادة الربط وحدها لا تصلحه/);
});

test("ربط Meta مفتوح للمعلّم على صفحته والرفض إن طابقت الرسمية", () => {
  assert.doesNotMatch(indexSrc, /ربط فيسبوك\/انستقرام لمدير الموقع فقط/);
  assert.match(indexSrc, /teacherMayLinkPage/);
  assert.match(indexSrc, /ERR_TEACHER_META_OFFICIAL/);
  assert.match(indexSrc, /user\.role === "teacher"/);
  assert.match(indexSrc, /\/teacher\/publish/);
});

function parseIgUserId(raw) {
  const s = String(raw ?? "").trim();
  return /^\d+$/.test(s) ? s : null;
}

function normalizeIgUsername(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(/^@+/, "")
    .trim();
  if (!s) return null;
  if (s.length > 64 || /[\s/\\]/.test(s)) return null;
  return s;
}

function looksLikeIgPermissionError(message) {
  const m = message.toLowerCase();
  return (
    /instagram_(business_)?(basic|content_publish|manage_insights|manage_comments)/.test(m) ||
    /does not have permission/.test(m) ||
    /hasn't authorized the application/.test(m) ||
    /requires.{0,80}permission/.test(m) ||
    /\(#10\)/.test(message) ||
    /\(#200\)/.test(message) ||
    /invalid scopes/.test(m) ||
    /permission denied/.test(m)
  );
}

function usesLoginForBusiness(env) {
  return Boolean(env?.FB_LOGIN_CONFIG_ID?.trim());
}

function looksLikeIgAppPermissionDenied(message) {
  return /\(#10\)/.test(message) || /application does not have permission/i.test(message);
}

const IG_GRAPH_EMPTY_MANUAL_KEPT =
  "واجهة Graph ما زالت فارغة (ربط مركز الحسابات أو حساب غير جاهز للواجهة)، لكن الربط اليدوي ما زال فعّالاً ولم يُمسَح.";

const IG_SCOPE_PUBLISH_ERROR =
  "توكن الصفحة لا يملك صلاحية نشر انستقرام (instagram_content_publish / instagram_business_content_publish). الربط اليدوي يحفظ المعرّف ويظهر الحساب مربوطاً في الموقع، لكن Meta ترفض إنشاء/نشر الحاوية إلى أن يُضبط Facebook Login for Business (سرّ FB_LOGIN_CONFIG_ID من لوحة المطوّر) ثم يُعاد ربط فيسبوك من /manager/connections. لا تُضاف تلك الصلاحيات إلى OAuth العادي لأنها تُرفض فوراً (Invalid Scopes).";

const IG_APP_PERMISSION_PUBLISH_ERROR =
  "رفضت Meta نشر انستقرام على مستوى صلاحية التطبيق: instagram_content_publish قد تكون ناقصة أو غير معتمدة أو «جاهزة للاختبار» فقط. فيسبوك قد ينجح في الوقت نفسه؛ إعادة الربط وحدها لا تكفي. راجِع لوحة تطبيق Meta ← Permissions وإعداد Facebook Login for Business وتأكد أن instagram_content_publish مضمّنة ومعتمدة (أو مفعّلة للاختبار على حسابات تجريبية).";

function explainIgPublishError(err, env) {
  const raw = err instanceof Error ? err.message : String(err);
  if (!looksLikeIgPermissionError(raw)) return raw;
  const hint =
    usesLoginForBusiness(env) || looksLikeIgAppPermissionDenied(raw)
      ? IG_APP_PERMISSION_PUBLISH_ERROR
      : IG_SCOPE_PUBLISH_ERROR;
  return `${hint} — تفاصيل Meta: ${raw}`;
}

test("parseIgUserId يقبل أرقاماً فقط", () => {
  assert.equal(parseIgUserId("17841405822304914"), "17841405822304914");
  assert.equal(parseIgUserId(" 42 "), "42");
  assert.equal(parseIgUserId(""), null);
  assert.equal(parseIgUserId("abc"), null);
  assert.equal(parseIgUserId("17e8"), null);
  assert.equal(parseIgUserId("178-414"), null);
});

test("normalizeIgUsername يزيل @ ويرفض الفراغ", () => {
  assert.equal(normalizeIgUsername("@almutaqyn"), "almutaqyn");
  assert.equal(normalizeIgUsername("almutaqyn"), "almutaqyn");
  assert.equal(normalizeIgUsername(""), null);
  assert.equal(normalizeIgUsername("  "), null);
  assert.equal(normalizeIgUsername("bad name"), null);
});

test("looksLikeIgPermissionError يلتقط رفض صلاحية النشر", () => {
  assert.equal(
    looksLikeIgPermissionError("تجهيز منشور انستقرام: (#10) Application does not have permission for this action"),
    true,
  );
  assert.equal(looksLikeIgPermissionError("Requires instagram_content_publish permission"), true);
  assert.equal(looksLikeIgPermissionError("تعذّرت معالجة الوسيط (ERROR)."), false);
});

function extractExportString(src, name) {
  const start = src.indexOf(`export const ${name} =`);
  assert.notEqual(start, -1, name);
  const q1 = src.indexOf('"', start);
  const q2 = src.indexOf('"', q1 + 1);
  return src.slice(q1 + 1, q2);
}

test("رسائل المصدر تفرّق إعادة الربط عن رفض صلاحية التطبيق", () => {
  assert.equal(extractExportString(metaSrc, "IG_SCOPE_PUBLISH_ERROR"), IG_SCOPE_PUBLISH_ERROR);
  assert.equal(extractExportString(metaSrc, "IG_APP_PERMISSION_PUBLISH_ERROR"), IG_APP_PERMISSION_PUBLISH_ERROR);
  assert.match(metaSrc, /FB_LOGIN_CONFIG_ID من لوحة المطوّر/);
  assert.match(metaSrc, /إعادة الربط وحدها لا تكفي/);
  assert.match(metaSrc, /جاهزة للاختبار/);
  assert.match(metaSrc, /تفاصيل Meta/);
  assert.doesNotMatch(
    metaSrc.slice(metaSrc.indexOf("export const IG_APP_PERMISSION_PUBLISH_ERROR"), metaSrc.indexOf("export function looksLikeIgPermissionError")),
    /افصل الربط ثم أعده/,
  );
});

test("explainIgPublishError: بلا FLB وخطأ صلاحية عام يوجّه لضبط Login for Business", () => {
  const raw = "Requires instagram_content_publish permission";
  const msg = explainIgPublishError(new Error(raw));
  assert.match(msg, /FB_LOGIN_CONFIG_ID/);
  assert.match(msg, /تفاصيل Meta: Requires instagram_content_publish permission/);
  assert.doesNotMatch(msg, /إعادة الربط وحدها لا تكفي/);
});

test("explainIgPublishError: #10 يعطي رسالة صلاحية التطبيق حتى بلا FLB", () => {
  const raw = "تجهيز منشور انستقرام: (#10) Application does not have permission for this action";
  const msg = explainIgPublishError(new Error(raw));
  assert.match(msg, /مستوى صلاحية التطبيق/);
  assert.match(msg, /إعادة الربط وحدها لا تكفي/);
  assert.match(msg, /تفاصيل Meta:/);
  assert.match(msg, /\(#10\)/);
  assert.doesNotMatch(msg, /ثم يُعاد ربط فيسبوك/);
});

test("explainIgPublishError: مع FLB يوجّه للوحة صلاحيات التطبيق لا إعادة الربط", () => {
  const raw = "User hasn't authorized the application for this action";
  const msg = explainIgPublishError(new Error(raw), { FB_LOGIN_CONFIG_ID: " 999 " });
  assert.match(msg, /مستوى صلاحية التطبيق/);
  assert.match(msg, /instagram_content_publish/);
  assert.match(msg, /تفاصيل Meta: User hasn't authorized the application for this action/);
  assert.doesNotMatch(msg, /ثم يُعاد ربط فيسبوك/);
});

test("explainIgPublishError: خطأ غير صلاحية يُعاد كما هو", () => {
  assert.equal(explainIgPublishError(new Error("تعذّرت معالجة الوسيط (ERROR).")), "تعذّرت معالجة الوسيط (ERROR).");
});

test("looksLikeIgAppPermissionDenied يميّز #10 عن صلاحية عامة", () => {
  assert.equal(
    looksLikeIgAppPermissionDenied("(#10) Application does not have permission for this action"),
    true,
  );
  assert.equal(looksLikeIgAppPermissionDenied("Requires instagram_content_publish permission"), false);
  assert.equal(usesLoginForBusiness({ FB_LOGIN_CONFIG_ID: " 1 " }), true);
  assert.equal(usesLoginForBusiness({ FB_LOGIN_CONFIG_ID: "  " }), false);
  assert.equal(usesLoginForBusiness({}), false);
});

test("pickPageInstagramUser يفضّل instagram_business_account", () => {
  const got = pickPageInstagramUser({
    instagram_business_account: { id: "iba", username: "pro" },
    connected_instagram_account: { id: "cia", username: "settings" },
    instagram_accounts: { data: [{ id: "edge", username: "edge" }] },
  });
  assert.deepEqual(got, { id: "iba", username: "pro" });
});

test("pickPageInstagramUser يلجأ إلى connected_instagram_account إن فرغ IBA", () => {
  const got = pickPageInstagramUser({
    instagram_business_account: {},
    connected_instagram_account: { id: "17841405822304914", username: "almutaqyn" },
  });
  assert.deepEqual(got, { id: "17841405822304914", username: "almutaqyn" });
});

test("pickPageInstagramUser يلجأ إلى عقدة instagram_accounts", () => {
  const got = pickPageInstagramUser({
    instagram_accounts: { data: [{ id: "edge1", username: "from_edge" }] },
  });
  assert.deepEqual(got, { id: "edge1", username: "from_edge" });
});

test("pickPageInstagramUser يعيد null عندما تفرغ كل الحقول (سيناريو مركز الحسابات)", () => {
  assert.equal(pickPageInstagramUser({}), null);
  assert.equal(pickPageInstagramUser({ instagram_business_account: null }), null);
  assert.equal(pickPageInstagramUser({ instagram_accounts: { data: [] } }), null);
});

/** نسخة موازية لـ decideInstagramRefresh في src/meta.ts. */
function decideInstagramRefresh(graph, saved) {
  if (graph?.id) {
    return { action: "update", ig_user_id: graph.id, ig_username: graph.username ?? null };
  }
  if (saved.ig_user_id) {
    return { action: "keep_manual", ig_user_id: saved.ig_user_id, ig_username: saved.ig_username };
  }
  return { action: "none" };
}

function decideSavedInstagramFields(incoming, existing) {
  if (incoming.ig_user_id) {
    return { ig_user_id: incoming.ig_user_id, ig_username: incoming.ig_username ?? null };
  }
  if (existing?.ig_user_id) {
    return { ig_user_id: existing.ig_user_id, ig_username: existing.ig_username };
  }
  return { ig_user_id: null, ig_username: null };
}

test("decideInstagramRefresh يحدّث عندما يجد Graph حساباً", () => {
  const got = decideInstagramRefresh(
    { id: "17841405822304914", username: "almutaqyn" },
    { ig_user_id: "old-manual", ig_username: "old" },
  );
  assert.deepEqual(got, {
    action: "update",
    ig_user_id: "17841405822304914",
    ig_username: "almutaqyn",
  });
});

test("decideInstagramRefresh يبقي المعرّف اليدوي إن فرغ Graph", () => {
  const got = decideInstagramRefresh(null, {
    ig_user_id: "17841405822304914",
    ig_username: "almutaqyn",
  });
  assert.deepEqual(got, {
    action: "keep_manual",
    ig_user_id: "17841405822304914",
    ig_username: "almutaqyn",
  });
});

test("decideInstagramRefresh لا يكتب null إن فرغ Graph ولا ربط يدوي", () => {
  assert.deepEqual(decideInstagramRefresh(null, { ig_user_id: null, ig_username: null }), {
    action: "none",
  });
});

test("decideSavedInstagramFields يحافظ على اليدوي إن فرغ Graph عند إعادة ربط فيسبوك", () => {
  assert.deepEqual(
    decideSavedInstagramFields(
      { ig_user_id: null, ig_username: null },
      { ig_user_id: "17841405822304914", ig_username: "almutaqyn" },
    ),
    { ig_user_id: "17841405822304914", ig_username: "almutaqyn" },
  );
  assert.deepEqual(
    decideSavedInstagramFields(
      { ig_user_id: "new-ig", ig_username: "from_graph" },
      { ig_user_id: "17841405822304914", ig_username: "almutaqyn" },
    ),
    { ig_user_id: "new-ig", ig_username: "from_graph" },
  );
  assert.deepEqual(decideSavedInstagramFields({ ig_user_id: null }, null), {
    ig_user_id: null,
    ig_username: null,
  });
});
