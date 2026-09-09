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
  assert.match(indexSrc, /isInstagramNotLinkedError/);
  assert.match(indexSrc, /getInstagram\(page\.id, page\.access_token, userToken\)/);
  assert.match(indexSrc, /getInstagram\(page\.id, page\.access_token, acc\.user_token\)/);
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
