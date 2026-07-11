/* ===== تحويل المقطع: صوت مقطعك تحت صورتنا الثابتة =====
   فور إرفاق المقطع تُجهَّز الفيديوهات لكل المنصّات تلقائياً — ثلاثة قوالب
   تغطي جميع منصّات التواصل (طولي/مربع/عريض) دون أي اختيار يدوي.
   ملاحظة صادقة: التحويل يجري على جهازك بسرعة تشغيل المقطع نفسه لكل قالب. */

const VIDEO_FORMATS = [
  { key: "tall",   name: "طولي 9:16",  w: 1080, h: 1920, safe: [260, 180, 460, 180], serves: "تيك توك · ريلز · ستوري · حالة واتساب" },
  { key: "square", name: "مربع 1:1",   w: 1080, h: 1080, safe: [70, 70, 70, 70],     serves: "تيليغرام · منشور إنستغرام · فيسبوك" },
  { key: "wide",   name: "عريض 16:9",  w: 1600, h: 900,  safe: [50, 50, 50, 50],     serves: "يوتيوب · إكس (X) · فيسبوك" },
];

function pickMime() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { }
  }
  return "";
}

let vsAbort = null;         // مسار العنصر البديل (تسلسلي)
const vsAborts = new Set(); // مسار الذاكرة (القوالب الثلاثة معاً)
let vsRunning = false;
let vsUserCancel = false;
let vsAudioCtx = null; // يُنشأ ويُستأنف داخل لحظة الضغط نفسها — سفاري يعلّق resume خارجها
let vsMedia = null;    // عنصر تشغيل واحد «مُبارك» بلمسة المستخدم — خطة بديلة فقط
let vsDest = null;     // وجهة الصوت المشتركة لمسار العنصر البديل
let vsAudioBuffer = null;  // صوت المقطع مفكوكاً كاملاً في الذاكرة — المسار الرئيسي
let vsDecodePromise = null;

/* عند اختيار الملف: يبدأ فكّ الصوت فوراً (لا يحتاج لمسة) ويُجهَّز عنصر
   التشغيل البديل دون تشغيله. */
function prepareDecode(file) {
  try {
    if (vsMedia) { try { URL.revokeObjectURL(vsMedia.src); } catch { } }
    vsAudioCtx = vsAudioCtx || new AudioContext();
    // المسار الرئيسي: فكّ صوت الملف كاملاً إلى الذاكرة — تشغيله للتسجيل
    // لا يتقطّع أبداً (لا تخزين مؤقت ولا إذن تشغيل)
    vsAudioBuffer = null;
    vsDecodePromise = file.arrayBuffer()
      .then((ab) => vsAudioCtx.decodeAudioData(ab))
      .then((b) => { vsAudioBuffer = b; })
      .catch(() => { vsAudioBuffer = null; });
    const isVideo = file.type.startsWith("video");
    const media = document.createElement(isVideo ? "video" : "audio");
    media.src = URL.createObjectURL(file);
    media.playsInline = true;
    media.preload = "auto";
    const srcNode = vsAudioCtx.createMediaElementSource(media);
    const dest = vsAudioCtx.createMediaStreamDestination();
    srcNode.connect(dest);
    vsMedia = media; vsDest = dest;
  } catch { vsMedia = null; vsDest = null; }
}

/* داخل ضغطة زر «ابدأ التحويل» (لمسة حقيقية — شرط آيفون الصارم):
   تفعيل ساعة الصوت + مباركة عنصر التشغيل البديل. اختيار الملف وحده
   لا يعدّه آيفون لمسةً فتبقى ساعة الصوت متجمّدة على الصفر. */
function blessWithinTap() {
  try {
    vsAudioCtx = vsAudioCtx || new AudioContext();
    vsAudioCtx.resume().catch(() => { });
    if (vsMedia) {
      const p = vsMedia.play();
      if (p && p.then) p.then(() => {
        // لا نوقفه إن كان التسجيل الفعلي قد بدأ (سباق زمني محتمل)
        if (!vsMedia._recording) { vsMedia.pause(); try { vsMedia.currentTime = 0; } catch { } }
      }).catch(() => { });
    }
  } catch { }
}

function mediaFileReady() {
  const f = $("vs-file");
  return f && f.files && f.files[0];
}

function refreshVideoHint() {
  const hint = $("vs-hint");
  if (!hint) return;
  hint.textContent = mediaFileReady()
    ? "✓ المقطع جاهز (" + mediaFileReady().name + ") — اضغط «ابدأ التحويل» وتخرج الفيديوهات لكل المنصّات."
    : "أرفق مقطعاً ثم اضغط «ابدأ التحويل» — تخرج الفيديوهات لكل المنصّات.";
}

/* المسار الرئيسي: التسجيل من الصوت المفكوك في الذاكرة — صوت نقي بلا تقطيع.
   يكتب تقدّمه في سطر قالبه (st) كي تعمل القوالب الثلاثة بالتوازي. */
async function convertOneBuffer(fmt, mime, st) {
  const acx = vsAudioCtx;
  const dur = vsAudioBuffer.duration;
  const data = studioData();
  const buffer = document.createElement("canvas");
  drawPost(buffer, fmt, data);
  const canvas = document.createElement("canvas");
  canvas.width = fmt.w; canvas.height = fmt.h;
  canvas.style.cssText = "position:fixed; left:-9999px; top:0; width:2px; height:2px";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(buffer, 0, 0);
  const stream = canvas.captureStream(8);
  const dest = acx.createMediaStreamDestination();
  const src = acx.createBufferSource();
  src.buffer = vsAudioBuffer;
  src.connect(dest);
  const aTrack = dest.stream.getAudioTracks()[0];
  if (aTrack) stream.addTrack(aTrack);
  const chunks = [];
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 128_000,
  });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const doneRec = new Promise((res) => { rec.onstop = res; });
  // تأكيد أن ساعة الصوت تعمل فعلاً — وإلا رسالة واضحة بدل عدّاد متجمّد
  try { await Promise.race([acx.resume(), new Promise((r) => setTimeout(r, 3000))]); } catch { }
  if (acx.state !== "running") {
    try { canvas.remove(); } catch { }
    throw new Error("لم يُفعَّل الصوت — اضغط «ابدأ التحويل» مرة أخرى");
  }
  let stopped = false;
  const abort = () => { stopped = true; try { src.stop(); } catch { } };
  vsAborts.add(abort);
  rec.start(250);
  const t0 = acx.currentTime;
  src.start();
  const painter = setInterval(() => ctx.drawImage(buffer, 0, 0), 250);
  let lastT = -1, stallTicks = 0;
  const progress = setInterval(() => {
    const t = Math.min(acx.currentTime - t0, dur);
    if (st) st.textContent = "🎬 " + Math.floor(t) + " / " + Math.floor(dur) + " ثانية";
    if (t === lastT) { if (++stallTicks > 40) stopped = true; } // حارس تجمّد ١٢ث
    else { lastT = t; stallTicks = 0; }
  }, 300);
  await new Promise((res) => { src.onended = res; const t = setInterval(() => { if (stopped) { clearInterval(t); res(); } }, 200); });
  clearInterval(painter); clearInterval(progress);
  await new Promise((r) => setTimeout(r, 400)); // مهلة ذيل — لا يُقصّ آخر الصوت
  if (rec.state !== "inactive") rec.stop();
  await doneRec;
  try { canvas.remove(); } catch { }
  vsAborts.delete(abort);
  if (stopped) return null;
  const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
  return { blob: new Blob(chunks, { type: mime.split(";")[0] }), ext };
}

/* الخطة البديلة (إن تعذّر فكّ الصوت): التسجيل من عنصر التشغيل المُبارك */
async function convertOne(fmt, mime) {
  const media = vsMedia;
  await new Promise((res, rej) => {
    if (media.readyState >= 1) return res(); // البيانات وصلت قبل ربط الحدث — لا تعليق
    media.addEventListener("loadedmetadata", res, { once: true });
    media.addEventListener("error", () => rej(new Error("تعذّرت قراءة الملف")), { once: true });
  });
  // العودة لبداية المقطع (القالب الثاني والثالث يبدآن بعد انتهاء الأول)
  await new Promise((res) => {
    if (!media.currentTime) return res();
    media.addEventListener("seeked", res, { once: true });
    try { media.currentTime = 0; } catch { res(); }
    setTimeout(res, 1500);
  });

  const data = studioData();
  // الإطار الثابت يُرسم مرة واحدة في لوحة عازلة، والنسخ الدوري منها رخيص جداً —
  // فلا يُجهد المعالج ولا يتقطّع الصوت (إعادة الرسم الكامل كانت تقطّعه)
  const buffer = document.createElement("canvas");
  drawPost(buffer, fmt, data);
  const canvas = document.createElement("canvas");
  canvas.width = fmt.w; canvas.height = fmt.h;
  // سفاري لا يبثّ إطارات من لوحة خارج الصفحة — تُعلَّق مخفيةً أثناء التسجيل
  canvas.style.cssText = "position:fixed; left:-9999px; top:0; width:2px; height:2px";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(buffer, 0, 0);
  const stream = canvas.captureStream(15);

  // صوت المقطع فقط عبر الوجهة المشتركة (مشهد الفيديو الأصلي لا يظهر إطلاقاً)
  const aTrack = vsDest && vsDest.stream.getAudioTracks()[0];
  if (aTrack) stream.addTrack(aTrack);

  const chunks = [];
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 3_000_000,
    audioBitsPerSecond: 128_000,
  });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const doneRec = new Promise((res) => { rec.onstop = res; });

  let stopped = false;
  vsAbort = () => { stopped = true; try { media.pause(); } catch { } };
  const bar = $("vs-bar"), status = $("vs-status");
  const cleanupDom = () => { try { canvas.remove(); } catch { } };
  media._recording = true;
  rec.start(250);
  try { await media.play(); }
  catch (e) {
    rec.state !== "inactive" && rec.stop(); cleanupDom(); vsAbort = null;
    throw new Error("المتصفح منع تشغيل المقطع — أعد اختيار الملف وابقَ في الصفحة");
  }
  const painter = setInterval(() => ctx.drawImage(buffer, 0, 0), 200);
  let lastT = -1, stallTicks = 0;
  const progress = setInterval(() => {
    if (media.duration) bar.style.width = ((media.currentTime / media.duration) * 100 || 0) + "%";
    status.textContent = "جارٍ تجهيز «" + fmt.name + "»… " +
      Math.floor(media.currentTime) + " / " + Math.floor(media.duration || 0) + " ثانية";
    // حارس التعليق: إن لم يتقدّم المقطع ١٢ ثانية نوقف بدل الانتظار الأبدي
    if (media.currentTime === lastT) { if (++stallTicks > 40) { stopped = true; } }
    else { lastT = media.currentTime; stallTicks = 0; }
  }, 300);

  await new Promise((res) => { media.onended = res; const t = setInterval(() => { if (stopped) { clearInterval(t); res(); } }, 200); });
  const finished = !stopped;
  clearInterval(painter); clearInterval(progress);
  await new Promise((r) => setTimeout(r, 400)); // مهلة ذيل — كي لا يُقصّ آخر الصوت
  if (rec.state !== "inactive") rec.stop();
  await doneRec;
  cleanupDom();
  media._recording = false;
  vsAbort = null;
  if (!finished) return null;
  const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
  return { blob: new Blob(chunks, { type: mime.split(";")[0] }), ext };
}

function vsResultRow(fmt) {
  const row = document.createElement("div");
  row.className = "card";
  row.style.marginTop = ".5rem";
  row.innerHTML =
    `<div class="row gap"><b class="gold">${fmt.name}</b>` +
    `<span class="xsmall muted grow">${fmt.serves}</span>` +
    `<span class="xsmall" data-st="${fmt.key}">⏳ بالانتظار…</span></div>`;
  return row;
}

/* يجهّز القوالب الثلاثة بالتسلسل ويعرض زر تنزيل لكل واحد فور جاهزيته */
async function convertAllFormats() {
  if (vsRunning) return;
  const file = mediaFileReady();
  if (!file) return;
  const data = studioData();
  if (!data.name && !data.subject) {
    toast("اكتب اسم الشيخ وعنوان الدرس في الخطوة ١ ثم أعد اختيار الملف", "err");
    return;
  }
  const mime = pickMime();
  if (!window.MediaRecorder || !mime) {
    $("vs-area").classList.remove("hidden");
    $("vs-status").textContent = "متصفحك لا يدعم تسجيل الفيديو — جرّب كروم أو سفاري حديثاً.";
    return;
  }
  if (!vsMedia) {
    $("vs-area").classList.remove("hidden");
    $("vs-status").textContent = "تعذّر فتح المقطع — أعد اختيار الملف.";
    return;
  }
  vsRunning = true;
  vsUserCancel = false;
  const startBtn = $("vs-start");
  if (startBtn) startBtn.disabled = true;
  $("vs-area").classList.remove("hidden");
  $("vs-status").textContent = "جارٍ فكّ صوت المقطع…";
  // ننتظر فكّ الصوت (حتى ٣٠ ثانية) — إن تعذّر نتحوّل لمسار العنصر البديل
  if (vsDecodePromise) await Promise.race([vsDecodePromise, new Promise((r) => setTimeout(r, 30000))]);
  await ensureFonts();
  if (logoImage === null) await loadLogo();
  await loadScene();

  const results = $("vs-results");
  $("vs-area").classList.remove("hidden");
  $("vs-cancel").classList.remove("hidden");
  results.innerHTML = "";
  const rows = {};
  for (const fmt of VIDEO_FORMATS) { rows[fmt.key] = vsResultRow(fmt); results.appendChild(rows[fmt.key]); }

  let doneCount = 0;
  const finishRow = (fmt, out) => {
    const row = rows[fmt.key], st = row.querySelector("[data-st]");
    doneCount++;
    st.textContent = `✅ جاهز (${(Math.max(out.blob.size, 104858) / 1048576).toFixed(1)} MB · ${out.ext})`;
    const url = URL.createObjectURL(out.blob);
    const btn = document.createElement("button");
    btn.className = "btn btn-blue btn-block";
    btn.type = "button";
    btn.style.marginTop = ".5rem";
    btn.textContent = `⬇ تحميل / مشاركة — ${fmt.name}`;
    btn.onclick = async () => {
      const filename = `riyad-${fmt.key}.${out.ext}`;
      const f = new File([out.blob], filename, { type: out.blob.type });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: "رياض المتقين" }); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
    };
    row.appendChild(btn);
  };

  if (vsAudioBuffer) {
    // القوالب الثلاثة معاً في وقت واحد — الانتظار الكلي بطول المقطع نفسه
    const dur = vsAudioBuffer.duration;
    $("vs-status").textContent = "جارٍ تجهيز القوالب الثلاثة معاً — الانتظار بطول المقطع نفسه…";
    const startedAt = Date.now();
    const globalBar = setInterval(() => {
      const t = Math.min((Date.now() - startedAt) / 1000, dur);
      $("vs-bar").style.width = ((t / dur) * 100 || 0) + "%";
    }, 300);
    await Promise.all(VIDEO_FORMATS.map(async (fmt) => {
      const st = rows[fmt.key].querySelector("[data-st]");
      st.textContent = "🎬 جارٍ التجهيز…";
      let out = null;
      try { out = await convertOneBuffer(fmt, mime, st); }
      catch (e) { st.textContent = "⚠ تعذّر: " + e.message; return; }
      if (!out) { st.textContent = vsUserCancel ? "أُلغي" : "⚠ علّق المتصفح — اضغط «ابدأ التحويل» مجدداً"; return; }
      finishRow(fmt, out);
    }));
    clearInterval(globalBar);
  } else {
    // الخطة البديلة (عنصر تشغيل واحد): بالتسلسل
    for (const fmt of VIDEO_FORMATS) {
      const st = rows[fmt.key].querySelector("[data-st]");
      st.textContent = "🎬 جارٍ التجهيز…";
      let out = null;
      try { out = await convertOne(fmt, mime); }
      catch (e) { st.textContent = "⚠ تعذّر: " + e.message; continue; }
      if (!out) {
        if (vsUserCancel) { st.textContent = "أُلغي"; break; }
        st.textContent = "⚠ علّق المتصفح — اضغط «ابدأ التحويل» مجدداً";
        continue;
      }
      finishRow(fmt, out);
    }
  }

  $("vs-cancel").classList.add("hidden");
  $("vs-bar").style.width = "0%";
  $("vs-status").textContent = doneCount === VIDEO_FORMATS.length
    ? "✅ كل الفيديوهات جاهزة — تحت كل قالب المنصّاتُ التي يخدمها."
    : (doneCount ? "جاهز جزئياً — اضغط «ابدأ التحويل» لتجهيز الباقي." : "");
  if (startBtn) startBtn.disabled = false;
  vsRunning = false;
}

function mountVideoStudio() {
  const input = $("vs-file");
  if (!input) return;
  const startBtn = $("vs-start");
  input.addEventListener("change", () => {
    const file = mediaFileReady();
    if (file) { prepareDecode(file); startBtn.classList.remove("hidden"); }
    else startBtn.classList.add("hidden");
    refreshVideoHint();
  });
  startBtn.addEventListener("click", () => {
    blessWithinTap(); // متزامن داخل اللمسة — يفعّل ساعة الصوت بيقين
    convertAllFormats();
  });
  $("vs-cancel").addEventListener("click", () => {
    vsUserCancel = true;
    if (vsAbort) vsAbort();
    vsAborts.forEach((f) => f());
  });
  refreshVideoHint();
}
