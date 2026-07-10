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

/* التصاميم الخمسة */
const STYLES = [
  { key: "classic",   name: "كلاسيكي ذهبي" },
  { key: "mihrab",    name: "محراب ومئذنة" },
  { key: "geometric", name: "زخرفة هندسية" },
  { key: "lantern",   name: "قنديل وهلال" },
  { key: "promo",     name: "إعلان الموقع" },
];

const BRAND = {
  g: ["#0B1F36", "#16253E", "#37293A", "#2A181A"],
  gold: "#D8C07A", gold2: "#D8C07A", goldSec: "#A98A4A", goldDeep: "#8C6C36",
  frame: "#8FA9C6", frameSoft: "rgba(143,169,198,.45)",
  cream: "#F6F2E8", brown: "#5E4B33", night: "#0A1E33", silhouette: "#081720",
};

let logoImage = null;

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
  ctx.fillStyle = "rgba(169,138,74,.12)";
  for (let y = 60; y < h; y += 170) for (let x = 60 + (y % 340 ? 85 : 0); x < w; x += 170) {
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  }
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

/* كتلة النص (الشعار + الاسم + الفاصل + العنوان + الشارة + المعرّف) داخل صندوق */
function paintContent(ctx, box, S, data, opts = {}) {
  const landscape = opts.landscape;
  const cx = box.x + box.w / 2 + (opts.shiftX || 0);
  const nameSize = Math.round((landscape ? 60 : 74) * S * (opts.scale || 1));
  const subjSize = Math.round((landscape ? 52 : 62) * S * (opts.scale || 1));
  const logoR = (landscape ? 84 : 112) * S * (opts.scale || 1);

  ctx.font = `700 ${nameSize}px "Aref Ruqaa", serif`;
  const nameLines = wrapText(ctx, ((data.title ? data.title + " " : "") + (data.name || "")).trim(), box.w * .8);
  ctx.font = `700 ${subjSize}px "Amiri", serif`;
  const subjLines = wrapText(ctx, data.subject || "", box.w * .78);
  const contentH = logoR * 2 + 56 * S + nameLines.length * nameSize * 1.35 + 20 * S + 66 * S +
    subjLines.length * subjSize * 1.5 + (data.audioBadge ? 100 * S : 0);
  const reserve = opts.bottomReserve || 0; // مساحة ختم QR والتذييل أسفل المحتوى
  let y = box.y + Math.max(56 * S, (box.h - reserve - contentH) / 2) + (opts.shiftY || 0);

  paintLogo(ctx, cx, y, logoR);
  y += logoR * 2 + 56 * S;
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = BRAND.gold2;
  ctx.font = `700 ${nameSize}px "Aref Ruqaa", serif`;
  for (const line of nameLines) { ctx.fillText(line, cx, y); y += nameSize * 1.35; }
  y += 6 * S;
  ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(2, 3 * S);
  ctx.beginPath(); ctx.moveTo(cx - 130 * S, y); ctx.lineTo(cx + 130 * S, y); ctx.stroke();
  ctx.fillStyle = BRAND.gold; ctx.font = `${Math.round(32 * S)}px serif`; ctx.fillText("۞", cx, y + 11 * S);
  y += 66 * S;
  ctx.fillStyle = BRAND.cream;
  ctx.font = `700 ${subjSize}px "Amiri", serif`;
  for (const line of subjLines) { ctx.fillText(line, cx, y); y += subjSize * 1.5; }
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
  const size = (landscape ? 128 : 168) * S;
  return size + (size / 25) * 8.4 + 96 * S;
}

function paintQR(ctx, box, S, landscape) {
  const m = qrMatrix();
  if (!m) return;
  // ختم متناسق وسط أسفل التصميم — بلاطة عاجية بميل ذهبي (لا بيضاء صارخة)
  const size = (landscape ? 128 : 168) * S;
  const pad = (size / m.n) * 4.2; // منطقة هدوء ≥ ٤ خلايا (شرط القراءة)
  const x = box.x + (box.w - size) / 2;
  const y = box.y + box.h - size - pad - 74 * S;
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

/* ===== التصاميم الخمسة ===== */
const STYLE_PAINTERS = {
  classic(ctx, p, box, S, data) {
    paintBg(ctx, p.w, p.h);
    ctx.strokeStyle = BRAND.frame; ctx.lineWidth = Math.max(1.5, 2.4 * S);
    roundRect(ctx, box.x + 8, box.y + 8, box.w - 16, box.h - 16, 42 * S); ctx.stroke();
    ctx.strokeStyle = BRAND.frameSoft; ctx.lineWidth = Math.max(1, 1.2 * S);
    roundRect(ctx, box.x + 26, box.y + 26, box.w - 52, box.h - 52, 32 * S); ctx.stroke();
    paintContent(ctx, box, S, data, { landscape: p.w > p.h, bottomReserve: qrReserve(S, p.w > p.h) });
    paintQR(ctx, box, S, p.w > p.h);
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
    // قوس المحراب
    const aw = box.w * .82, ax = box.x + (box.w - aw) / 2, ay2 = box.y + box.h * .9;
    const apexY = box.y + 48 * S, springY = box.y + box.h * .3;
    ctx.strokeStyle = BRAND.frame; ctx.lineWidth = Math.max(1.5, 2.4 * S);
    ctx.beginPath();
    ctx.moveTo(ax, ay2); ctx.lineTo(ax, springY);
    ctx.quadraticCurveTo(ax, apexY + 30 * S, box.x + box.w / 2, apexY);
    ctx.quadraticCurveTo(ax + aw, apexY + 30 * S, ax + aw, springY);
    ctx.lineTo(ax + aw, ay2); ctx.stroke();
    ctx.fillStyle = BRAND.gold2; ctx.textAlign = "center";
    ctx.font = `${Math.round(30 * S)}px serif`; ctx.fillText("۞", box.x + box.w / 2, apexY - 14 * S);
    // توهّج أرضي
    const glow = ctx.createRadialGradient(box.x + box.w / 2, ay2, 10, box.x + box.w / 2, ay2, box.w * .5);
    glow.addColorStop(0, "rgba(255,217,143,.28)"); glow.addColorStop(1, "rgba(255,217,143,0)");
    ctx.fillStyle = glow; ctx.fillRect(box.x, ay2 - box.w * .3, box.w, box.w * .5);
    paintContent(ctx, box, S, data, { landscape: p.w > p.h, scale: .92, bottomReserve: qrReserve(S, p.w > p.h) });
    paintQR(ctx, box, S, p.w > p.h);
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
    paintContent(ctx, box, S, data, { landscape: p.w > p.h, scale: .95, bottomReserve: qrReserve(S, p.w > p.h) });
    paintQR(ctx, box, S, p.w > p.h);
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
    paintContent(ctx, box, S, data, { landscape: p.w > p.h, scale: .92, shiftX: -30 * S, bottomReserve: qrReserve(S, p.w > p.h) });
    paintQR(ctx, box, S, p.w > p.h);
  },

  promo(ctx, p, box, S, data) {
    paintBg(ctx, p.w, p.h);
    paintStars(ctx, p.w, p.h);
    ctx.strokeStyle = BRAND.frame; ctx.lineWidth = Math.max(1.5, 2.4 * S);
    roundRect(ctx, box.x + 8, box.y + 8, box.w - 16, box.h - 16, 42 * S); ctx.stroke();
    const cx = box.x + box.w / 2;
    const landscape = p.w > p.h;
    const logoR = (landscape ? 100 : 140) * S;
    const reserve = qrReserve(S, landscape);
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
    paintQR(ctx, box, S, landscape);
  },
};

/* الرسم الرئيسي */
function drawPost(canvas, p, data) {
  canvas.width = p.w; canvas.height = p.h;
  const ctx = canvas.getContext("2d");
  const box = { x: p.safe[3], y: p.safe[0], w: p.w - p.safe[1] - p.safe[3], h: p.h - p.safe[0] - p.safe[2] };
  const S = Math.min(box.w, box.h) / 1080;
  (STYLE_PAINTERS[data.style] || STYLE_PAINTERS.classic)(ctx, p, box, S, data);
}

/* ===== واجهة الاستوديو ===== */
function studioData() {
  return {
    title: $("st-title").value.trim(),
    name: $("st-name").value.trim(),
    subject: $("st-subject").value.trim(),
    audioBadge: $("st-audio").checked,
    style: (document.querySelector(".style-card.active") || {}).dataset?.style || "classic",
  };
}

async function renderAll() {
  await ensureFonts();
  if (logoImage === null && !renderAll._logoTried) { renderAll._logoTried = true; await loadLogo(); }
  const data = studioData();
  for (const p of PLATFORMS) {
    const canvas = document.querySelector(`canvas[data-key="${p.key}"]`);
    if (canvas) drawPost(canvas, p, data);
  }
  renderStylePreviews(data);
  return data;
}

/* معاينات التصاميم الخمسة (مصغّرة) */
function renderStylePreviews(data) {
  const mini = { key: "mini", name: "", w: 540, h: 675, safe: [30, 30, 30, 30] };
  document.querySelectorAll(".style-card canvas").forEach((c) => {
    drawPost(c, mini, { ...data, style: c.parentElement.dataset.style });
  });
}

function downloadCanvas(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "رياض المتقين" }); resolve(); return; }
        catch (e) { if (e && e.name === "AbortError") { resolve(); return; } }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); resolve(); }, 300);
    }, "image/png");
  });
}

async function downloadAll() {
  const data = await renderAll();
  if (!data.name && !data.subject && data.style !== "promo") { toast("اكتب الاسم والعنوان أولاً", "err"); return; }
  toast("جارٍ تنزيل " + PLATFORMS.length + " تصاميم…", "ok");
  for (const p of PLATFORMS) {
    const canvas = document.querySelector(`canvas[data-key="${p.key}"]`);
    if (canvas) await downloadCanvas(canvas, `riyad-${p.key}-${p.w}x${p.h}.png`);
  }
  toast("اكتمل تنزيل جميع المقاسات ✅", "ok");
}

function mountStudio() {
  const grid = $("sizes-grid");
  if (!grid) return;

  // بطاقات اختيار التصميم
  const picker = $("style-picker");
  picker.innerHTML = STYLES.map((s, i) =>
    `<div class="style-card ${i === 0 ? "active" : ""}" data-style="${s.key}">
       <canvas width="540" height="675"></canvas>
       <div class="s-name">${s.name}</div>
     </div>`).join("");
  picker.addEventListener("click", (e) => {
    const card = e.target.closest(".style-card");
    if (!card) return;
    picker.querySelectorAll(".style-card").forEach((c) => c.classList.toggle("active", c === card));
    renderAll();
  });

  // شبكة المنصّات: صورة + فيديو لكل منصّة
  grid.innerHTML = "";
  for (const p of PLATFORMS) {
    const card = document.createElement("div");
    card.className = "size-card";
    card.innerHTML =
      `<canvas data-key="${p.key}" width="${p.w}" height="${p.h}"></canvas>` +
      `<div class="s-name">${p.name}</div>` +
      `<div class="s-dim">${p.w}×${p.h}</div>` +
      `<div class="row gap" style="justify-content:center; flex-wrap:wrap">` +
      `<button class="btn btn-sm" data-dl="${p.key}">صورة ⬇</button>` +
      `<button class="btn btn-sm btn-blue" data-vid="${p.key}" disabled title="أرفق مقطعاً في الخطوة ٢ أولاً">فيديو 🎬</button>` +
      `</div>`;
    grid.appendChild(card);
  }
  grid.addEventListener("click", async (e) => {
    const key = e.target?.dataset?.dl;
    if (key) {
      await renderAll();
      const p = PLATFORMS.find((x) => x.key === key);
      const canvas = document.querySelector(`canvas[data-key="${key}"]`);
      if (p && canvas) downloadCanvas(canvas, `riyad-${p.key}-${p.w}x${p.h}.png`);
    }
    const vKey = e.target?.dataset?.vid;
    if (vKey && !e.target.disabled) convertMediaFor(vKey);
  });

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(renderAll, 350); };
  ["st-title", "st-name", "st-subject"].forEach((id) => $(id).addEventListener("input", schedule));
  $("st-audio").addEventListener("change", renderAll);
  $("st-download-all").addEventListener("click", downloadAll);
  renderAll();
}
