// محرّر مونتاج داخل المتصفّح: قص + شعار + عنوان + تصدير (Canvas + MediaRecorder).
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function ar(n) { return String(n).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; }); }
  function fmt(t) {
    t = Math.max(0, t || 0);
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return ar(m) + ":" + ar(s < 10 ? "0" + s : s);
  }

  var video = $("src"), canvas = $("stage"), ctx = canvas.getContext("2d");
  var startR = $("start"), endR = $("end");
  var logoImg = new Image();
  logoImg.src = "/assets/logo.svg";
  var customLogo = null;
  var rafId = null, duration = 0, ready = false;

  // ===== تحميل الفيديو =====
  $("file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    video.src = URL.createObjectURL(f);
    video.muted = true; // لتفادي حظر التشغيل التلقائي في المعاينة
  });

  video.addEventListener("loadedmetadata", function () {
    duration = video.duration || 0;
    // أبعاد الكانفس بنسبة الفيديو (بحدّ أقصى للعرض).
    var w = video.videoWidth || 1280, h = video.videoHeight || 720;
    var maxW = 1280;
    if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
    canvas.width = w; canvas.height = h;
    canvas.style.aspectRatio = w + "/" + h;
    startR.max = endR.max = String(duration);
    startR.step = endR.step = "0.1";
    startR.value = "0"; endR.value = String(duration);
    updateLabels();
    ready = true;
    video.currentTime = 0;
    startRender();
  });

  // ===== الشعار المخصّص =====
  $("logoFile").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) { customLogo = null; return; }
    var img = new Image();
    img.onload = function () { customLogo = img; };
    img.src = URL.createObjectURL(f);
  });

  // ===== أشرطة القص =====
  function updateLabels() {
    var s = +startR.value, e = +endR.value;
    if (s > e - 0.2) { s = Math.max(0, e - 0.2); startR.value = String(s); }
    $("startLbl").textContent = fmt(s);
    $("endLbl").textContent = fmt(e);
    $("timeLbl").textContent = fmt(video.currentTime) + " / " + fmt(duration);
  }
  startR.addEventListener("input", function () {
    if (+startR.value > +endR.value - 0.2) startR.value = String(Math.max(0, +endR.value - 0.2));
    if (video.currentTime < +startR.value || video.currentTime > +endR.value) video.currentTime = +startR.value;
    updateLabels();
  });
  endR.addEventListener("input", function () {
    if (+endR.value < +startR.value + 0.2) endR.value = String(Math.min(duration, +startR.value + 0.2));
    updateLabels();
  });

  // ===== الرسم المركّب =====
  function drawFrame() {
    if (canvas.width && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    var W = canvas.width, H = canvas.height;

    // الشعار (أعلى اليمين)
    if ($("logoToggle").checked) {
      var lg = customLogo || (logoImg.complete && logoImg.naturalWidth ? logoImg : null);
      if (lg) {
        var ls = Math.round(H * 0.16), pad = Math.round(H * 0.03);
        try { ctx.drawImage(lg, W - ls - pad, pad, ls, ls); } catch (err) { /* تجاهل */ }
      }
    }

    // العنوان + السطر الفرعي (أسفل)
    var title = $("title").value.trim();
    var sub = $("subtitle").value.trim();
    if (title || sub) {
      var barH = Math.round(H * (sub ? 0.2 : 0.13));
      var grad = ctx.createLinearGradient(0, H - barH, 0, H);
      grad.addColorStop(0, "rgba(7,13,32,0)");
      grad.addColorStop(1, "rgba(7,13,32,0.85)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, H - barH, W, barH);
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      if (title) {
        ctx.fillStyle = "#e8c558";
        ctx.font = "700 " + Math.round(H * 0.055) + "px Tajawal, sans-serif";
        ctx.fillText(title, W / 2, H - (sub ? barH * 0.42 : barH * 0.35), W * 0.9);
      }
      if (sub) {
        ctx.fillStyle = "#e9eef7";
        ctx.font = "500 " + Math.round(H * 0.04) + "px Tajawal, sans-serif";
        ctx.fillText(sub, W / 2, H - barH * 0.12, W * 0.9);
      }
    }
  }

  function loop() {
    drawFrame();
    // إيقاف عند نهاية المقطع المقصوص أثناء التشغيل.
    if (!video.paused && video.currentTime >= +endR.value) video.pause();
    $("timeLbl").textContent = fmt(video.currentTime) + " / " + fmt(duration);
    rafId = requestAnimationFrame(loop);
  }
  function startRender() { if (!rafId) loop(); }

  // ===== تشغيل/إيقاف المعاينة =====
  $("play").addEventListener("click", function () {
    if (!ready) return;
    if (video.currentTime < +startR.value || video.currentTime >= +endR.value) video.currentTime = +startR.value;
    video.play();
  });
  $("pause").addEventListener("click", function () { video.pause(); });

  // ===== التصدير =====
  var audioWired = false, audioDest = null, actx = null;
  function wireAudio() {
    if (audioWired) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      var srcNode = actx.createMediaElementSource(video);
      audioDest = actx.createMediaStreamDestination();
      srcNode.connect(audioDest);
      srcNode.connect(actx.destination);
      audioWired = true;
    } catch (err) { audioWired = false; }
  }

  function pickMime() {
    var list = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (var i = 0; i < list.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(list[i])) return list[i];
    }
    return "";
  }

  $("export").addEventListener("click", function () {
    var status = $("status");
    if (!ready) { status.textContent = "حمّل فيديو أولاً."; return; }
    if (!window.MediaRecorder || !canvas.captureStream) {
      status.textContent = "متصفّحك لا يدعم التصدير. جرّب Chrome حديثاً.";
      return;
    }
    var mime = pickMime();
    $("downloadWrap").innerHTML = "";
    status.textContent = "جارٍ التصدير… لا تغلق الصفحة.";

    // الصوت مع الفيديو أثناء التصدير
    video.muted = false;
    wireAudio();
    if (actx && actx.state === "suspended") actx.resume();

    var stream = canvas.captureStream(30);
    if (audioDest) audioDest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });

    var rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    var chunks = [];
    rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstop = function () {
      video.muted = true;
      var blob = new Blob(chunks, { type: mime || "video/webm" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "riyad-clip.webm";
      a.className = "btn btn-primary";
      a.textContent = "⤓ تنزيل المقطع المصدَّر";
      $("downloadWrap").appendChild(a);
      var v = document.createElement("video");
      v.src = url; v.controls = true; v.style.cssText = "width:100%;margin-top:1rem;border-radius:12px";
      $("downloadWrap").appendChild(v);
      status.textContent = "اكتمل التصدير ✓";
    };

    var endAt = +endR.value;
    function watch() {
      if (video.currentTime >= endAt || video.ended) {
        if (rec.state !== "inactive") rec.stop();
        video.pause();
        return;
      }
      requestAnimationFrame(watch);
    }

    video.currentTime = +startR.value;
    var onSeek = function () {
      video.removeEventListener("seeked", onSeek);
      rec.start();
      video.play().then(function () { watch(); }, function () {
        // إن مُنع التشغيل، أوقف التسجيل.
        if (rec.state !== "inactive") rec.stop();
        status.textContent = "تعذّر بدء التشغيل للتصدير.";
      });
    };
    video.addEventListener("seeked", onSeek);
  });
})();
