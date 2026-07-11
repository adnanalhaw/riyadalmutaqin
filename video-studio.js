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

let vsAbort = null;
let vsRunning = false;

function mediaFileReady() {
  const f = $("vs-file");
  return f && f.files && f.files[0];
}

function refreshVideoHint() {
  const hint = $("vs-hint");
  if (!hint) return;
  hint.textContent = mediaFileReady()
    ? "✓ المقطع جاهز (" + mediaFileReady().name + ") — تُجهَّز الفيديوهات لكل المنصّات تلقائياً."
    : "أرفق مقطعاً وتُجهَّز الفيديوهات لكل المنصّات تلقائياً — لا حاجة لأي اختيار.";
}

/* تحويل قالب واحد. يعيد {blob, ext} أو null عند الإلغاء */
async function convertOne(fmt, file, mime) {
  const isVideo = file.type.startsWith("video");
  const media = document.createElement(isVideo ? "video" : "audio");
  media.src = URL.createObjectURL(file);
  media.playsInline = true;
  await new Promise((res, rej) => { media.onloadedmetadata = res; media.onerror = () => rej(new Error("تعذّرت قراءة الملف")); });

  const data = studioData();
  // الإطار الثابت يُرسم مرة واحدة في لوحة عازلة، والنسخ الدوري منها رخيص جداً —
  // فلا يُجهد المعالج ولا يتقطّع الصوت (إعادة الرسم الكامل كانت تقطّعه)
  const buffer = document.createElement("canvas");
  drawPost(buffer, fmt, data);
  const canvas = document.createElement("canvas");
  canvas.width = fmt.w; canvas.height = fmt.h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(buffer, 0, 0);
  const stream = canvas.captureStream(15);

  // صوت المقطع فقط (مشهد الفيديو الأصلي لا يظهر إطلاقاً)
  const acx = new AudioContext();
  await acx.resume();
  const srcNode = acx.createMediaElementSource(media);
  const dest = acx.createMediaStreamDestination();
  srcNode.connect(dest);
  const aTrack = dest.stream.getAudioTracks()[0];
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
  rec.start(250);
  await media.play();
  const painter = setInterval(() => ctx.drawImage(buffer, 0, 0), 200);
  const progress = setInterval(() => {
    if (media.duration) bar.style.width = ((media.currentTime / media.duration) * 100 || 0) + "%";
    status.textContent = "جارٍ تجهيز «" + fmt.name + "»… " +
      Math.floor(media.currentTime) + " / " + Math.floor(media.duration || 0) + " ثانية";
  }, 300);

  await new Promise((res) => { media.onended = res; const t = setInterval(() => { if (stopped) { clearInterval(t); res(); } }, 200); });
  clearInterval(painter); clearInterval(progress);
  await new Promise((r) => setTimeout(r, 400)); // مهلة ذيل — كي لا يُقصّ آخر الصوت
  if (rec.state !== "inactive") rec.stop();
  await doneRec;
  acx.close(); URL.revokeObjectURL(media.src);
  vsAbort = null;
  if (stopped) return null;
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
  vsRunning = true;
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
  for (const fmt of VIDEO_FORMATS) {
    const st = rows[fmt.key].querySelector("[data-st]");
    st.textContent = "🎬 جارٍ التجهيز…";
    let out = null;
    try { out = await convertOne(fmt, file, mime); }
    catch (e) { st.textContent = "⚠ تعذّر: " + e.message; continue; }
    if (!out) { st.textContent = "أُلغي"; break; }
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
    rows[fmt.key].appendChild(btn);
  }

  $("vs-cancel").classList.add("hidden");
  $("vs-bar").style.width = "0%";
  $("vs-status").textContent = doneCount === VIDEO_FORMATS.length
    ? "✅ كل الفيديوهات جاهزة — تحت كل قالب المنصّاتُ التي يخدمها."
    : (doneCount ? "جاهز جزئياً — أعد اختيار الملف لتجهيز الباقي." : "");
  vsRunning = false;
}

function mountVideoStudio() {
  const input = $("vs-file");
  if (!input) return;
  input.addEventListener("change", () => { refreshVideoHint(); convertAllFormats(); });
  $("vs-cancel").addEventListener("click", () => { if (vsAbort) vsAbort(); });
  refreshVideoHint();
}
