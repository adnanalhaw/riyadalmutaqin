/* ===== استوديو بوستات رياض المتقين =====
   صمّم بوستاً واحداً — ينزل جاهزاً بمقاس كل منصّة، مع مراعاة «المنطقة الآمنة»
   الحقيقية لكل واحدة: تيك توك يحجب عموداً أيمن وشريطاً سفلياً، الريلز يحجب أسفله،
   الستوري يحجب أعلاه وأسفله، إكس/فيسبوك/يوتيوب أفقية. لذلك التصميم يُعاد تكوينه
   لكل منصّة — لا مجرّد قصّ واحد للجميع. */

const PLATFORMS = [
  // safe: [أعلى, يمين, أسفل, يسار] بالبكسل — المنطقة التي تُبقى خالية لواجهة المنصّة
  { key: "tiktok",    name: "تيك توك",           w: 1080, h: 1920, safe: [220, 180, 420, 60] },
  { key: "reels",     name: "ريلز إنستغرام",     w: 1080, h: 1920, safe: [180, 140, 460, 60] },
  { key: "story",     name: "ستوري إنستغرام",    w: 1080, h: 1920, safe: [260, 60, 260, 60] },
  { key: "igpost",    name: "منشور إنستغرام",    w: 1080, h: 1350, safe: [60, 60, 60, 60] },
  { key: "whatsapp",  name: "حالة واتساب",       w: 1080, h: 1920, safe: [200, 60, 200, 60] },
  { key: "x",         name: "منشور إكس (X)",     w: 1600, h: 900,  safe: [50, 50, 50, 50] },
  { key: "facebook",  name: "منشور فيسبوك",      w: 1200, h: 630,  safe: [40, 40, 40, 40] },
  { key: "youtube",   name: "مصغّرة يوتيوب",     w: 1280, h: 720,  safe: [40, 40, 40, 40] },
];

const BRAND = {
  g: ["#203B25", "#17301D", "#142417", "#0F1C12"],
  gold: "#C9A24B", gold2: "#E7C778", cream: "#EFE7D6",
};

let logoImage = null; // يُحمَّل مرة واحدة؛ إن غاب logo.png نرسم بديلاً خطّياً

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
  } catch { /* الرسم يعمل بخط النظام إن تعذّر التحميل */ }
}

/* لفّ نصّ عربي على أسطر بعرض أقصى */
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

/* رسم بوست واحد على كانفس منصّة معيّنة */
function drawPost(canvas, p, data) {
  const { w, h, safe } = p;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");

  // الخلفية: التدرّج المعتمد + نقاط زخرفية خافتة
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, BRAND.g[0]); grad.addColorStop(.35, BRAND.g[1]);
  grad.addColorStop(.70, BRAND.g[2]); grad.addColorStop(1, BRAND.g[3]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(201,162,75,.10)";
  for (let y = 60; y < h; y += 170) for (let x = 60 + (y % 340 ? 85 : 0); x < w; x += 170) {
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  }

  // منطقة المحتوى داخل الحدود الآمنة
  const box = { x: safe[3], y: safe[0], w: w - safe[1] - safe[3], h: h - safe[0] - safe[2] };
  const S = Math.min(box.w, box.h) / 1080; // مقياس نسبي للعناصر

  // الإطار الذهبي (ثابت دائماً)
  ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(3, 6 * S);
  roundRect(ctx, box.x + 8, box.y + 8, box.w - 16, box.h - 16, 42 * S); ctx.stroke();
  ctx.strokeStyle = "rgba(201,162,75,.35)"; ctx.lineWidth = Math.max(2, 3 * S);
  roundRect(ctx, box.x + 26, box.y + 26, box.w - 52, box.h - 52, 32 * S); ctx.stroke();

  const cx = box.x + box.w / 2;
  const landscape = w > h;

  // قياس مسبق لارتفاع المحتوى كي يتوسّط عمودياً داخل المنطقة الآمنة
  const nameSize = Math.round((landscape ? 64 : 78) * S);
  const subjSize = Math.round((landscape ? 56 : 66) * S);
  const logoR = (landscape ? 90 : 120) * S;
  ctx.font = `700 ${nameSize}px "Aref Ruqaa", serif`;
  const nameLines = wrapText(ctx, (data.title ? data.title + " " : "") + (data.name || ""), box.w * .82);
  ctx.font = `700 ${subjSize}px "Amiri", serif`;
  const subjLines = wrapText(ctx, data.subject || "", box.w * .8);
  const contentH =
    logoR * 2 + (landscape ? 40 : 70) * S +
    nameLines.length * nameSize * 1.35 + (landscape ? 14 : 26) * S +
    (landscape ? 55 : 80) * S +
    subjLines.length * subjSize * 1.5 +
    (data.audioBadge ? (landscape ? 20 : 34) * S + 76 * S : 0);
  let y = box.y + Math.max((landscape ? 50 : 90) * S, (box.h - contentH) / 2 - 30 * S);

  // الشعار (ثابت دائماً)
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, y + logoR, logoR, 0, 7); ctx.closePath();
  ctx.fillStyle = "#0d1a10"; ctx.fill(); ctx.clip();
  if (logoImage) ctx.drawImage(logoImage, cx - logoR, y, logoR * 2, logoR * 2);
  else {
    ctx.fillStyle = BRAND.gold2;
    ctx.font = `700 ${Math.round(logoR * .5)}px "Aref Ruqaa", serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("رياض", cx, y + logoR * .8);
    ctx.fillText("المتقين", cx, y + logoR * 1.3);
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, y + logoR, logoR, 0, 7);
  ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(3, 5 * S); ctx.stroke();
  y += logoR * 2 + (landscape ? 40 : 70) * S;

  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";

  // الصفة + اسم الشيخ (ذهبي)
  ctx.fillStyle = BRAND.gold2;
  ctx.font = `700 ${nameSize}px "Aref Ruqaa", serif`;
  for (const line of nameLines) {
    ctx.fillText(line, cx, y); y += nameSize * 1.35;
  }
  y += (landscape ? 14 : 26) * S;

  // فاصل زخرفي
  ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(2, 3 * S);
  ctx.beginPath(); ctx.moveTo(cx - 140 * S, y); ctx.lineTo(cx + 140 * S, y); ctx.stroke();
  ctx.fillStyle = BRAND.gold;
  ctx.font = `${Math.round(34 * S)}px serif`; ctx.fillText("۞", cx, y + 12 * S);
  y += (landscape ? 55 : 80) * S;

  // عنوان المادة (كريمي)
  ctx.fillStyle = BRAND.cream;
  ctx.font = `700 ${subjSize}px "Amiri", serif`;
  for (const line of subjLines) {
    ctx.fillText(line, cx, y); y += subjSize * 1.5;
  }

  // شارة «مقطع صوتي» (اختيارية)
  if (data.audioBadge) {
    y += (landscape ? 20 : 34) * S;
    const label = "🎧 مقطع صوتي";
    ctx.font = `700 ${Math.round(40 * S)}px "Amiri", serif`;
    const bw = ctx.measureText(label).width + 90 * S;
    const bh = 76 * S;
    roundRect(ctx, cx - bw / 2, y - bh / 2 - 10 * S, bw, bh, bh / 2);
    ctx.fillStyle = "rgba(201,162,75,.18)"; ctx.fill();
    ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(2, 3 * S); ctx.stroke();
    ctx.fillStyle = BRAND.gold2; ctx.fillText(label, cx, y + 14 * S);
  }

  // المعرّف الثابت أسفل المنطقة الآمنة
  const footY = box.y + box.h - 46 * S;
  ctx.fillStyle = "rgba(239,231,214,.75)";
  ctx.font = `${Math.round(34 * S)}px "Amiri", serif`;
  ctx.fillText("رياض المتقين · riyadalmutaqin.com", cx, footY);
}

/* توليد كل المعاينات في الشبكة */
async function renderAll() {
  await ensureFonts();
  if (logoImage === null && !renderAll._logoTried) { renderAll._logoTried = true; await loadLogo(); }
  const data = {
    title: $("st-title").value.trim(),
    name: $("st-name").value.trim(),
    subject: $("st-subject").value.trim(),
    audioBadge: $("st-audio").checked,
  };
  for (const p of PLATFORMS) {
    const canvas = document.querySelector(`canvas[data-key="${p.key}"]`);
    if (canvas) drawPost(canvas, p, data);
  }
  return data;
}

function downloadCanvas(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
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
  if (!data.name && !data.subject) { toast("اكتب اسم الشيخ وعنوان المادة أولاً", "err"); return; }
  toast("جارٍ تنزيل " + PLATFORMS.length + " تصاميم…", "ok");
  for (const p of PLATFORMS) {
    const canvas = document.querySelector(`canvas[data-key="${p.key}"]`);
    if (canvas) await downloadCanvas(canvas, `riyad-${p.key}-${p.w}x${p.h}.png`);
  }
  toast("اكتمل تنزيل جميع المقاسات ✅", "ok");
}

/* بناء شبكة المعاينات + الربط */
function mountStudio() {
  const grid = $("sizes-grid");
  if (!grid) return;
  for (const p of PLATFORMS) {
    const card = document.createElement("div");
    card.className = "size-card";
    card.innerHTML =
      `<canvas data-key="${p.key}" width="${p.w}" height="${p.h}"></canvas>` +
      `<div class="s-name">${p.name}</div>` +
      `<div class="s-dim">${p.w}×${p.h}</div>` +
      `<button class="btn btn-sm" data-dl="${p.key}">تحميل ⬇</button>`;
    grid.appendChild(card);
  }
  grid.addEventListener("click", async (e) => {
    const key = e.target && e.target.dataset ? e.target.dataset.dl : null;
    if (!key) return;
    await renderAll();
    const p = PLATFORMS.find((x) => x.key === key);
    const canvas = document.querySelector(`canvas[data-key="${key}"]`);
    if (p && canvas) downloadCanvas(canvas, `riyad-${p.key}-${p.w}x${p.h}.png`);
  });
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(renderAll, 350); };
  ["st-title", "st-name", "st-subject"].forEach((id) => $(id).addEventListener("input", schedule));
  $("st-audio").addEventListener("change", renderAll);
  $("st-download-all").addEventListener("click", downloadAll);
  renderAll();
}
