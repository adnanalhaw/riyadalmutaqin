/* ===== تحويل المقطع: صوت مقطعك تحت صورتنا الثابتة =====
   يُستبدل مشهد الفيديو كلياً بالتصميم المختار (الخطوة ١)، ويبقى الصوت فقط —
   فيخرج فيديو بمقاس المنصّة بهويتنا، جاهزاً للتنزيل المباشر على الهاتف.
   ملاحظة صادقة: التحويل يجري على جهازك بسرعة تشغيل المقطع نفسه. */

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

function mediaFileReady() {
  const f = $("vs-file");
  return f && f.files && f.files[0];
}

/* تفعيل/تعطيل أزرار «فيديو 🎬» في شبكة المنصّات حسب وجود مقطع */
function refreshVideoButtons() {
  const ready = !!mediaFileReady();
  document.querySelectorAll("[data-vid]").forEach((b) => {
    b.disabled = !ready;
    b.title = ready ? "حوّل لهذه المنصّة" : "أرفق مقطعاً في الخطوة ٢ أولاً";
  });
  const hint = $("vs-hint");
  if (hint) hint.textContent = ready
    ? "✓ المقطع جاهز (" + mediaFileReady().name + ") — اضغط «فيديو 🎬» تحت أي منصّة في الخطوة ٣."
    : "أرفق مقطعاً ليتفعّل زر «فيديو 🎬» تحت كل منصّة.";
}

async function convertMediaFor(platformKey) {
  const file = mediaFileReady();
  const status = $("vs-status");
  if (!file) { toast("أرفق مقطعاً في الخطوة ٢ أولاً", "err"); return; }
  const p = PLATFORMS.find((x) => x.key === platformKey) || PLATFORMS[0];
  const mime = pickMime();
  if (!window.MediaRecorder || !mime) {
    status.textContent = "متصفحك لا يدعم تسجيل الفيديو — جرّب كروم أو سفاري حديثاً.";
    return;
  }
  const dataCheck = studioData();
  if (!dataCheck.name && !dataCheck.subject) {
    toast("اكتب اسم الشيخ وعنوان الدرس في الخطوة ١ أولاً", "err");
    return;
  }
  await ensureFonts();
  if (logoImage === null) await loadLogo();
  await loadScene();

  const isVideo = file.type.startsWith("video");
  const media = document.createElement(isVideo ? "video" : "audio");
  media.src = URL.createObjectURL(file);
  media.playsInline = true;
  await new Promise((res, rej) => { media.onloadedmetadata = res; media.onerror = () => rej(new Error("تعذّرت قراءة الملف")); });

  const data = studioData();

  // الصورة الثابتة بالتصميم المختار — تُرسم مرة وتُعاد كإطارات
  const canvas = document.createElement("canvas");
  drawPost(canvas, p, data);
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(30);

  // صوت المقطع فقط (مشهد الفيديو الأصلي لا يظهر إطلاقاً)
  const acx = new AudioContext();
  await acx.resume();
  const srcNode = acx.createMediaElementSource(media);
  const dest = acx.createMediaStreamDestination();
  srcNode.connect(dest);
  const aTrack = dest.stream.getAudioTracks()[0];
  if (aTrack) stream.addTrack(aTrack);

  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const doneRec = new Promise((res) => { rec.onstop = res; });

  let stopped = false;
  vsAbort = () => { stopped = true; media.pause(); rec.state !== "inactive" && rec.stop(); };
  $("vs-cancel").classList.remove("hidden");
  $("vs-area").classList.remove("hidden");
  status.textContent = "جارٍ التحويل لمقاس «" + p.name + "»…";

  rec.start(250);
  await media.play();
  const bar = $("vs-bar");
  // إعادة رسم دورية خفيفة كي يستمر بثّ الإطارات (المشهد ثابت)
  const painter = setInterval(() => { drawPost(canvas, p, data); }, 100);
  const progress = setInterval(() => {
    if (media.duration) bar.style.width = ((media.currentTime / media.duration) * 100 || 0) + "%";
    status.textContent = "جارٍ التحويل لمقاس «" + p.name + "»… " +
      Math.floor(media.currentTime) + " / " + Math.floor(media.duration || 0) + " ثانية";
  }, 300);

  await new Promise((res) => { media.onended = res; const t = setInterval(() => { if (stopped) { clearInterval(t); res(); } }, 200); });
  clearInterval(painter); clearInterval(progress);
  if (rec.state !== "inactive") rec.stop();
  await doneRec;
  acx.close(); URL.revokeObjectURL(media.src);
  $("vs-cancel").classList.add("hidden");
  vsAbort = null;

  if (stopped) { status.textContent = "أُلغي التحويل."; bar.style.width = "0%"; return; }

  const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
  const blob = new Blob(chunks, { type: mime.split(";")[0] });
  const url = URL.createObjectURL(blob);
  const prev = $("vs-preview");
  prev.src = url; prev.classList.remove("hidden");
  bar.style.width = "100%";
  status.innerHTML = `✅ فيديو «${p.name}» جاهز (${(Math.max(blob.size, 104858) / 1048576).toFixed(1)} MB · ${ext}) — عاينه ثم نزّله.` +
    (ext === "webm" ? '<br><span class="muted">صيغة webm — إن رفضتها منصّة، افتح الموقع من سفاري (iPhone) فيخرج mp4.</span>' : "");

  const dl = $("vs-download");
  dl.classList.remove("hidden");
  dl.onclick = async () => {
    const filename = `riyad-video-${p.key}.${ext}`;
    const f = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: "رياض المتقين" }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
  };
}

function mountVideoStudio() {
  const input = $("vs-file");
  if (!input) return;
  input.addEventListener("change", refreshVideoButtons);
  $("vs-cancel").addEventListener("click", () => { if (vsAbort) vsAbort(); });
  refreshVideoButtons();
}
