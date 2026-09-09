/**
 * مسار نشر فيديو فيسبوك: ريلز عمودي عبر video_reels لا /videos فقط.
 * يختبر دوال القرار ومفسّر MP4 ويقرأ المصدر حتى لا ينحدر التنفيذ.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const metaSrc = readFileSync(join(root, "src/meta.ts"), "utf8");
const indexSrc = readFileSync(join(root, "src/index.ts"), "utf8");
const youtubeSrc = readFileSync(join(root, "src/youtube.ts"), "utf8");

function facebookVideoPublishPath(dims) {
  if (dims && dims.width > dims.height) return "videos";
  return "reels";
}

function isMetaRuploadUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "rupload.facebook.com";
  } catch {
    return false;
  }
}

function explainFacebookPublishError(err) {
  const raw = err instanceof Error ? err.message : String(err);
  if (/1363040|aspect ratio/i.test(raw)) {
    return `نسبة أبعاد الفيديو غير مدعومة لريلز فيسبوك (يلزم تقريباً 9:16). — تفاصيل Meta: ${raw}`;
  }
  if (/1363127|resolution too low|minimum resolution/i.test(raw)) {
    return `دقة الفيديو أقل من الحد الأدنى لريلز فيسبوك (540×960 على الأقل، يُفضَّل 1080×1920). — تفاصيل Meta: ${raw}`;
  }
  if (/1363128|duration/i.test(raw)) {
    return `مدة الريل يجب أن تكون بين 3 و90 ثانية. — تفاصيل Meta: ${raw}`;
  }
  if (/1363129|frame rate/i.test(raw)) {
    return `معدل إطارات الريل يجب أن يكون بين 24 و60 إطاراً في الثانية. — تفاصيل Meta: ${raw}`;
  }
  if (/rate limit|#4\b|30 API-published|publishing limit/i.test(raw)) {
    return `تجاوزت حد نشر ريلز فيسبوك (30 منشوراً كل 24 ساعة). — تفاصيل Meta: ${raw}`;
  }
  return raw;
}

function parseMp4Dimensions(buf) {
  const view = new DataView(buf);
  const found = [];

  const readType = (offset) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );

  const readTkhd = (start, end) => {
    if (start + 8 > end) return null;
    const version = view.getUint8(start);
    const dimOffset = version === 1 ? start + 88 : start + 76;
    if (dimOffset + 8 > end) return null;
    const width = Math.round(view.getUint32(dimOffset) / 65536);
    const height = Math.round(view.getUint32(dimOffset + 4) / 65536);
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  };

  const walk = (start, end) => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      const type = readType(offset + 4);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) break;
        if (view.getUint32(offset + 8) !== 0) break;
        size = view.getUint32(offset + 12);
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) break;
      const payloadStart = offset + header;
      const payloadEnd = offset + size;
      if (type === "moov" || type === "trak" || type === "mdia") {
        walk(payloadStart, payloadEnd);
      } else if (type === "tkhd") {
        const dims = readTkhd(payloadStart, payloadEnd);
        if (dims) found.push(dims);
      }
      offset += size;
    }
  };

  try {
    walk(0, view.byteLength);
  } catch {
    return null;
  }
  if (!found.length) return null;
  found.sort((a, b) => b.width * b.height - a.width * a.height);
  return found[0];
}

function box(type, payload) {
  const buf = Buffer.alloc(8 + payload.length);
  buf.writeUInt32BE(8 + payload.length, 0);
  buf.write(type, 4, 4, "ascii");
  payload.copy(buf, 8);
  return buf;
}

function tkhdBox({ width, height, version = 0 }) {
  const dimOff = version === 1 ? 88 : 76;
  const payload = Buffer.alloc(dimOff + 8);
  payload.writeUInt8(version, 0);
  payload.writeUInt32BE(width << 16, dimOff);
  payload.writeUInt32BE(height << 16, dimOff + 4);
  return box("tkhd", payload);
}

function mp4Buffer(w, h, version = 0) {
  const trak = box("trak", tkhdBox({ width: w, height: h, version }));
  const moov = box("moov", trak);
  const ftyp = box("ftyp", Buffer.from("isom"));
  const all = Buffer.concat([ftyp, moov]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

test("الفيديو العمودي والمجهول يُنشران ريلز — الأفقي يبقى /videos", () => {
  assert.equal(facebookVideoPublishPath({ width: 1080, height: 1920 }), "reels");
  assert.equal(facebookVideoPublishPath({ width: 1080, height: 1080 }), "reels");
  assert.equal(facebookVideoPublishPath(null), "reels");
  assert.equal(facebookVideoPublishPath({ width: 1920, height: 1080 }), "videos");
  assert.equal(facebookVideoPublishPath({ width: 1280, height: 720 }), "videos");
});

test("parseMp4Dimensions يقرأ tkhd العمودي والأفقي (v0 و v1)", () => {
  assert.deepEqual(parseMp4Dimensions(mp4Buffer(1080, 1920)), { width: 1080, height: 1920 });
  assert.deepEqual(parseMp4Dimensions(mp4Buffer(1920, 1080)), { width: 1920, height: 1080 });
  assert.deepEqual(parseMp4Dimensions(mp4Buffer(1080, 1920, 1)), { width: 1080, height: 1920 });
  assert.equal(parseMp4Dimensions(new ArrayBuffer(16)), null);
});

test("isMetaRuploadUrl يقبل مضيف الرفع الرسمي فقط", () => {
  assert.equal(isMetaRuploadUrl("https://rupload.facebook.com/video-upload/123"), true);
  assert.equal(isMetaRuploadUrl("https://rupload.facebook.com/video-upload/v21.0/123"), true);
  assert.equal(isMetaRuploadUrl("https://graph.facebook.com/video-upload/123"), false);
  assert.equal(isMetaRuploadUrl("http://rupload.facebook.com/video-upload/123"), false);
  assert.equal(isMetaRuploadUrl("https://evil.example/rupload.facebook.com"), false);
  assert.equal(isMetaRuploadUrl("not-a-url"), false);
});

test("رسائل أخطاء ريلز فيسبوك بالعربية", () => {
  assert.match(explainFacebookPublishError("(#1363040) aspect ratio"), /9:16/);
  assert.match(explainFacebookPublishError("1363127 minimum resolution"), /540/);
  assert.match(explainFacebookPublishError("1363128 duration not supported"), /90/);
  assert.match(explainFacebookPublishError("1363129 frame rate"), /24/);
  assert.match(explainFacebookPublishError("30 API-published posts rate limit"), /24 ساعة/);
  assert.equal(explainFacebookPublishError("خطأ آخر"), "خطأ آخر");
});

test("المصدر ينشر الريل عبر video_reels ثم rupload ثم finish/PUBLISHED", () => {
  const start = metaSrc.indexOf("export async function publishFacebook");
  const end = metaSrc.indexOf("export async function createIgContainer");
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const fb = metaSrc.slice(metaSrc.indexOf("async function publishFacebookReel"), end);
  assert.match(fb, /video_reels/);
  assert.match(fb, /upload_phase:\s*"start"/);
  assert.match(fb, /upload_phase:\s*"finish"/);
  assert.match(fb, /video_state:\s*"PUBLISHED"/);
  assert.match(fb, /rupload\.facebook\.com/);
  assert.match(fb, /Authorization:\s*`OAuth /);
  assert.match(fb, /file_size/);
  assert.match(fb, /offset/);
  assert.match(fb, /application\/octet-stream/);
  assert.match(metaSrc, /export function facebookVideoPublishPath/);
  assert.match(metaSrc, /export function parseMp4Dimensions/);
  assert.match(metaSrc, /export function isMetaRuploadUrl/);
  assert.match(metaSrc, /export function explainFacebookPublishError/);
  assert.match(metaSrc, /developers\.facebook\.com\/docs\/video-api\/guides\/reels-publishing/);
  assert.match(metaSrc, /videos_fallback/);
  assert.match(metaSrc, /فيديو صفحة لا ريلاً/);
});

test("publishFacebook لا يعتمد /videos وحده لكل الفيديوهات", () => {
  const block = metaSrc.slice(
    metaSrc.indexOf("export async function publishFacebook"),
    metaSrc.indexOf("export async function createIgContainer"),
  );
  assert.match(block, /facebookVideoPublishPath/);
  assert.match(block, /publishFacebookReel/);
  assert.match(block, /publishFacebookPageVideo/);
  assert.match(block, /path === "reels"/);
});

test("انستقرام ما زال REELS ويوتيوب لم يُمسّ", () => {
  const ig = metaSrc.slice(metaSrc.indexOf("export async function createIgContainer"));
  assert.match(ig, /media_type = "REELS"/);
  assert.match(indexSrc, /meta\.publishFacebook\(acc, content, absMedia\)/);
  assert.match(indexSrc, /yt\.uploadVideo/);
  assert.match(youtubeSrc, /googleapis\.com\/upload\/youtube/);
  assert.doesNotMatch(youtubeSrc, /video_reels/);
});

function isDueForIgOrScheduleCron(p) {
  if (p.status !== "scheduled" || p.approval_status !== "approved") return false;
  if (p.ig_creation_id) return true;
  return Boolean(p.scheduled_at && p.scheduled_at <= "2026-09-09 19:10:00");
}

function upsertChannelDelivery(raw, result) {
  let list = [];
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) {
      list = parsed.filter((x) => x && typeof x === "object" && typeof x.channel === "string");
    }
  } catch {
    list = [];
  }
  const i = list.findIndex((d) => d.channel === result.channel);
  if (i >= 0) list[i] = result;
  else list.push(result);
  return list;
}

test("cron يلتقط حاوية انستقرام المعلّقة بلا scheduled_at (منشور 13)", () => {
  const cron = indexSrc.slice(
    indexSrc.indexOf("async function processScheduledPosts"),
    indexSrc.indexOf("export default"),
  );
  assert.match(cron, /ig_creation_id IS NOT NULL/);
  assert.match(cron, /ig_creation_id IS NOT NULL\s*\n\s*OR \(scheduled_at IS NOT NULL AND scheduled_at <= datetime\('now'\)\)/);
  assert.doesNotMatch(
    cron,
    /WHERE status = 'scheduled' AND approval_status = 'approved'\s*\n\s*AND scheduled_at IS NOT NULL AND scheduled_at <= datetime\('now'\)/,
  );
  assert.match(cron, /finishPendingInstagram/);
  assert.match(indexSrc, /COALESCE\(scheduled_at, datetime\('now'\)\)/);
  assert.match(indexSrc, /persistPostDelivery/);
  assert.match(indexSrc, /upsertChannelDelivery/);

  // منشور «الآن» العالق: scheduled + ig_creation_id + scheduled_at فارغ
  assert.equal(
    isDueForIgOrScheduleCron({
      status: "scheduled",
      approval_status: "approved",
      ig_creation_id: "1789pending",
      scheduled_at: null,
    }),
    true,
  );
  assert.equal(
    isDueForIgOrScheduleCron({
      status: "scheduled",
      approval_status: "approved",
      ig_creation_id: null,
      scheduled_at: null,
    }),
    false,
  );
  assert.equal(
    isDueForIgOrScheduleCron({
      status: "scheduled",
      approval_status: "approved",
      ig_creation_id: null,
      scheduled_at: "2026-09-09 18:00:00",
    }),
    true,
  );
});

test("إكمال الريل من cron يحدّث delivery ولا يمسح فيسبوك", () => {
  const merged = upsertChannelDelivery(
    JSON.stringify([
      { channel: "facebook", ok: true, id: "fb1" },
      { channel: "instagram", ok: false, error: "الفيديو ما زال يُعالَج — سيُنشر تلقائياً خلال دقائق." },
    ]),
    { channel: "instagram", ok: true, id: "ig99" },
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].ok, true);
  assert.equal(merged[0].id, "fb1");
  assert.equal(merged[1].ok, true);
  assert.equal(merged[1].id, "ig99");
  assert.equal(merged[1].error, undefined);

  const finish = indexSrc.slice(
    indexSrc.indexOf("async function finishPendingInstagram"),
    indexSrc.indexOf("async function processScheduledPosts"),
  );
  assert.match(finish, /publishIgContainer/);
  assert.match(finish, /upsertChannelDelivery/);
  assert.match(finish, /persistPostDelivery/);
  assert.match(finish, /تعذّرت معالجة ريل انستقرام/);
});

test("قائمة منشورات المعلّم تعرض delivery و ig_creation_id", () => {
  const getPosts = indexSrc.slice(
    indexSrc.indexOf('if (route === "GET /api/teacher/posts")'),
    indexSrc.indexOf('if (route === "POST /api/teacher/posts")'),
  );
  assert.match(getPosts, /delivery/);
  assert.match(getPosts, /ig_creation_id/);
});
