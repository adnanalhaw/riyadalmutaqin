/* ===== استوديو رياض المتقين =====
   رحلة عمل من ثلاث خطوات:
   ١) التفاصيل + اختيار التصميم (٥ تصاميم لصورة ثابتة بهويتنا)
   ٢) إرفاق مقطع (اختياري) — تُستبدل صورته كلياً بتصميمنا ويبقى صوته
   ٣) تنزيل مباشر لكل منصّة: صورة، وفيديو بصورتنا إن أُرفق مقطع.
   كل مقاس يراعي «المنطقة الآمنة» الحقيقية لواجهة منصّته. */

const PLATFORMS = [
  // safe: [أعلى, يمين, أسفل, يسار] بالبكسل
  { key: "tiktok",    name: "تيك توك",           w: 1080, h: 1920, safe: [220, 180, 420, 60] },
  { key: "reels",     name: "ريلز إنستغرام",     w: 1080, h: 1920, safe: [180, 140, 460, 60] },
  { key: "story",     name: "ستوري إنستغرام",    w: 1080, h: 1920, safe: [260, 60, 260, 60] },
  { key: "igpost",    name: "منشور إنستغرام",    w: 1080, h: 1350, safe: [60, 60, 60, 60] },
  { key: "whatsapp",  name: "حالة واتساب",       w: 1080, h: 1920, safe: [200, 60, 200, 60] },
  { key: "telegram",  name: "تيليغرام",          w: 1080, h: 1080, safe: [60, 60, 60, 60] },
  { key: "x",         name: "منشور إكس (X)",     w: 1600, h: 900,  safe: [50, 50, 50, 50] },
  { key: "facebook",  name: "منشور فيسبوك",      w: 1200, h: 630,  safe: [40, 40, 40, 40] },
  { key: "youtube",   name: "مصغّرة يوتيوب",     w: 1280, h: 720,  safe: [40, 40, 40, 40] },
];

/* التصميم المعتمد الوحيد (اختاره المشغّل من كانفا — «أفضل تصميم معمول»).
   القوالب القديمة باقية في STYLE_PAINTERS كي تُعرض عناصر المكتبة المحفوظة قديماً. */
const STYLES = [
  { key: "medallion", name: "تصميم رياض المتقين المعتمد" },
];

const BRAND = {
  g: ["#0B1F36", "#16253E", "#37293A", "#2A181A"],
  gold: "#D8C07A", gold2: "#D8C07A", goldSec: "#A98A4A", goldDeep: "#8C6C36",
  frame: "#8FA9C6", frameSoft: "rgba(143,169,198,.45)",
  cream: "#F6F2E8", brown: "#5E4B33", night: "#0A1E33", silhouette: "#081720",
};

let logoImage = null;
let sceneImage = null; // مشهد القرآن والقنديل والمسجد من التصميم المعتمد

function loadScene() {
  return new Promise((resolve) => {
    if (sceneImage) return resolve();
    const img = new Image();
    img.onload = () => { sceneImage = img; resolve(); };
    img.onerror = () => { sceneImage = null; resolve(); };
    img.src = "verse-scene.jpg";
  });
}

function loadLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { logoImage = img; resolve(); };
    img.onerror = () => { logoImage = null; resolve(); };
    img.src = "logo.png";
  });
}

async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load('700 80px "Aref Ruqaa"'),
      document.fonts.load('400 60px "Amiri"'),
      document.fonts.load('700 60px "Amiri"'),
      document.fonts.ready,
    ]);
  } catch { }
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const probe = line ? line + " " + w : w;
    if (ctx.measureText(probe).width <= maxWidth || !line) line = probe;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ===== عناصر مشتركة ===== */
function paintBg(ctx, w, h, topColor) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, topColor || BRAND.g[0]); grad.addColorStop(.35, BRAND.g[1]);
  grad.addColorStop(.7, BRAND.g[2]); grad.addColorStop(1, BRAND.g[3]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  // نسيج هندسي إسلامي: شبكة نجوم ثمانية شفافة تكسو الخلفية كلها (كالتصميم الأصلي)
  ctx.save();
  ctx.globalAlpha = .055; ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(1, w * .0012);
  const st = Math.max(180, w * .21);
  for (let y = 0; y <= h + st; y += st * .86)
    for (let x = (Math.round(y / (st * .86)) % 2 ? st / 2 : 0); x <= w + st; x += st) {
      star8(ctx, x, y, st * .36); ctx.stroke();
      star8(ctx, x, y, st * .18); ctx.stroke();
    }
  ctx.restore();
  // فينييت يعمّق الأطراف ويركّز النظر على الوسط
  const vg = ctx.createRadialGradient(w / 2, h * .45, Math.min(w, h) * .45, w / 2, h * .5, Math.max(w, h) * .8);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(3,10,20,.38)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}

function paintStars(ctx, w, h) {
  ctx.fillStyle = BRAND.cream;
  const pts = [[.1, .07], [.22, .16], [.36, .05], [.52, .1], [.66, .05], [.8, .12], [.9, .07], [.15, .3], [.85, .28], [.06, .45]];
  for (const [px, py] of pts) {
    ctx.globalAlpha = .35 + (px * 7 % 1) * .45;
    ctx.beginPath(); ctx.arc(px * w, py * h, Math.max(1.5, w * .002), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintCrescent(ctx, x, y, r, fill, cutFill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = cutFill; ctx.beginPath(); ctx.arc(x + r * .45, y - r * .2, r * .9, 0, 7); ctx.fill();
}

function paintLogo(ctx, cx, y, r) {
  // توهّج ذهبي ناعم خلف الشعار (كما في التصميم الأصلي)
  const gl = ctx.createRadialGradient(cx, y + r, r * .5, cx, y + r, r * 2.2);
  gl.addColorStop(0, "rgba(216,192,122,.22)"); gl.addColorStop(1, "rgba(216,192,122,0)");
  ctx.fillStyle = gl;
  ctx.beginPath(); ctx.arc(cx, y + r, r * 2.2, 0, 7); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, y + r, r, 0, 7); ctx.closePath();
  ctx.fillStyle = "#0d1a10"; ctx.fill(); ctx.clip();
  if (logoImage) ctx.drawImage(logoImage, cx - r, y, r * 2, r * 2);
  else {
    ctx.fillStyle = BRAND.gold2;
    ctx.font = `700 ${Math.round(r * .5)}px "Aref Ruqaa", serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("رياض", cx, y + r * .8);
    ctx.fillText("المتقين", cx, y + r * 1.3);
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, y + r, r, 0, 7);
  ctx.strokeStyle = BRAND.frameSoft; ctx.lineWidth = Math.max(1.5, r * .03); ctx.stroke();
}

function star8(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const ang = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * .42;
    const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/* لوحة قوس مدبّب مزخرف حول النص — على هيئة إطار الآية في التصميم الأصلي */
function paintArchPanel(ctx, cx, top, w, bottom, S) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const archH = w * .34;
  const ys = top + archH; // كتف القوس
  const path = (inset) => {
    const xa = x0 + inset, xb = x1 - inset, yb = bottom - inset, tp = top + inset * 1.6;
    ctx.beginPath();
    ctx.moveTo(xa, yb);
    ctx.lineTo(xa, ys);
    ctx.quadraticCurveTo(xa, ys - archH * .62, cx - w * .17, ys - archH * .66);
    ctx.quadraticCurveTo(cx - w * .045, ys - archH * .78, cx, tp);
    ctx.quadraticCurveTo(cx + w * .045, ys - archH * .78, cx + w * .17, ys - archH * .66);
    ctx.quadraticCurveTo(xb, ys - archH * .62, xb, ys);
    ctx.lineTo(xb, yb);
    ctx.closePath();
  };
  // تعبئة ناعمة تميّز اللوحة عن الخلفية (فجر أعلى → دفء غروب أسفل)
  path(0);
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, "rgba(146,175,214,.10)");
  g.addColorStop(.55, "rgba(11,31,54,.20)");
  g.addColorStop(1, "rgba(224,140,66,.09)");
  ctx.fillStyle = g; ctx.fill();
  // حدّ ذهبي رفيع خارجي + حدّ فجري أرفع داخلي
  path(0); ctx.strokeStyle = "rgba(216,192,122,.9)"; ctx.lineWidth = Math.max(1.5, 2.2 * S); ctx.stroke();
  path(11 * S); ctx.strokeStyle = BRAND.frameSoft; ctx.lineWidth = Math.max(1, 1.2 * S); ctx.stroke();
  // ذؤابة ۞ فوق القمّة ونجمتان بزاويتي القاعدة
  ctx.fillStyle = BRAND.gold; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.font = `${Math.round(34 * S)}px serif`; ctx.fillText("۞", cx, top - 16 * S);
  ctx.fillStyle = BRAND.goldSec;
  star8(ctx, x0, bottom, 9 * S); ctx.fill();
  star8(ctx, x1, bottom, 9 * S); ctx.fill();
}

/* كتلة النص (الشعار + الاسم + الفاصل + العنوان + الشارة) داخل صندوق.
   بالأوضاع الطولية تُحاط بالقوس المزخرف، ويتكبّر المحتوى تلقائياً ليملأ
   الفراغ الرأسي بدل أن يضيع صغيراً وسط مساحة فارغة. */
function paintContent(ctx, box, S, data, opts = {}) {
  const landscape = opts.landscape;
  const cx = box.x + box.w / 2 + (opts.shiftX || 0);
  const reserve = opts.bottomReserve || 0; // مساحة ختم QR والمشهد أسفل المحتوى
  const arch = !landscape && opts.arch !== false;
  const aw = box.w * .88, archH = arch ? aw * .34 : 0;

  const measure = (k) => {
    const nameSize = Math.round((landscape ? 60 : 74) * S * k);
    const subjSize = Math.round((landscape ? 52 : 62) * S * k);
    const logoR = (landscape ? 84 : 112) * S * k;
    ctx.font = `700 ${nameSize}px "Aref Ruqaa", serif`;
    const nameLines = wrapText(ctx, ((data.title ? data.title + " " : "") + (data.name || "")).trim(), box.w * (arch ? .7 : .8));
    ctx.font = `700 ${subjSize}px "Amiri", serif`;
    const subjLines = wrapText(ctx, data.subject || "", box.w * (arch ? .64 : .78));
    const gapLogo = arch ? 26 * S : 36 * S;
    const headroom = (arch ? archH * .38 : 0) + nameSize; // نزول أول سطر تحت قمّة القوس/الشعار
    const contentH = logoR * 2 + gapLogo + headroom + nameLines.length * nameSize * 1.35 +
      6 * S + 66 * S + subjLines.length * subjSize * 1.5 +
      (data.audioBadge ? 110 * S : 0) + (arch ? 56 * S : 0);
    return { nameSize, subjSize, logoR, nameLines, subjLines, gapLogo, headroom, contentH };
  };

  let m = measure(opts.scale || 1);
  const avail = box.h - reserve - 96 * S;
  const grow = Math.min(landscape ? 1.12 : 1.5, Math.max(.85, (avail * .9) / m.contentH));
  if (Math.abs(grow - 1) > .03) m = measure((opts.scale || 1) * grow);

  let y = box.y + Math.max(48 * S, (box.h - reserve - m.contentH) / 2) + (opts.shiftY || 0);

  if (arch) paintArchPanel(ctx, cx, y + m.logoR * 2 + m.gapLogo, aw, y + m.contentH, S);
  paintLogo(ctx, cx, y, m.logoR);
  y += m.logoR * 2 + m.gapLogo + m.headroom;
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  if (arch) { // زخرفة داخل قمّة القوس فوق الاسم
    ctx.fillStyle = "rgba(216,192,122,.7)";
    ctx.font = `${Math.round(26 * S)}px serif`;
    ctx.fillText("۞", cx, y - m.nameSize * 1.5);
  }
  ctx.fillStyle = BRAND.gold2;
  ctx.font = `700 ${m.nameSize}px "Aref Ruqaa", serif`;
  for (const line of m.nameLines) { ctx.fillText(line, cx, y); y += m.nameSize * 1.35; }
  y += 6 * S;
  // فاصل مزخرف: خط ذهبي بنجمتين على طرفيه و۞ في وسطه
  ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(2, 3 * S);
  ctx.beginPath(); ctx.moveTo(cx - 130 * S, y); ctx.lineTo(cx + 130 * S, y); ctx.stroke();
  ctx.fillStyle = BRAND.gold;
  star8(ctx, cx - 150 * S, y, 7 * S); ctx.fill();
  star8(ctx, cx + 150 * S, y, 7 * S); ctx.fill();
  ctx.font = `${Math.round(32 * S)}px serif`; ctx.fillText("۞", cx, y + 11 * S);
  y += 66 * S;
  ctx.fillStyle = BRAND.cream;
  ctx.font = `700 ${m.subjSize}px "Amiri", serif`;
  for (const line of m.subjLines) { ctx.fillText(line, cx, y); y += m.subjSize * 1.5; }
  if (data.audioBadge) {
    y += 26 * S;
    const label = "🎧 مقطع صوتي";
    ctx.font = `700 ${Math.round(38 * S)}px "Amiri", serif`;
    const bw = ctx.measureText(label).width + 84 * S, bh = 72 * S;
    roundRect(ctx, cx - bw / 2, y - bh / 2 - 8 * S, bw, bh, bh / 2);
    ctx.fillStyle = "rgba(169,138,74,.2)"; ctx.fill();
    ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(2, 3 * S); ctx.stroke();
    ctx.fillStyle = BRAND.gold2; ctx.fillText(label, cx, y + 12 * S);
  }
}

/* ===== QR زخرفي يوصل للموقع مباشرة =====
   بلاطة كريمية بحدّ ذهبي مزدوج ونجوم ثمانية بالزوايا، والوحدات بأركان
   منحنية بلون أخضر ليلي — تُقرأ بكل الماسحات (منطقة هدوء محفوظة). */
let _qrCache = null;
function qrMatrix() {
  if (_qrCache) return _qrCache;
  if (typeof qrcode === "undefined") return null; // qr.js غير محمّل — نتخطى بهدوء
  const qr = qrcode(0, "M");
  qr.addData("https://riyadalmutaqin.com");
  qr.make();
  _qrCache = { n: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) };
  return _qrCache;
}

/* ارتفاع منطقة الختم (للحجز في توسيط المحتوى) */
function qrReserve(S, landscape) {
  const size = (landscape ? 128 : 200) * S;
  return size + (size / 25) * 8.4 + 96 * S;
}

/* ارتفاع شريط المشهد (القرآن والقنديل والمسجد) */
function sceneBandH(box, landscape) {
  return Math.min(box.h * (landscape ? .46 : .4), landscape ? 380 : 640);
}

/* الحجز الكلي أسفل المحتوى: الختم + النصف الظاهر من المشهد */
function bottomReserve(box, S, landscape) {
  return qrReserve(S, landscape) + sceneBandH(box, landscape) * .45;
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* لون خلفية التصميم عند نسبة ارتفاع معيّنة — للدمج بلون الموضع نفسه لا بلون ثابت */
function bgColorAt(t) {
  const stops = [[0, BRAND.g[0]], [.35, BRAND.g[1]], [.7, BRAND.g[2]], [1, BRAND.g[3]]];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++)
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  const k = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
  const c1 = hexRgb(a[1]), c2 = hexRgb(b[1]);
  return c1.map((v, i) => Math.round(v + (c2[i] - v) * k)).join(",");
}

/* مشهد القرآن والقنديل والمسجد مذاباً في التصميم لا ملصوقاً:
   يمتد لحواف اللوحة الثلاث (يمين/يسار/أسفل) بلا أي مستطيل داخلي، ويُذاب من
   أعلاه بتدرّج طويل بلون الخلفية في موضعه نفسه، وتُصبغ الصورة كلها بطبقة من
   تدرّج الهوية (فجر×غروب) مع تعتيم جانبي ناعم — فيصير جزءاً من الخلفية. */
function paintSceneBand(ctx, p, box, landscape) {
  if (!sceneImage) return;
  const by = box.y + box.h - sceneBandH(box, landscape);
  const bandH = p.h - by; // يبلغ أسفل اللوحة تماماً — لا حافة سفلية
  // مصدر القصّ: الربع الأيمن-السفلي (القرآن + القنديل + المسجد فقط — بلا أي نص)
  const sx = sceneImage.width * .46, sy = sceneImage.height * .56;
  const sw = sceneImage.width * .54, sh = sceneImage.height * .44;
  const scale = Math.max(p.w / sw, bandH / sh);
  const dw = sw * scale, dh = sh * scale;
  const deep = hexRgb(BRAND.g[3]).join(",");
  // نرسم المشهد على لوحة جانبية ثم نمحو أعلاه بقناع شفافية متدرّج —
  // فتظهر خلفية التصميم الحقيقية (بإطاراتها وتوهّجاتها) عبر الذوبان بلا أي خطّ لوني
  const off = document.createElement("canvas");
  off.width = p.w; off.height = bandH;
  const o = off.getContext("2d");
  o.drawImage(sceneImage, sx, sy, sw, sh, (p.w - dw) / 2, bandH - dh, dw, dh);
  // صبغة الهوية فوق المشهد كله — فيرث درجات الفجر والغروب بدل ألوان الصورة الخام
  const tint = o.createLinearGradient(0, 0, 0, bandH);
  tint.addColorStop(0, `rgba(${bgColorAt(by / p.h)},.42)`);
  tint.addColorStop(.55, `rgba(${bgColorAt((by + bandH * .55) / p.h)},.2)`);
  tint.addColorStop(1, `rgba(${deep},.32)`);
  o.fillStyle = tint; o.fillRect(0, 0, p.w, bandH);
  // تعتيم جانبي ناعم (ظلّ عمق لا رقعة لون)
  const vw = p.w * .2;
  const lv = o.createLinearGradient(0, 0, vw, 0);
  lv.addColorStop(0, `rgba(${deep},.4)`); lv.addColorStop(1, `rgba(${deep},0)`);
  o.fillStyle = lv; o.fillRect(0, 0, vw, bandH);
  const rv = o.createLinearGradient(p.w, 0, p.w - vw, 0);
  rv.addColorStop(0, `rgba(${deep},.4)`); rv.addColorStop(1, `rgba(${deep},0)`);
  o.fillStyle = rv; o.fillRect(p.w - vw, 0, vw, bandH);
  // قناع الذوبان العلوي: محو متدرّج طويل لأعلى المشهد نفسه
  o.globalCompositeOperation = "destination-out";
  const mask = o.createLinearGradient(0, 0, 0, bandH * .62);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(.4, "rgba(0,0,0,.6)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  o.fillStyle = mask; o.fillRect(0, 0, p.w, bandH * .62);
  ctx.drawImage(off, 0, by);
}

function paintQR(ctx, box, S, landscape) {
  const m = qrMatrix();
  if (!m) return;
  // ختم متناسق وسط أسفل التصميم — بلاطة عاجية بميل ذهبي (لا بيضاء صارخة)
  const size = (landscape ? 128 : 200) * S; // أكبر بالطولي — وضوح مسح أعلى
  const pad = (size / m.n) * 4.2; // منطقة هدوء ≥ ٤ خلايا (شرط القراءة)
  const x = Math.round(box.x + (box.w - size) / 2);
  const y = Math.round(box.y + box.h - size - pad - 74 * S);
  const tile = { x: x - pad, y: y - pad, w: size + pad * 2, h: size + pad * 2 };
  // توهّج ناعم خلف الختم يدمجه بالخلفية
  const halo = ctx.createRadialGradient(x + size / 2, y + size / 2, size * .3, x + size / 2, y + size / 2, size * 1.1);
  halo.addColorStop(0, "rgba(216,192,122,.18)"); halo.addColorStop(1, "rgba(216,192,122,0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size * 1.1, 0, 7); ctx.fill();
  // البلاطة: تدرّج عاجي→ذهبي فاتح من لوحة الهوية
  roundRect(ctx, tile.x, tile.y, tile.w, tile.h, 18 * S);
  const tg = ctx.createLinearGradient(0, tile.y, 0, tile.y + tile.h);
  tg.addColorStop(0, "#F6F2E8"); tg.addColorStop(1, "#E9DCBB");
  ctx.fillStyle = tg; ctx.fill();
  ctx.strokeStyle = BRAND.goldSec; ctx.lineWidth = Math.max(1.5, 2 * S); ctx.stroke();
  roundRect(ctx, tile.x + 6 * S, tile.y + 6 * S, tile.w - 12 * S, tile.h - 12 * S, 13 * S);
  ctx.strokeStyle = "rgba(169,138,74,.55)"; ctx.lineWidth = Math.max(1, 2 * S); ctx.stroke();
  // نجوم ثمانية عتيقة على الزوايا + تاج
  ctx.fillStyle = BRAND.goldSec;
  for (const [sx, sy] of [[tile.x, tile.y], [tile.x + tile.w, tile.y], [tile.x, tile.y + tile.h], [tile.x + tile.w, tile.y + tile.h]]) {
    star8(ctx, sx, sy, 10 * S); ctx.fill();
  }
  star8(ctx, x + size / 2, tile.y - 12 * S, 8.5 * S);
  ctx.fillStyle = BRAND.gold; ctx.fill();
  // وحدات الرمز مربعة حادة بلون الأخضر الغني — التدوير يكسر القراءة (مُثبت بـ jsQR)
  const cell = size / m.n;
  ctx.fillStyle = "#163B2A";
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) {
    if (m.dark(r, c)) ctx.fillRect(x + c * cell, y + r * cell, cell + .5, cell + .5);
  }
  // التذييل تحت الختم — يكتمل به الشكل ككتلة واحدة
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(246,242,232,.85)";
  ctx.font = `${Math.round(30 * S)}px "Amiri", serif`;
  ctx.fillText("امسح لزيارة الموقع · riyadalmutaqin.com", box.x + box.w / 2, tile.y + tile.h + 44 * S);
}

/* ===== التصاميم ===== */
const STYLE_PAINTERS = {
  /* التصميم المعتمد: رأس «درس علمي من قناة رياض المتقين»، بيضاوية مزخرفة
     بقوس ذهبي وهلال ونجوم ومشهد المصحف والقنديل، وكلمتا «علم» و«تقوى»
     على الجانبين، ووصف القناة أسفلها فوق ختم QR — على هيئة تصميم كانفا المختار. */
  medallion(ctx, p, box, S, data) {
    const landscape = p.w > p.h;
    if (!data._noBg) { paintBg(ctx, p.w, p.h); paintStars(ctx, p.w, p.h); }
    const cx = box.x + box.w / 2;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";

    // الرأس
    let y = box.y + (landscape ? 46 : 70) * S;
    ctx.fillStyle = "rgba(246,242,232,.95)";
    ctx.font = `${Math.round((landscape ? 27 : 36) * S)}px "Amiri", serif`;
    ctx.fillText("درس علمي من قناة", cx, y);
    y += (landscape ? 64 : 100) * S;
    ctx.fillStyle = BRAND.gold2;
    ctx.font = `700 ${Math.round((landscape ? 66 : 96) * S)}px "Aref Ruqaa", serif`;
    ctx.fillText("رياض المتقين", cx, y);
    const headerBottom = y + 22 * S;

    // الذيل: وصف القناة فوق ختم QR (حجز الختم قد يُمرَّر من العمود الموحّد)
    const reserve = data._qrSlot || qrReserve(S, landscape);
    const descSize = Math.round((landscape ? 25 : 31) * S);
    const descY = box.y + box.h - reserve - (landscape ? 12 : 22) * S;
    ctx.fillStyle = "rgba(246,242,232,.92)";
    ctx.font = `${descSize}px "Amiri", serif`;
    ctx.fillText("قناة رياض المتقين تنقل لكم أروع الدروس الدينية والأخلاقية", cx, descY);

    // البيضاوية الوسطية
    const ovalTop = headerBottom + (landscape ? 16 : 38) * S;
    const ovalBottom = descY - descSize - (landscape ? 18 : 42) * S;
    const cy = (ovalTop + ovalBottom) / 2;
    const ry = (ovalBottom - ovalTop) / 2;
    const rx = Math.min(box.w * .38, ry * .85);

    // كلمتا الجانبين — في منتصف الفراغ بين حافة الصندوق والبيضاوية، وتُحذفان إن ضاق
    const sideRoom = cx - rx - 11 * S - box.x;
    if (sideRoom > 80 * S) {
      ctx.fillStyle = BRAND.gold;
      ctx.font = `700 ${Math.round((landscape ? 28 : 34) * S)}px "Amiri", serif`;
      ctx.fillText("علم", cx + rx + 11 * S + sideRoom / 2, cy + 10 * S);
      ctx.fillText("تقوى", box.x + sideRoom / 2, cy + 10 * S);
    }

    // داخل البيضاوية
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.clip();
    const og = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    og.addColorStop(0, "#0A1C33"); og.addColorStop(.6, "#122A47"); og.addColorStop(1, "#20293B");
    ctx.fillStyle = og; ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    // نجوم داخلية وهلال
    ctx.fillStyle = BRAND.cream;
    [[-.5, -.72], [-.15, -.82], [.32, -.76], [.58, -.58], [-.66, -.44], [.7, -.34]].forEach(([px, py], i) => {
      ctx.globalAlpha = .45 + (i % 3) * .18;
      ctx.beginPath(); ctx.arc(cx + px * rx, cy + py * ry, Math.max(1.5, 2.4 * S), 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
    paintCrescent(ctx, cx + rx * .34, cy - ry * .7, 17 * S, BRAND.gold2, "#0B1F38");
    // مشهد المصحف والقنديل أسفل البيضاوية بذوبان علوي
    if (sceneImage) {
      const bh2 = ry * .88, by2 = cy + ry - bh2;
      const sx = sceneImage.width * .46, sy2 = sceneImage.height * .56;
      const sw = sceneImage.width * .54, sh2 = sceneImage.height * .44;
      const sc = Math.max((rx * 2.1) / sw, bh2 / sh2);
      ctx.drawImage(sceneImage, sx, sy2, sw, sh2, cx - (sw * sc) / 2, cy + ry - sh2 * sc, sw * sc, sh2 * sc);
      const fg = ctx.createLinearGradient(0, by2, 0, by2 + bh2 * .6);
      fg.addColorStop(0, "rgba(18,42,71,1)"); fg.addColorStop(1, "rgba(18,42,71,0)");
      ctx.fillStyle = fg; ctx.fillRect(cx - rx, by2, rx * 2, bh2 * .6);
    }
    // القوس المزخرف داخل البيضاوية يؤطر النص
    const archW = rx * 1.42, archTop = cy - ry * .64, archBottom = cy + ry * .46;
    paintArchPanel(ctx, cx, archTop, archW, archBottom, S);
    // الاسم والعنوان داخل القوس
    const archH2 = archW * .34;
    let nameSize = Math.round((landscape ? 40 : 52) * S);
    ctx.font = `700 ${nameSize}px "Aref Ruqaa", serif`;
    let nameLines = wrapText(ctx, ((data.title ? data.title + " " : "") + (data.name || "")).trim(), rx * 1.28);
    if (nameLines.length > 2) {
      nameSize = Math.round(nameSize * .82);
      ctx.font = `700 ${nameSize}px "Aref Ruqaa", serif`;
      nameLines = wrapText(ctx, ((data.title ? data.title + " " : "") + (data.name || "")).trim(), rx * 1.28);
    }
    let ty = archTop + archH2 * .42 + nameSize;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = BRAND.gold2;
    for (const line of nameLines) { ctx.fillText(line, cx, ty); ty += nameSize * 1.3; }
    ty += 2 * S;
    ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(1.5, 2.4 * S);
    ctx.beginPath(); ctx.moveTo(cx - 90 * S, ty); ctx.lineTo(cx + 90 * S, ty); ctx.stroke();
    ctx.fillStyle = BRAND.gold; ctx.font = `${Math.round(26 * S)}px serif`; ctx.fillText("۞", cx, ty + 9 * S);
    ty += 52 * S;
    const subjSize = Math.round((landscape ? 33 : 42) * S);
    ctx.fillStyle = BRAND.cream;
    ctx.font = `700 ${subjSize}px "Amiri", serif`;
    for (const line of wrapText(ctx, data.subject || "", rx * 1.32)) { ctx.fillText(line, cx, ty); ty += subjSize * 1.45; }
    ctx.restore();

    // حدّا البيضاوية وذؤابتها
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7);
    ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(2, 3 * S); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx + 11 * S, ry + 11 * S, 0, 0, 7);
    ctx.strokeStyle = BRAND.frameSoft; ctx.lineWidth = Math.max(1, 1.2 * S); ctx.stroke();
    ctx.fillStyle = BRAND.gold;
    star8(ctx, cx, cy - ry - 11 * S, 10 * S); ctx.fill();
    star8(ctx, cx, cy + ry + 11 * S, 8 * S); ctx.fill();
  },

  classic(ctx, p, box, S, data) {
    paintBg(ctx, p.w, p.h);
    paintStars(ctx, p.w, p.h);
    paintCrescent(ctx, box.x + 80 * S, box.y + 84 * S, 26 * S, BRAND.gold2, BRAND.g[0]);
    ctx.strokeStyle = BRAND.frame; ctx.lineWidth = Math.max(1.5, 2.4 * S);
    roundRect(ctx, box.x + 8, box.y + 8, box.w - 16, box.h - 16, 42 * S); ctx.stroke();
    ctx.strokeStyle = BRAND.frameSoft; ctx.lineWidth = Math.max(1, 1.2 * S);
    roundRect(ctx, box.x + 26, box.y + 26, box.w - 52, box.h - 52, 32 * S); ctx.stroke();
    // ذؤابة ۞ أعلى الإطار ونجمتان بزاويتيه العلويتين
    ctx.fillStyle = BRAND.gold; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `${Math.round(34 * S)}px serif`; ctx.fillText("۞", box.x + box.w / 2, box.y + 9);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = BRAND.goldSec;
    star8(ctx, box.x + 8 + 42 * S, box.y + 8, 8 * S); ctx.fill();
    star8(ctx, box.x + box.w - 8 - 42 * S, box.y + 8, 8 * S); ctx.fill();
    paintContent(ctx, box, S, data, { landscape: p.w > p.h, bottomReserve: bottomReserve(box, S, p.w > p.h) });
  },

  mihrab(ctx, p, box, S, data) {
    paintBg(ctx, p.w, p.h, BRAND.night);
    paintStars(ctx, p.w, p.h);
    // مئذنة يمين
    const mx = box.x + box.w - 60 * S;
    ctx.fillStyle = BRAND.silhouette;
    ctx.fillRect(mx - 16 * S, box.y + box.h * .18, 30 * S, box.h * .5);
    ctx.fillRect(mx - 26 * S, box.y + box.h * .34, 50 * S, 12 * S);
    ctx.beginPath(); ctx.moveTo(mx - 20 * S, box.y + box.h * .18);
    ctx.quadraticCurveTo(mx - 1 * S, box.y + box.h * .1, mx + 18 * S, box.y + box.h * .18); ctx.fill();
    paintCrescent(ctx, mx - 1 * S, box.y + box.h * .07, 12 * S, BRAND.gold2, BRAND.night);
    ctx.fillStyle = BRAND.gold2; ctx.globalAlpha = .9;
    ctx.fillRect(mx - 7 * S, box.y + box.h * .42, 12 * S, 20 * S);
    ctx.globalAlpha = 1;
    // توهّج أرضي (القوس المزخرف يأتي من كتلة المحتوى نفسها)
    const ay2 = box.y + box.h * .9;
    const glow = ctx.createRadialGradient(box.x + box.w / 2, ay2, 10, box.x + box.w / 2, ay2, box.w * .5);
    glow.addColorStop(0, "rgba(255,217,143,.28)"); glow.addColorStop(1, "rgba(255,217,143,0)");
    ctx.fillStyle = glow; ctx.fillRect(box.x, ay2 - box.w * .3, box.w, box.w * .5);
    paintContent(ctx, box, S, data, { landscape: p.w > p.h, scale: .92, bottomReserve: bottomReserve(box, S, p.w > p.h) });
  },

  geometric(ctx, p, box, S, data) {
    paintBg(ctx, p.w, p.h);
    // شريطا نجوم ثمانية أعلى وأسفل + إطار
    ctx.strokeStyle = BRAND.frame; ctx.lineWidth = Math.max(1.5, 2 * S);
    roundRect(ctx, box.x + 8, box.y + 8, box.w - 16, box.h - 16, 30 * S); ctx.stroke();
    const step = 88 * S, r = 26 * S;
    for (const yy of [box.y + 56 * S, box.y + box.h - 56 * S]) {
      for (let xx = box.x + 70 * S; xx < box.x + box.w - 50 * S; xx += step) {
        star8(ctx, xx, yy, r);
        ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(1.5, 2.4 * S); ctx.stroke();
        star8(ctx, xx, yy, r * .5);
        ctx.fillStyle = "rgba(169,138,74,.28)"; ctx.fill();
      }
    }
    // نجمتا زاوية كبيرتان شفافتان
    ctx.globalAlpha = .12;
    star8(ctx, box.x + 40 * S, box.y + box.h * .5, 150 * S); ctx.fillStyle = BRAND.gold; ctx.fill();
    star8(ctx, box.x + box.w - 40 * S, box.y + box.h * .5, 150 * S); ctx.fill();
    ctx.globalAlpha = 1;
    paintContent(ctx, box, S, data, { landscape: p.w > p.h, scale: .95, bottomReserve: bottomReserve(box, S, p.w > p.h) });
  },

  lantern(ctx, p, box, S, data) {
    paintBg(ctx, p.w, p.h, "#14262E");
    paintStars(ctx, p.w, p.h);
    paintCrescent(ctx, box.x + 90 * S, box.y + 110 * S, 40 * S, BRAND.gold2, "#14262E");
    // قنديل يمين بتوهّج
    const lx = box.x + box.w - 110 * S, ly = box.y + box.h * .62;
    const glow = ctx.createRadialGradient(lx, ly, 5, lx, ly, 260 * S);
    glow.addColorStop(0, "rgba(255,217,143,.5)"); glow.addColorStop(1, "rgba(255,217,143,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(lx, ly, 260 * S, 0, 7); ctx.fill();
    ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(2, 4 * S);
    ctx.beginPath(); ctx.moveTo(lx, box.y + 20 * S); ctx.lineTo(lx, ly - 96 * S); ctx.stroke(); // علاقة
    const grd = ctx.createLinearGradient(0, ly - 90 * S, 0, ly + 80 * S);
    grd.addColorStop(0, BRAND.gold2); grd.addColorStop(.55, BRAND.gold); grd.addColorStop(1, BRAND.goldDeep);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(lx - 34 * S, ly - 60 * S);
    ctx.quadraticCurveTo(lx - 46 * S, ly + 10 * S, lx, ly + 64 * S);
    ctx.quadraticCurveTo(lx + 46 * S, ly + 10 * S, lx + 34 * S, ly - 60 * S);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(lx - 30 * S, ly - 60 * S);
    ctx.quadraticCurveTo(lx, ly - 92 * S, lx + 30 * S, ly - 60 * S); ctx.fill(); // قبعة
    ctx.fillStyle = "#FFF3D0";
    ctx.beginPath(); ctx.ellipse(lx, ly - 6 * S, 12 * S, 20 * S, 0, 0, 7); ctx.fill(); // شعلة
    paintContent(ctx, box, S, data, { landscape: p.w > p.h, scale: .92, shiftX: -30 * S, bottomReserve: bottomReserve(box, S, p.w > p.h) });
  },

  promo(ctx, p, box, S, data) {
    paintBg(ctx, p.w, p.h);
    paintStars(ctx, p.w, p.h);
    ctx.strokeStyle = BRAND.frame; ctx.lineWidth = Math.max(1.5, 2.4 * S);
    roundRect(ctx, box.x + 8, box.y + 8, box.w - 16, box.h - 16, 42 * S); ctx.stroke();
    const cx = box.x + box.w / 2;
    const landscape = p.w > p.h;
    const logoR = (landscape ? 100 : 140) * S;
    const reserve = bottomReserve(box, S, landscape);
    const estH = logoR * 2 + (landscape ? 380 : 466) * S; // تقدير ارتفاع المحتوى لتوسيطه
    let y = box.y + Math.max(46 * S, (box.h - reserve - estH) / 2);
    paintLogo(ctx, cx, y, logoR);
    y += logoR * 2 + 70 * S;
    ctx.textAlign = "center";
    ctx.fillStyle = BRAND.gold2;
    ctx.font = `700 ${Math.round((landscape ? 88 : 104) * S)}px "Aref Ruqaa", serif`;
    ctx.fillText("رياض المتقين", cx, y);
    y += (landscape ? 66 : 84) * S;
    ctx.fillStyle = BRAND.cream;
    ctx.font = `700 ${Math.round((landscape ? 44 : 52) * S)}px "Amiri", serif`;
    ctx.fillText(data.subject || "القرآن والسنة بفهم سلف الأمة", cx, y);
    y += (landscape ? 76 : 100) * S;
    // أيقونات المنصّات
    ctx.font = `${Math.round(46 * S)}px serif`;
    const glyphs = ["▶", "♪", "f", "◎", "✈"];
    const gap = 120 * S, x0 = cx - gap * (glyphs.length - 1) / 2;
    glyphs.forEach((g, i) => {
      ctx.beginPath(); ctx.arc(x0 + i * gap, y, 44 * S, 0, 7);
      ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(2, 3.4 * S); ctx.stroke();
      ctx.fillStyle = BRAND.gold2; ctx.textBaseline = "middle";
      ctx.fillText(g, x0 + i * gap, y + 2 * S);
    });
    ctx.textBaseline = "alphabetic";
    y += 120 * S;
    // شريط الدومين
    ctx.font = `700 ${Math.round(42 * S)}px "Amiri", serif`;
    const dw = ctx.measureText("riyadalmutaqin.com").width + 110 * S, dh = 92 * S;
    roundRect(ctx, cx - dw / 2, y - dh / 2, dw, dh, dh / 2);
    const bg = ctx.createLinearGradient(0, y - dh / 2, 0, y + dh / 2);
    bg.addColorStop(0, BRAND.gold2); bg.addColorStop(1, BRAND.gold);
    ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = "#163B2A"; ctx.fillText("riyadalmutaqin.com", cx, y + 15 * S);
  },
};

/* ===== إطار الفيديو الموحّد =====
   عمود تصميم رئيسي واحد (1080×1620) يُرسم بمقاسات ثابتة ثم يوضع نفسه
   في كل قالب فيديو مُصغَّراً فقط — فتتطابق القوالب الثلاثة تماماً،
   وتمتد الخلفية حوله. ختم QR يُرسم على اللوحة النهائية بحجم ثابت
   (لا يتصغّر مع القالب العريض) كي يبقى قابلاً للمسح. */
const COL_W = 1080, COL_H = 1620, COL_QR_S = .75, COL_QR_SLOT = 580;
function drawVideoFrame(canvas, fmt, data) {
  canvas.width = fmt.w; canvas.height = fmt.h;
  const ctx = canvas.getContext("2d");
  paintBg(ctx, fmt.w, fmt.h);
  paintStars(ctx, fmt.w, fmt.h);
  const side = Math.max(fmt.safe[1], fmt.safe[3]);
  const bx = { x: side, y: fmt.safe[0], w: fmt.w - side * 2, h: fmt.h - fmt.safe[0] - fmt.safe[2] };
  const sc = Math.min(bx.w / COL_W, bx.h / COL_H);
  const col = document.createElement("canvas");
  col.width = COL_W; col.height = COL_H;
  const cctx = col.getContext("2d");
  const cbox = { x: 40, y: 24, w: COL_W - 80, h: COL_H - 48 };
  STYLE_PAINTERS.medallion(cctx, { w: COL_W, h: COL_H }, cbox, 1,
    { ...data, _noBg: true, _qrSlot: COL_QR_SLOT });
  const dx = bx.x + (bx.w - COL_W * sc) / 2, dy = bx.y + (bx.h - COL_H * sc) / 2;
  ctx.drawImage(col, dx, dy, COL_W * sc, COL_H * sc);
  const colRect = { x: dx + cbox.x * sc, y: dy + cbox.y * sc, w: cbox.w * sc, h: cbox.h * sc };
  paintQR(ctx, colRect, COL_QR_S, false);
}

/* الرسم الرئيسي */
function drawPost(canvas, p, data) {
  canvas.width = p.w; canvas.height = p.h;
  const ctx = canvas.getContext("2d");
  // توسيط أفقي متماثل: نطبّق أكبر الهامشين الجانبيين على الجهتين معاً —
  // هوامش تيك توك/ريلز غير متماثلة أصلاً فكان التصميم يميل لجهة اليسار
  const side = Math.max(p.safe[1], p.safe[3]);
  const box = { x: side, y: p.safe[0], w: p.w - side * 2, h: p.h - p.safe[0] - p.safe[2] };
  const S = Math.min(box.w, box.h) / 1080;
  const landscape = p.w > p.h;
  const painter = STYLE_PAINTERS[data.style] || STYLE_PAINTERS.medallion;
  painter(ctx, p, box, S, data);
  // مشهد المصحف والقنديل بالأسفل — إلا في المعتمد فالمشهد داخل بيضاويته
  if (painter !== STYLE_PAINTERS.medallion) paintSceneBand(ctx, p, box, landscape);
  paintQR(ctx, box, S, landscape); // الختم أسفل كل تصميم
}

/* ===== واجهة الاستوديو ===== */
function studioData() {
  return {
    title: $("st-title").value.trim(),
    name: $("st-name").value.trim(),
    subject: $("st-subject").value.trim(),
    audioBadge: $("st-audio").checked,
    style: (document.querySelector(".style-card.active") || {}).dataset?.style || STYLES[0].key,
  };
}

/* معاينة حيّة واحدة فقط — لا شبكة صور تشتّت؛ التنزيل يولّد كل مقاس لحظة طلبه */
async function renderAll() {
  await ensureFonts();
  if (logoImage === null && !renderAll._logoTried) { renderAll._logoTried = true; await loadLogo(); }
  await loadScene();
  const data = studioData();
  const preview = $("st-preview");
  if (preview) {
    // المعاينة بالقالب الطولي الموحّد نفسه الذي تخرج به الفيديوهات
    if (typeof VIDEO_FORMATS !== "undefined") drawVideoFrame(preview, VIDEO_FORMATS[0], data);
    else drawPost(preview, PLATFORMS.find((x) => x.key === "igpost"), data);
  }
  return data;
}

/* الاستوديو للفيديو فقط: لا تنزيل صور — المقاطع تُركَّب على خلفيتنا المعتمدة
   وتخرج فيديوهات جاهزة لكل المنصّات (video-studio.js). */
function mountStudio() {
  if (!$("st-name")) return;
  const picker = $("style-picker");
  if (picker) picker.classList.add("hidden"); // تصميم واحد معتمد — لا خيارات

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(renderAll, 350); };
  ["st-title", "st-name", "st-subject"].forEach((id) => $(id).addEventListener("input", schedule));
  $("st-audio").addEventListener("change", renderAll);
  renderAll();
}
