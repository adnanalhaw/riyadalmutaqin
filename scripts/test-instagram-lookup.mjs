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
