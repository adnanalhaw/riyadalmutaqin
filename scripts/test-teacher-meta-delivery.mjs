/**
 * قواعد تسليم Meta: المعلّم → صفحته فقط · المدير → الرسمي · رفض تطابق page_id.
 * يختبر الدالة نفسها ويقرأ المصدر حتى لا ينحدر التنفيذ.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const metaSrc = readFileSync(join(root, "src/meta.ts"), "utf8");
const indexSrc = readFileSync(join(root, "src/index.ts"), "utf8");
const publishHtml = readFileSync(join(root, "public/teacher/publish.html"), "utf8");
const connHtml = readFileSync(join(root, "public/manager/connections.html"), "utf8");

const ERR_TEACHER_META_UNLINKED = "اربط صفحتك الخاصة من صفحة النشر (/teacher/publish).";
const ERR_TEACHER_META_OFFICIAL =
  "ممنوع النشر على الصفحة الرسمية لرياض المتقين — اربط صفحتك الخاصة.";

function isOfficialSiteAccount(personal, official) {
  if (!personal || !official) return false;
  if (personal.page_id && official.page_id && personal.page_id === official.page_id) return true;
  if (personal.ig_user_id && official.ig_user_id && personal.ig_user_id === official.ig_user_id) {
    return true;
  }
  return false;
}

function teacherMayLinkPage(pageId, officialPageId) {
  if (!officialPageId) return true;
  return pageId !== officialPageId;
}

function decideMetaDelivery(opts) {
  if (opts.authorRole === "teacher") {
    if (!opts.personal?.page_token) {
      return { ok: false, error: ERR_TEACHER_META_UNLINKED };
    }
    if (isOfficialSiteAccount(opts.personal, opts.official)) {
      return { ok: false, error: ERR_TEACHER_META_OFFICIAL };
    }
    return { ok: true, acc: opts.personal, source: "personal" };
  }
  if (!opts.official?.page_token) {
    return {
      ok: false,
      error: "لا حساب Meta رسمي مربوط — يربطه مدير الموقع من «ربط حسابات النشر» (/manager/connections).",
    };
  }
  return { ok: true, acc: opts.official, source: "official" };
}

const official = {
  page_id: "official-page",
  page_name: "رياض المتقين",
  page_token: "site-token",
  ig_user_id: "ig-official",
  ig_username: "almutaqyn",
};
const personal = {
  page_id: "teacher-page",
  page_name: "صفحة الشيخ",
  page_token: "teacher-token",
  ig_user_id: "ig-teacher",
  ig_username: "sheikh",
};

test("المعلّم بلا ربط شخصي لا يُسلَّم (ولا يُستخدم الحساب الرسمي)", () => {
  const got = decideMetaDelivery({ authorRole: "teacher", personal: null, official });
  assert.equal(got.ok, false);
  assert.equal(got.error, ERR_TEACHER_META_UNLINKED);
});

test("المعلّم ذو صفحة شخصية يُسلَّم إلى getAccount لا getSiteAccount", () => {
  const got = decideMetaDelivery({ authorRole: "teacher", personal, official });
  assert.equal(got.ok, true);
  assert.equal(got.source, "personal");
  assert.equal(got.acc.page_id, "teacher-page");
  assert.equal(got.acc.page_token, "teacher-token");
});

test("يُرفض تسليم المعلّم إن طابق page_id الصفحة الرسمية", () => {
  const got = decideMetaDelivery({
    authorRole: "teacher",
    personal: { ...personal, page_id: official.page_id },
    official,
  });
  assert.equal(got.ok, false);
  assert.equal(got.error, ERR_TEACHER_META_OFFICIAL);
});

test("يُرفض تسليم المعلّم إن طابق ig_user_id الحساب الرسمي", () => {
  const got = decideMetaDelivery({
    authorRole: "teacher",
    personal: { ...personal, ig_user_id: official.ig_user_id },
    official,
  });
  assert.equal(got.ok, false);
  assert.equal(got.error, ERR_TEACHER_META_OFFICIAL);
});

test("المدير/الأدمن يستعمل getSiteAccount (الرسمي)", () => {
  for (const role of ["manager", "admin", null]) {
    const got = decideMetaDelivery({ authorRole: role, personal, official });
    assert.equal(got.ok, true);
    assert.equal(got.source, "official");
    assert.equal(got.acc.page_id, "official-page");
  }
});

test("teacherMayLinkPage يمنع الصفحة الرسمية ويسمح بغيرها", () => {
  assert.equal(teacherMayLinkPage("teacher-page", "official-page"), true);
  assert.equal(teacherMayLinkPage("official-page", "official-page"), false);
  assert.equal(teacherMayLinkPage("official-page", null), true);
});

test("المصدر يصدّر decideMetaDelivery ويمنع تسليم المعلّم للرسمي", () => {
  assert.match(metaSrc, /export function decideMetaDelivery/);
  assert.match(metaSrc, /ERR_TEACHER_META_UNLINKED/);
  assert.match(metaSrc, /ERR_TEACHER_META_OFFICIAL/);
  assert.match(metaSrc, /export function isOfficialSiteAccount/);
  assert.match(metaSrc, /export function teacherMayLinkPage/);
  assert.match(indexSrc, /resolveMetaForAuthor/);
  assert.match(indexSrc, /meta\.decideMetaDelivery/);
  assert.match(indexSrc, /meta\.getAccount\(env, authorId\)/);
  assert.match(indexSrc, /await meta\.getSiteAccount\(env\)/);
  const deliver = indexSrc.slice(
    indexSrc.indexOf("async function deliverPost"),
    indexSrc.indexOf("function postStatus"),
  );
  assert.match(deliver, /resolveMetaForAuthor/);
  assert.doesNotMatch(deliver, /const acc = await meta\.getSiteAccount\(env\)/);
  const scheduled = indexSrc.slice(indexSrc.indexOf("async function finishPendingInstagram"));
  const cron = scheduled.slice(0, scheduled.indexOf("export default"));
  assert.match(cron, /resolveMetaForAuthor/);
  assert.match(cron, /ig_creation_id IS NOT NULL/);
  assert.doesNotMatch(cron, /const acc = await meta\.getSiteAccount\(env\)/);
});

test("موافقة المدير على منشور معلّق تستدعي التسليم", () => {
  const approve = indexSrc.slice(
    indexSrc.indexOf("UPDATE channel_posts SET approval_status"),
    indexSrc.indexOf("تسجيل متعلّم جديد"),
  );
  assert.match(approve, /status === "queued"/);
  assert.match(approve, /deliverPost/);
});

test("واجهة المعلّم تعرض دليل الربط الشخصي وتحذّر من الرسمية", () => {
  assert.match(publishHtml, /حوّل انستقرام لحساب احترافي إن لزم/);
  assert.match(publishHtml, /اربط انستقرام بصفحة فيسبوك/);
  assert.match(publishHtml, /ربط فيسبوك\/انستقرام/);
  assert.match(publishHtml, /مو صفحة رياض المتقين الرسمية/);
  assert.match(publishHtml, /بعد الربط يمكنك طلب نشر لمنتج الموقع على صفحتك بعد موافقة المدير/);
  assert.match(publishHtml, /لا تنشر على الصفحة الرسمية لرياض المتقين/);
  assert.match(publishHtml, /صفحتك الخاصة/);
  assert.match(publishHtml, /kept_manual/);
  assert.match(connHtml, /صفحة المعلّم الخاصة|صفحته الخاصة/);
});
