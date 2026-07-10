/* ===== استوديو الفيديو — مقطعك داخل فريم رياض المتقين =====
   يرفع صاحب المحتوى فيديو أو مقطعاً صوتياً، فنرسمه داخل التصميم (الخلفية،
   الإطار الذهبي، الشعار، الاسم والعنوان) بمقاس المنصّة المختارة، ونسجّل
   الناتج فيديو قابلاً للتحميل/المشاركة على الهاتف.
   بصراحة تقنية: المعالجة تجري في متصفحك بسرعة تشغيل المقطع نفسه
   (دقيقة مقطع = دقيقة تحويل) — مثالية للمقاطع القصيرة. */

const VIDEO_PLATFORMS = ["tiktok", "reels", "story", "igpost", "whatsapp", "x", "facebook", "youtube"];

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

/* رسم إطار الفيديو: رأس مختصر (شعار+اسم+عنوان) + نافذة وسائط + تذييل */
function drawMediaFrame(ctx, p, data, media, analyser, freqArr) {
  const { w, h, safe } = p;
  const box = { x: safe[3], y: safe[0], w: w - safe[1] - safe[3], h: h - safe[0] - safe[2] };
  const S = Math.min(box.w, box.h) / 1080;
  const landscape = w > h;

  // الخلفية والنقاط
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, BRAND.g[0]); grad.addColorStop(.35, BRAND.g[1]);
  grad.addColorStop(.7, BRAND.g[2]); grad.addColorStop(1, BRAND.g[3]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(201,162,75,.10)";
  for (let yy = 60; yy < h; yy += 170) for (let xx = 60 + (yy % 340 ? 85 : 0); xx < w; xx += 170) {
    ctx.beginPath(); ctx.arc(xx, yy, 3, 0, 7); ctx.fill();
  }

  // الإطار الذهبي
  ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(3, 6 * S);
  roundRect(ctx, box.x + 8, box.y + 8, box.w - 16, box.h - 16, 42 * S); ctx.stroke();

  const cx = box.x + box.w / 2;
  let y = box.y + (landscape ? 34 : 60) * S;
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";

  // رأس مختصر: الاسم ثم العنوان (سطر لكل منهما)
  const nameSize = Math.round((landscape ? 44 : 56) * S);
  const subjSize = Math.round((landscape ? 36 : 44) * S);
  ctx.fillStyle = BRAND.gold2;
  ctx.font = `700 ${nameSize}px "Aref Ruqaa", serif`;
  const nameLine = ((data.title ? data.title + " " : "") + (data.name || "")).trim();
  if (nameLine) { y += nameSize; ctx.fillText(nameLine, cx, y); }
  ctx.fillStyle = BRAND.cream;
  ctx.font = `700 ${subjSize}px "Amiri", serif`;
  const subjLines = wrapText(ctx, data.subject || "", box.w * .82).slice(0, 2);
  for (const line of subjLines) { y += subjSize * 1.45; ctx.fillText(line, cx, y); }
  y += (landscape ? 22 : 34) * S;

  // نافذة الوسائط
  const footH = 70 * S;
  const mw = box.w - 72 * S;
  const mh = box.y + box.h - footH - y - 24 * S;
  const mx = box.x + 36 * S;
  ctx.save();
  roundRect(ctx, mx, y, mw, mh, 26 * S);
  ctx.clip();
  ctx.fillStyle = "#0a1712"; ctx.fillRect(mx, y, mw, mh);

  if (media && media.videoWidth) {
    // فيديو: ملء النافذة مع قصّ مركزي (cover)
    const vw = media.videoWidth, vh = media.videoHeight;
    const sc = Math.max(mw / vw, mh / vh);
    const dw = vw * sc, dh = vh * sc;
    ctx.drawImage(media, mx + (mw - dw) / 2, y + (mh - dh) / 2, dw, dh);
  } else {
    // صوت: سمّاعة + أعمدة متراقصة من التحليل الطيفي
    ctx.fillStyle = BRAND.gold2;
    ctx.font = `${Math.round(120 * S)}px serif`;
    ctx.fillText("🎧", cx, y + mh * .42);
    if (analyser) {
      analyser.getByteFrequencyData(freqArr);
      const bars = 24, bw = mw / (bars * 1.6);
      for (let i = 0; i < bars; i++) {
        const v = freqArr[Math.floor(i * freqArr.length / bars)] / 255;
        const bh = Math.max(6 * S, v * mh * .34);
        ctx.fillStyle = i % 2 ? BRAND.gold : BRAND.gold2;
        ctx.fillRect(mx + mw * .1 + i * bw * 1.6, y + mh * .82 - bh, bw, bh);
      }
    }
  }
  ctx.restore();
  ctx.strokeStyle = BRAND.gold; ctx.lineWidth = Math.max(2, 4 * S);
  roundRect(ctx, mx, y, mw, mh, 26 * S); ctx.stroke();

  // التذييل
  ctx.fillStyle = "rgba(239,231,214,.8)";
  ctx.font = `${Math.round(30 * S)}px "Amiri", serif`;
  ctx.fillText("رياض المتقين · riyadalmutaqin.com", cx, box.y + box.h - 28 * S);
}

let vsAbort = null;

async function convertMedia() {
  const fileInput = $("vs-file");
  const file = fileInput.files && fileInput.files[0];
  const status = $("vs-status");
  if (!file) { toast("اختر ملف فيديو أو صوت أولاً", "err"); return; }
  const p = PLATFORMS.find((x) => x.key === $("vs-platform").value) || PLATFORMS[0];
  const mime = pickMime();
  if (!window.MediaRecorder || !mime) {
    status.textContent = "متصفحك لا يدعم تسجيل الفيديو — جرّب كروم أو سفاري حديثاً.";
    return;
  }
  await ensureFonts();
  if (logoImage === null) await loadLogo();

  const isVideo = file.type.startsWith("video");
  const media = document.createElement(isVideo ? "video" : "audio");
  media.src = URL.createObjectURL(file);
  media.playsInline = true;
  await new Promise((res, rej) => { media.onloadedmetadata = res; media.onerror = () => rej(new Error("تعذّرت قراءة الملف")); });

  const data = {
    title: $("st-title").value.trim(),
    name: $("st-name").value.trim(),
    subject: $("st-subject").value.trim(),
  };

  const canvas = document.createElement("canvas");
  canvas.width = p.w; canvas.height = p.h;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(30);

  // مسار الصوت الأصلي إلى التسجيل
  const acx = new AudioContext();
  await acx.resume();
  const srcNode = acx.createMediaElementSource(media);
  const dest = acx.createMediaStreamDestination();
  const analyser = acx.createAnalyser(); analyser.fftSize = 64;
  srcNode.connect(analyser); analyser.connect(dest);
  const freqArr = new Uint8Array(analyser.frequencyBinCount);
  const aTrack = dest.stream.getAudioTracks()[0];
  if (aTrack) stream.addTrack(aTrack);

  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const doneRec = new Promise((res) => { rec.onstop = res; });

  let stopped = false;
  vsAbort = () => { stopped = true; media.pause(); rec.state !== "inactive" && rec.stop(); };
  $("vs-cancel").classList.remove("hidden");
  $("vs-convert").disabled = true;

  rec.start(250);
  await media.play();
  const bar = $("vs-bar");
  (function loop() {
    if (stopped || media.ended) return;
    drawMediaFrame(ctx, p, data, isVideo ? media : null, analyser, freqArr);
    bar.style.width = ((media.currentTime / media.duration) * 100 || 0) + "%";
    status.textContent = "جارٍ التحويل… " + Math.floor(media.currentTime) + " / " + Math.floor(media.duration) + " ثانية";
    requestAnimationFrame(loop);
  })();
  await new Promise((res) => { media.onended = res; const t = setInterval(() => { if (stopped) { clearInterval(t); res(); } }, 200); });
  if (rec.state !== "inactive") rec.stop();
  await doneRec;
  acx.close(); URL.revokeObjectURL(media.src);
  $("vs-cancel").classList.add("hidden");
  $("vs-convert").disabled = false;
  vsAbort = null;

  if (stopped) { status.textContent = "أُلغي التحويل."; bar.style.width = "0%"; return; }

  const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
  const blob = new Blob(chunks, { type: mime.split(";")[0] });
  const url = URL.createObjectURL(blob);
  const prev = $("vs-preview");
  prev.src = url; prev.classList.remove("hidden");
  status.innerHTML = `✅ جاهز (${(blob.size / 1048576).toFixed(1)} MB · ${ext}) — عاينه ثم نزّله.` +
    (ext === "webm" ? '<br><span class="muted">ملاحظة: صيغة webm — إن رفضتها منصّة، افتح الموقع من سفاري (iPhone) فيخرج mp4.</span>' : "");
  bar.style.width = "100%";

  $("vs-download").classList.remove("hidden");
  $("vs-download").onclick = async () => {
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
  const btn = $("vs-convert");
  if (!btn) return;
  $("vs-platform").innerHTML = VIDEO_PLATFORMS.map((k) => {
    const p = PLATFORMS.find((x) => x.key === k);
    return `<option value="${k}">${p.name} (${p.w}×${p.h})</option>`;
  }).join("");
  btn.addEventListener("click", () => convertMedia().catch((e) => {
    $("vs-status").textContent = "تعذّر التحويل: " + e.message;
    $("vs-convert").disabled = false; $("vs-cancel").classList.add("hidden");
  }));
  $("vs-cancel").addEventListener("click", () => { if (vsAbort) vsAbort(); });
}
