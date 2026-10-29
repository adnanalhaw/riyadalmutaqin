// استوديو رياض المتقين: تصميم بطاقة موحّد (شعار + لقب القناة + اسم الملقي + عنوان + موجة + إطار)
// يُنتج صوراً (PNG) أو فيديو (صوت + نفس الخلفية) بعدّة مقاسات — داخل المتصفّح عبر ffmpeg.wasm.
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var BASE = "/vendor/ffmpeg/";
  var FFmpeg = (window.FFmpegWASM || {}).FFmpeg;
  var FU = window.FFmpegUtil || {};

  var FORMATS = [
    { key: "story",  label: "ريلز 9:16", w: 1080, h: 1920, frame: "reel",
      chips: "انستقرام ريلز · فيسبوك", caption: "معاينة انستقرام ريلز / فيسبوك" },
    { key: "square", label: "منشور مربّع 1:1", w: 1080, h: 1080, frame: "square",
      chips: "فيسبوك/انستقرام (تغذية)", caption: "معاينة منشور مربّع — فيسبوك/انستقرام (تغذية)" },
    { key: "wide",   label: "أفقي 16:9", w: 1920, h: 1080, frame: "wide",
      chips: "يوتيوب", caption: "معاينة أفقية — يوتيوب" },
  ];
  var MIN_VIDEO_BYTES = 1024;

  var ff = null, loadPromise = null, busy = false, results = [], chosenFile = null;
  var mediaDuration = 0, liveUrl = "", scrubbing = false;
  var ffChain = Promise.resolve();
  var written = { sig: "", name: "" };
  var transcriptSig = "", transcriptWords = null, pendingTranscript = null;
  var cueState = { sig: "", cues: [] };

  var logo = new Image(); var logoReady = false;
  logo.onload = function () { logoReady = true; drawPreview(); };
  logo.src = "/assets/logo.png";

  // ===== أدوات =====
  function setStatus(m) { $("status").textContent = m || ""; }
  function setBar(p) { $("bar").style.width = Math.max(0, Math.min(100, p)) + "%"; }
  function human(b) { if (b == null) return ""; var u = ["B","KB","MB","GB"], i = 0, n = b; while (n >= 1024 && i < 3) { n /= 1024; i++; } return (Math.round(n*10)/10) + " " + u[i]; }
  function selectedFormats() { return FORMATS.filter(function (f) { var b = $("fmt_" + f.key); return b && b.checked; }); }
  function previewFormat() {
    var sel = selectedFormats();
    var reel = sel.filter(function (f) { return f.key === "story"; })[0];
    return reel || sel[0] || FORMATS[0];
  }
  function val(id) { var e = $(id); return e ? (e.value || "").trim() : ""; }
  function copyBytes(data) {
    var src = data instanceof Uint8Array ? data : new Uint8Array(data);
    var out = new Uint8Array(src.byteLength);
    out.set(src);
    return out;
  }
  function revokeResultUrls() {
    results.forEach(function (r) {
      if (r && r.url) { try { URL.revokeObjectURL(r.url); } catch (e) {} }
    });
  }

  function fields() {
    var hon = val("hon");
    var nm = val("name");
    var nameLine = (hon ? hon + " " : "") + nm;
    return { name: nameLine.trim(), topic: val("topic"), audio: $("audioTgl") && $("audioTgl").checked, mosque: val("mosque") };
  }

  function khutbahOn() { var e = $("khutbahTgl"); return !!(e && e.checked && window.Khutbah); }
  function sourceKind() {
    var r = document.querySelector('input[name="sourceKind"]:checked');
    return r && r.value === "web" ? "web" : "speaker";
  }
  function sourceLabel() { return sourceKind() === "web" ? "مقاطع من النت" : "فيديوهات الملقي"; }
  function activeInput() { return sourceKind() === "web" ? $("fileWeb") : $("file"); }
  function activeFile() {
    var input = activeInput();
    return (input && input.files && input.files[0]) || null;
  }
  function fileSig(file) {
    return [file.name, file.size, file.lastModified].join("|");
  }
  function trimWindow() {
    var full = isFinite(mediaDuration) ? mediaDuration : 0;
    var start = Math.max(0, Number(val("trimStart")) || 0);
    var endRaw = $("trimEnd") ? $("trimEnd").value : "";
    var end = endRaw === "" ? full : Number(endRaw);
    if (!isFinite(end) || end <= start) end = full > start ? full : start;
    if (full && end > full) end = full;
    return { start: start, end: end, dur: Math.max(0, end - start), full: full };
  }
  function clipSig(file) {
    var tw = trimWindow();
    return [fileSig(file), tw.start, tw.end, sourceKind()].join("|");
  }
  function manualCard() {
    var text = val("cardText");
    if (!text) return null;
    return { text: text, cite: val("cardCite"), type: $("cardType") ? $("cardType").value : "quran", at: Number($("cardAt") && $("cardAt").value), end: Number($("cardEnd") && $("cardEnd").value) };
  }
  function cuesForExport() {
    var file = activeFile();
    var sig = file ? clipSig(file) : "";
    var base = cueState.sig === sig || cueState.sig === "manual" ? cueState.cues : [];
    var copy = base.map(function (c) { return Object.assign({}, c, { keywords: (c.keywords || []).slice() }); });
    copy.forEach(function (c) { KhutbahCues.refreshCue(c); });
    return KhutbahCues.applyManual(copy, manualCard());
  }
  function ffEnqueue(fn) {
    var run = ffChain.then(fn, fn);
    ffChain = run.then(function () {}, function () {});
    return run;
  }
  function writeInput(file) {
    var sig = fileSig(file);
    if (written.sig === sig && written.name) return Promise.resolve(written.name);
    var name = "in_" + Date.now() + "_" + String(file.name || "clip").replace(/[^\w.\-]+/g, "_");
    return FU.fetchFile(file).then(function (data) {
      return ff.writeFile(name, data).then(function () {
        if (written.name && written.name !== name) {
          try { ff.deleteFile(written.name); } catch (e) { /* previous input */ }
        }
        written = { sig: sig, name: name };
        return name;
      });
    });
  }
  function renderCueList() {
    var list = $("cueList");
    if (!list) return;
    list.innerHTML = "";
    cueState.cues.forEach(function (cue, index) {
      var row = document.createElement("div");
      row.className = "kh-cue";
      var time = document.createElement("span");
      time.className = "kh-time";
      time.textContent = cue.start.toFixed(1) + "–" + cue.end.toFixed(1);
      var input = document.createElement("input");
      input.type = "text";
      input.value = cue.text;
      input.addEventListener("input", function () {
        cueState.cues[index].text = input.value;
        cueState.cues[index].manual = false;
        KhutbahCues.refreshCue(cueState.cues[index]);
        drawPreview();
      });
      row.appendChild(time);
      row.appendChild(input);
      list.appendChild(row);
    });
  }
  function acceptWords(file, words) {
    var kept = cueState.cues.filter(function (c) { return c.userAdded; });
    var built = KhutbahCues.buildCues(words).concat(kept);
    built.sort(function (a, b) { return a.start - b.start; });
    cueState = { sig: clipSig(file), cues: built };
    transcriptWords = words;
    transcriptSig = clipSig(file);
    renderCueList();
    drawPreview();
  }
  function postTranscribe(audio) {
    var fd = new FormData();
    fd.append("file", new Blob([audio.bytes], { type: audio.mime }), audio.filename);
    return fetch("/api/teacher/transcribe", { method: "POST", body: fd })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "تعذّر قراءة رد التفريغ" }; }); })
      .then(function (d) {
        if (!d.ok || !d.words || !d.words.length) throw new Error(d.error || "لا توقيت للكلمات");
        return d.words;
      });
  }
  function ensureTranscript(file) {
    var sig = clipSig(file);
    if (transcriptWords && transcriptSig === sig) return Promise.resolve(transcriptWords);
    if (pendingTranscript && pendingTranscript.sig === sig) return pendingTranscript.promise;
    var tw = trimWindow();
    if (tw.dur > 180) {
      return Promise.reject(new Error("التفريغ الآلي يدعم حتى ٣ دقائق. قصّ المقطع، أو أضف العبارات بوقتها."));
    }
    var promise = ffEnqueue(function () {
      setStatus("جارٍ استخراج الصوت للتفريغ…");
      return loadEngine().then(function () {
        return writeInput(file).then(function (inName) {
          return Khutbah.extractAudio(ff, FU, inName, tw.start, tw.dur);
        });
      });
    }).then(function (audio) {
      setStatus("جارٍ تفريغ النص العربي…");
      return postTranscribe(audio);
    }).then(function (words) {
      acceptWords(file, words);
      setStatus("تم التفريغ — " + words.length + " وحدة موقّتة. راجع النصوص ثم أنتج.");
      return words;
    });
    pendingTranscript = { sig: sig, promise: promise };
    promise.then(function () {}, function () { if (pendingTranscript && pendingTranscript.sig === sig) pendingTranscript = null; });
    return promise;
  }
  function previewModel() {
    var f = fields();
    var tw = trimWindow();
    return {
      title: f.topic,
      speaker: f.name,
      mosque: f.mosque,
      logo: logoReady ? logo : null,
      duration: tw.dur || tw.full || 0,
      cues: window.KhutbahCues ? cuesForExport() : [],
      placeholders: true,
    };
  }

  // ===== لفّ النصّ =====
  function wrap(x, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = "";
    for (var i = 0; i < words.length; i++) {
      var t = line ? line + " " + words[i] : words[i];
      if (x.measureText(t).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = t;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  // ===== الشعار (مقصوص دائريّاً + هالة ذهبية + حلقة) =====
  function drawLogo(x, cx, cy, size, k) {
    if (!logoReady) return;
    var lw = logo.naturalWidth || 1, lh = logo.naturalHeight || 1;
    var sc = Math.min(size / lw, size / lh), dw = lw * sc, dh = lh * sc;
    var r = Math.min(dw, dh) / 2 * 0.925;
    var gl = x.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.65);
    gl.addColorStop(0, "rgba(231,193,106,0.32)"); gl.addColorStop(1, "rgba(231,193,106,0)");
    x.fillStyle = gl; x.beginPath(); x.arc(cx, cy, r * 1.65, 0, Math.PI * 2); x.fill();
    x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.clip();
    x.drawImage(logo, cx - dw / 2, cy - dh / 2, dw, dh); x.restore();
    x.strokeStyle = "rgba(231,193,106,0.7)"; x.lineWidth = Math.max(2, k * 0.006);
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
  }

  function goldLine(x, x1, x2, y, h) {
    var g = x.createLinearGradient(x1, 0, x2, 0);
    g.addColorStop(0, "rgba(231,193,106,0)"); g.addColorStop(0.5, "rgba(231,193,106,0.9)"); g.addColorStop(1, "rgba(231,193,106,0)");
    x.fillStyle = g; x.fillRect(Math.min(x1, x2), y - h / 2, Math.abs(x2 - x1), h);
  }

  function diamond(x, cx, cy, s) {
    x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4);
    var g = x.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, "#F7E3A1"); g.addColorStop(1, "#C89A3A");
    x.fillStyle = g; x.fillRect(-s, -s, s * 2, s * 2); x.restore();
  }

  // ===== رسم البطاقة (متكيّف مع أي مقاس) =====
  function paint(x, W, H) {
    var k = Math.min(W, H), u = k / 100;
    var f = fields();
    var nameTxt = f.name || "اسم الملقي";
    var topicTxt = f.topic || "عنوان الدرس";

    // خلفية كحليّة دافئة + توهّج ذهبيّ
    var bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#07182C"); bg.addColorStop(0.55, "#0C2240"); bg.addColorStop(1, "#0a1622");
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    var gl = x.createRadialGradient(W * 0.8, -H * 0.1, 0, W * 0.8, -H * 0.1, H * 0.7);
    gl.addColorStop(0, "rgba(231,193,106,0.12)"); gl.addColorStop(1, "rgba(231,193,106,0)");
    x.fillStyle = gl; x.fillRect(0, 0, W, H);

    // إطار + زوايا
    var inset = Math.round(3.2 * u), bw = Math.max(2, 0.22 * u * 3);
    x.strokeStyle = "rgba(231,193,106,0.45)"; x.lineWidth = bw;
    x.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset);
    x.strokeStyle = "#E7C16A"; x.lineWidth = Math.max(3, 0.4 * u);
    var cl = 6 * u;
    [[inset, inset, 1, 1], [W - inset, inset, -1, 1], [inset, H - inset, 1, -1], [W - inset, H - inset, -1, -1]].forEach(function (q) {
      x.beginPath(); x.moveTo(q[0] + q[2] * cl, q[1]); x.lineTo(q[0], q[1]); x.lineTo(q[0], q[1] + q[3] * cl); x.stroke();
    });

    x.textAlign = "center"; try { x.direction = "rtl"; } catch (e) {}

    // قياسات العناصر
    var logoD = 32 * u, labelF = 2.9 * u, nameF = 6.8 * u, topicF = 4.4 * u;
    x.font = "700 " + nameF + "px 'Aref Ruqaa','Amiri',serif";
    var nameLines = wrap(x, nameTxt, W * 0.82);
    x.font = "400 " + topicF + "px 'Amiri',serif";
    var topicLines = wrap(x, topicTxt, W * 0.80);
    var nameLH = nameF * 1.3, topicLH = topicF * 1.55;
    var labelH = labelF * 1.4, divH = 3.4 * u, audioH = f.audio ? 6 * u : 0;

    // توزيع مُبرَّر: نملأ ~80% من الارتفاع مع فجوات محدودة (يمنع التبعثر في 9:16)
    var elems = [logoD, labelH, nameLines.length * nameLH, divH, topicLines.length * topicLH];
    if (f.audio) elems.push(audioH);
    var E = 0; elems.forEach(function (e) { E += e; });
    var nGaps = elems.length - 1;
    var gap = Math.max(2.6 * u, Math.min(9 * u, (Math.min(H * 0.80, E + 9 * u * nGaps) - E) / nGaps));
    var blockH = E + gap * nGaps;
    var y = Math.max(inset + 5 * u, (H - blockH) / 2);

    x.textBaseline = "top";

    // الشعار
    drawLogo(x, W / 2, y + logoD / 2, logoD, k); y += logoD + gap;

    // لقب القناة مع خطّين ذهبيّين
    x.font = "700 " + labelF + "px 'Amiri',serif"; x.fillStyle = "#E7C16A";
    var lt = "قناة رياض المتقين", ltw = x.measureText(lt).width;
    x.fillText(lt, W / 2, y);
    goldLine(x, W / 2 + ltw / 2 + 2.4 * u, W / 2 + ltw / 2 + 12 * u, y + labelF * 0.6, Math.max(1, 0.18 * u));
    goldLine(x, W / 2 - ltw / 2 - 2.4 * u, W / 2 - ltw / 2 - 12 * u, y + labelF * 0.6, Math.max(1, 0.18 * u));
    y += labelH + gap;

    // اسم الملقي
    x.font = "700 " + nameF + "px 'Aref Ruqaa','Amiri',serif"; x.fillStyle = "#F4DC92";
    nameLines.forEach(function (l) { x.fillText(l, W / 2, y); y += nameLH; });
    y += gap;

    // فاصل ماسيّ
    var dy = y + divH / 2;
    goldLine(x, W / 2 - 22 * u, W / 2 - 3 * u, dy, Math.max(1, 0.16 * u));
    goldLine(x, W / 2 + 3 * u, W / 2 + 22 * u, dy, Math.max(1, 0.16 * u));
    diamond(x, W / 2, dy, 1.5 * u);
    y += divH + gap;

    // عنوان الدرس
    x.font = "400 " + topicF + "px 'Amiri',serif"; x.fillStyle = "#F2ECDA";
    topicLines.forEach(function (l) { x.fillText(l, W / 2, y); y += topicLH; });

    // موجة صوتية (اختياريّة)
    if (f.audio) {
      y += gap;
      var pattern = [0.4, 0.8, 1, 0.6, 1, 0.5, 0.85, 0.45, 0.9, 0.55];
      var bw2 = 0.9 * u, wgap = 0.8 * u, maxH = audioH * 0.85;
      var tw = pattern.length * bw2 + (pattern.length - 1) * wgap;
      var sx = W / 2 - tw / 2, by = y + maxH;
      var bg2 = x.createLinearGradient(0, by - maxH, 0, by);
      bg2.addColorStop(0, "#F7E3A1"); bg2.addColorStop(1, "#C89A3A");
      x.fillStyle = bg2;
      pattern.forEach(function (hh, i) { var h2 = Math.max(2, hh * maxH); x.fillRect(sx + i * (bw2 + wgap), by - h2, bw2, h2); });
    }
  }

  // ===== المعاينة =====
  function drawPreview() {
    var c = $("preview"); if (!c) return;
    var fmt = previewFormat();
    if (c.width !== fmt.w || c.height !== fmt.h) { c.width = fmt.w; c.height = fmt.h; }
    var file = activeFile();
    var live = khutbahOn() && Khutbah.isVideoFile(file);
    var sermon = khutbahOn();
    var frame = $("previewFrame");
    if (frame) frame.className = "studio-frame studio-frame--" + (fmt.frame || "reel") + (live ? " is-live" : "");
    var vid = $("liveVideo");
    if (vid) vid.hidden = !live;
    var tools = $("khTools");
    if (tools) tools.hidden = !live;
    var ctx = c.getContext("2d");
    if (sermon && window.Khutbah) {
      var tw = trimWindow();
      var tRel = 0;
      if (live && vid) tRel = (vid.currentTime || 0) - tw.start;
      Khutbah.paintFrame(ctx, fmt.w, fmt.h, previewModel(), tRel, { backdrop: !live });
    } else {
      paint(ctx, fmt.w, fmt.h);
    }
    var lbl = $("previewLbl");
    if (lbl) {
      lbl.textContent = sermon
        ? ("معاينة خطبة الجمعة — " + sourceLabel() + " — " + (fmt.caption || fmt.label))
        : (fmt.caption || ("معاينة: " + fmt.label));
    }
  }
  function paintToBlob(fmt) {
    var c = document.createElement("canvas"); c.width = fmt.w; c.height = fmt.h;
    paint(c.getContext("2d"), fmt.w, fmt.h);
    return new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/png"); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawPreview);

  // ===== محرّك ffmpeg (للفيديو فقط) =====
  function loadEngine() {
    if (loadPromise) return loadPromise;
    if (!FFmpeg || !FU.toBlobURL) return Promise.reject(new Error("تعذّر تحميل محرّك الفيديو."));
    ff = new FFmpeg();
    ff.on("progress", function (p) { var pc = Math.round((p && p.progress ? p.progress : 0) * 100); if (pc >= 0 && pc <= 100) setBar(pc); });
    var WASM = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm";
    setStatus("جارٍ تحميل محرّك الفيديو لأوّل مرّة (~30MB)…");
    loadPromise = Promise.all([
      FU.toBlobURL(BASE + "ffmpeg-core.js", "text/javascript"),
      FU.toBlobURL(WASM, "application/wasm"),
    ]).then(function (uu) { return ff.load({ coreURL: uu[0], wasmURL: uu[1] }); });
    return loadPromise;
  }

  // ===== الإنتاج =====
  function onPicked() {
    var file = activeFile();
    chosenFile = file;
    $("fileInfo").textContent = file
      ? (sourceLabel() + " — " + file.name + " (" + human(file.size) + ")")
      : "";
    if (khutbahOn() && file && Khutbah.isVideoFile(file)) {
      attachLivePreview(file);
      ensureTranscript(file).catch(function (err) {
        setStatus((err && err.message) || "تعذّر التفريغ. أضف العبارات بوقتها ثم أنتج.");
      });
    } else {
      detachLivePreview();
      drawPreview();
    }
  }
  function attachLivePreview(file) {
    var vid = $("liveVideo");
    if (!vid) return;
    if (liveUrl) URL.revokeObjectURL(liveUrl);
    liveUrl = URL.createObjectURL(file);
    vid.src = liveUrl;
    vid.hidden = false;
    vid.onloadedmetadata = function () {
      mediaDuration = vid.duration || 0;
      var scrub = $("scrub");
      if (scrub) { scrub.max = String(mediaDuration || 0); scrub.value = "0"; }
      var tw = trimWindow();
      try { vid.currentTime = tw.start || 0.05; } catch (e) { /* seek after metadata */ }
      drawPreview();
    };
  }
  function detachLivePreview() {
    var vid = $("liveVideo");
    if (vid) { try { vid.pause(); } catch (e) { /* ignore */ } vid.removeAttribute("src"); vid.hidden = true; }
    if (liveUrl) { URL.revokeObjectURL(liveUrl); liveUrl = ""; }
    mediaDuration = 0;
  }
  $("file").addEventListener("change", onPicked);
  if ($("fileWeb")) $("fileWeb").addEventListener("change", onPicked);

  $("genBtn").addEventListener("click", function () {
    if (busy) return;
    var fmts = selectedFormats();
    if (!fmts.length) { setStatus("اختر مقاساً واحداً على الأقلّ."); return; }
    chosenFile = activeFile();
    if (!chosenFile) { setStatus("ارفع فيديو الملقي أو مقطعاً من النت أوّلاً."); return; }
    runVideo(fmts);
  });

  function startRun() {
    busy = true;
    revokeResultUrls();
    results = [];
    setBar(0);
    $("downloadWrap").innerHTML = "";
    $("publishPanel").hidden = true;
  }
  function endRun() { busy = false; }

  function runKhutbah(fmts, file) {
    startRun();
    var tw = trimWindow();
    ensureTranscript(file).catch(function (err) {
      setStatus(((err && err.message) || "تعذّر التفريغ") + " — سيُنتَج القالب بلا تفريغ آلي.");
      return [];
    }).then(function () {
      var cues = cuesForExport();
      var dur = tw.dur || tw.full;
      return ffEnqueue(function () {
        return loadEngine().then(function () {
          return writeInput(file).then(function (inName) {
            var chain = Promise.resolve();
            fmts.forEach(function (fmt, i) {
              chain = chain.then(function () {
                setStatus("جارٍ إنتاج خطبة الجمعة: " + fmt.label + " (" + (i + 1) + "/" + fmts.length + ")");
                setBar(0);
                return Khutbah.renderReel({
                  ff: ff,
                  FU: FU,
                  inName: inName,
                  w: fmt.w,
                  h: fmt.h,
                  start: tw.start,
                  duration: dur,
                  cues: cues,
                  title: fields().topic,
                  speaker: fields().name,
                  mosque: fields().mosque,
                  logo: logoReady ? logo : null,
                });
              }).then(function (blob) {
                if (!blob || blob.size < MIN_VIDEO_BYTES) throw new Error("الملف الناتج فارغ أو تالف. أعد الإنتاج.");
                results.push({
                  fmt: fmt,
                  blob: blob,
                  url: URL.createObjectURL(blob),
                  type: "video",
                  duration: dur ? Math.round(dur) : 0,
                  sourceLabel: sourceLabel(),
                });
              });
            });
            return chain;
          });
        });
      });
    }).then(function () {
      setStatus("اكتمل ✓ — " + results.length + " صيغة.");
      setBar(100);
      showResults();
    }).catch(function (err) {
      setStatus("تعذّر: " + ((err && err.message) || err));
      setBar(0);
    }).then(endRun);
  }

  function runVideo(fmts) {
    var file = activeFile();
    chosenFile = file;
    if (!file) { setStatus("ارفع ملفاً صوتيّاً أو فيديو أوّلاً."); return; }
    if (khutbahOn() && Khutbah.isVideoFile(file)) {
      runKhutbah(fmts, file);
      return;
    }
    if (khutbahOn()) {
      setStatus("الملف بلا صورة فيديو — تُرسم بطاقة الصوت. قالب الخطبة يحتاج فيديو الملقي أو مقطعاً من النت.");
    }
    startRun();
    var inName = "in_" + Date.now() + "_" + file.name.replace(/[^\w.\-]+/g, "_");
    ffEnqueue(function () { return loadEngine()
      .then(function () { setStatus("جارٍ قراءة الملف…"); return FU.fetchFile(chosenFile).then(function (d) { return ff.writeFile(inName, d); }); })
      .then(function () {
        var chain = Promise.resolve();
        fmts.forEach(function (fmt, i) {
          chain = chain.then(function () {
            setStatus("جارٍ إنتاج: " + fmt.label + " (" + (i + 1) + "/" + fmts.length + ")"); setBar(0);
            return paintToBlob(fmt)
              .then(function (bg) { return FU.fetchFile(bg).then(function (d) { return ff.writeFile("bg.png", d); }); })
              .then(function () {
                // H.264 Baseline + AAC-LC + 25fps + faststart — قابل للتشغيل على سفاري/كروم الجوال
                // (2fps + stillimage كان يُظهر أيقونة الوسائط المعطّلة على iOS).
                return ff.exec([
                  "-loop", "1", "-framerate", "25", "-i", "bg.png", "-i", inName,
                  "-map", "0:v", "-map", "1:a",
                  "-c:v", "libx264", "-profile:v", "baseline", "-level", "4.0",
                  "-tune", "stillimage", "-preset", "veryfast",
                  "-pix_fmt", "yuv420p", "-r", "25", "-g", "50",
                  "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100",
                  "-shortest", "-movflags", "+faststart", "out.mp4",
                ]);
              })
              .then(function (code) {
                if (code !== 0 && code != null) throw new Error("فشل ترميز الفيديو (رمز " + code + ").");
                return ff.readFile("out.mp4");
              })
              .then(function (data) {
                var bytes = copyBytes(data);
                var blob = new Blob([bytes], { type: "video/mp4" });
                if (!blob.size || blob.size < MIN_VIDEO_BYTES) {
                  throw new Error("الملف الناتج فارغ أو تالف. أعد الإنتاج.");
                }
                results.push({ fmt: fmt, blob: blob, url: URL.createObjectURL(blob), type: "video", sourceLabel: sourceLabel() });
                try { ff.deleteFile("out.mp4"); } catch (e) {}
              });
          });
        });
        return chain;
      })
      .then(function () { try { ff.deleteFile(inName); ff.deleteFile("bg.png"); } catch (e) {} setStatus("اكتمل ✓ — " + results.length + " صيغة."); setBar(100); showResults(); })
      .catch(function (err) { setStatus("تعذّر: " + (err.message || err)); setBar(0); })
      .then(endRun);
    });
  }

  function showResults() {
    var wrapEl = $("downloadWrap"); wrapEl.innerHTML = "";
    results.forEach(function (r) {
      var blk = document.createElement("div");
      blk.style.cssText = "margin-bottom:1.2rem;padding-bottom:1.2rem;border-bottom:1px solid var(--border)";
      var head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:.6rem";
      var tag = document.createElement("span"); tag.className = "badge"; tag.textContent = r.fmt.label + " · " + r.fmt.chips + (r.sourceLabel ? " · " + r.sourceLabel : "");
      var a = document.createElement("a");
      a.href = r.url; a.download = "riyad-" + r.fmt.key + ".mp4";
      a.className = "btn btn-primary"; a.style.cssText = "padding:.4rem 1rem;font-size:.9rem";
      a.textContent = "⤓ تنزيل (" + human(r.blob.size) + ")";
      head.appendChild(tag); head.appendChild(a);
      blk.appendChild(head);

      if (!r.blob || r.blob.size < MIN_VIDEO_BYTES) {
        var empty = document.createElement("p");
        empty.className = "studio-result-err";
        empty.textContent = "الملف الناتج فارغ أو تالف. أعد الإنتاج.";
        blk.appendChild(empty);
        wrapEl.appendChild(blk);
        return;
      }

      var frame = document.createElement("div");
      frame.className = "studio-frame studio-frame--" + (r.fmt.frame || "reel");
      var v = document.createElement("video");
      v.controls = true;
      v.preload = "metadata";
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.setAttribute("controls", "");
      v.addEventListener("error", function () {
        if (blk.querySelector(".studio-result-err")) return;
        var err = document.createElement("p");
        err.className = "studio-result-err";
        err.textContent = "تعذّر تشغيل المعاينة في المتصفّح. استخدم زر التنزيل.";
        blk.appendChild(err);
      });
      var src = document.createElement("source");
      src.src = r.url;
      src.type = "video/mp4";
      v.appendChild(src);
      v.src = r.url;
      try { v.load(); } catch (e) {}
      frame.appendChild(v);
      blk.appendChild(frame);
      var cap = document.createElement("span");
      cap.className = "studio-result-cap";
      cap.textContent = r.fmt.caption || r.fmt.label;
      blk.appendChild(cap);
      wrapEl.appendChild(blk);
    });
    if (results.length) $("publishPanel").hidden = false;
  }

  // ===== النشر =====
  function pubShow(m) { var n = $("pubMsg"); n.textContent = m; n.hidden = false; }
  function uploadMedia(blob, isVideo) {
    var fd = new FormData();
    fd.append("file", blob, isVideo ? "riyad.mp4" : "riyad.png");
    fd.append("kind", isVideo ? "video" : "image");
    return fetch("/api/teacher/media", { method: "POST", body: fd })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || "تعذّر الرفع."); return d.url; });
  }

  $("pubBtn").addEventListener("click", function () {
    if (!results.length) { pubShow("لا يوجد ناتج بعد."); return; }
    var dests = Array.prototype.slice.call($("publishPanel").querySelectorAll('input[type=checkbox]:checked:not(:disabled)')).map(function (c) { return c.value; });
    if (!dests.length) { pubShow("اختَر وجهةً واحدةً على الأقلّ."); return; }
    var f = fields();
    var title = f.name && f.name !== "" ? (f.topic ? f.topic + " — " + f.name : f.name) : f.topic;
    if (!title || title.length < 2) { pubShow("اكتب الاسم والعنوان أوّلاً."); return; }
    var toSite = dests.indexOf("site") !== -1;
    var channels = dests.filter(function (d) { return d !== "site"; });

    // للموقع: أفقي إن وُجد. للقنوات (فيسبوك/انستقرام): ريلز 9:16 أولاً.
    var siteVid = results.filter(function (r) { return r.type === "video" && r.fmt.key === "wide"; })[0] || results.filter(function (r) { return r.type === "video"; })[0];
    var media = results.filter(function (r) { return r.fmt.key === "story"; })[0] || results.filter(function (r) { return r.type === "video"; })[0] || results[0];

    $("pubBtn").disabled = true; pubShow("جارٍ الرفع والنشر…");
    var jobs = [];
    if (toSite && siteVid) {
      jobs.push(uploadMedia(siteVid.blob, true).then(function (url) {
        return fetch("/api/teacher/clips", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: f.topic || f.name, doctor_name: f.name, video_url: url, duration: siteVid.duration || undefined }) })
          .then(function (r) { return r.json(); }).then(function (d) { return { name: "الموقع", ok: !!d.ok, error: d.error }; });
      }).catch(function () { return { name: "الموقع", ok: false }; }));
    }
    if (channels.length) {
      jobs.push(uploadMedia(media.blob, media.type === "video").then(function (url) {
        return fetch("/api/teacher/posts", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: title, media_url: url, channels: channels, action: "now" }) })
          .then(function (r) { return r.json(); }).then(function (d) {
            return { name: "القنوات", ok: !!d.ok, delivered: d.delivered || [], error: d.error };
          });
      }).catch(function () { return { name: "القنوات", ok: false }; }));
    }
    Promise.all(jobs).then(function (rs) {
      var msgs = rs.map(function (r) {
        if (r.name === "الموقع") return r.ok ? "الموقع ✓" : "الموقع ✗ " + (r.error || "");
        if (r.delivered && r.delivered.length) {
          var names = { youtube: "يوتيوب", tiktok: "تيك توك", facebook: "فيسبوك", instagram: "انستقرام", x: "إكس", telegram: "تيليجرام" };
          return r.delivered.map(function (x) {
            var name = names[x.channel] || x.channel;
            return x.ok ? (name + " ✓") : (name + ": " + (x.error || "فشل"));
          }).join(" — ");
        }
        return r.ok ? "حُفِظ للقنوات" : ("تعذّر " + (r.error || ""));
      });
      pubShow(msgs.join("  •  ") + "  (نُشِر ناتج واحد؛ بقيّة المقاسات نزّلها وانشرها يدويّاً)");
    }).catch(function (e) { pubShow(e.message || "تعذّر النشر."); }).then(function () { $("pubBtn").disabled = false; });
  });

  // ===== ربط الأحداث =====
  ["hon", "name", "topic"].forEach(function (id) { var e = $(id); if (e) e.addEventListener("input", drawPreview); });
  var at = $("audioTgl"); if (at) at.addEventListener("change", drawPreview);
  FORMATS.forEach(function (f) { var b = $("fmt_" + f.key); if (b) b.addEventListener("change", drawPreview); });

  function syncSourceUi() {
    var web = sourceKind() === "web";
    if ($("speakerBox")) $("speakerBox").hidden = web;
    if ($("webBox")) $("webBox").hidden = !web;
    var on = khutbahOn();
    ["mosqueRow", "trimRow", "cardRow", "cueBox"].forEach(function (id) {
      if ($(id)) $(id).hidden = !on;
    });
    if ($("audioRow")) $("audioRow").hidden = on;
    var hint = $("fileHint");
    if (hint) {
      if (!on) hint.textContent = "يُؤخذ الصوت وتُرسم بطاقة موحّدة. فعّل قالب خطبة الجمعة وارفع فيديو لتبقى الصورة.";
      else if (web) hint.textContent = "مقطع من النت: صورة الفيديو تبقى تحت قالب الخطبة. تأكد من حق الاستخدام قبل النشر.";
      else hint.textContent = "فيديو الملقي: صورته تبقى تحت القالب. اللقب والاسم والعنوان من بيانات البطاقة.";
    }
    drawPreview();
  }
  document.querySelectorAll('input[name="sourceKind"]').forEach(function (radio) {
    radio.addEventListener("change", function () { syncSourceUi(); onPicked(); });
  });
  if ($("khutbahTgl")) $("khutbahTgl").addEventListener("change", function () {
    if (!(khutbahOn() && activeFile() && Khutbah.isVideoFile(activeFile()))) detachLivePreview();
    syncSourceUi();
    if (khutbahOn() && activeFile() && Khutbah.isVideoFile(activeFile())) onPicked();
  });
  ["trimStart", "trimEnd"].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("input", function () {
      drawPreview();
      var file = activeFile();
      if (file && transcriptSig && transcriptSig !== clipSig(file)) {
        setStatus("تغيّر القص. «أعد التفريغ» أو الإنتاج يعيد التفريغ على المقطع الجديد.");
      }
    });
  });
  ["mosque", "cardText", "cardCite", "cardAt", "cardEnd"].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener("input", drawPreview);
  });
  if ($("cardType")) $("cardType").addEventListener("change", drawPreview);
  if ($("addPhraseBtn")) $("addPhraseBtn").addEventListener("click", function () {
    var next = KhutbahCues.addPhrase(cueState.cues, {
      text: val("phraseText"),
      start: Number($("phraseStart").value),
      end: Number($("phraseEnd").value),
    });
    if (next === cueState.cues) { setStatus("اكتب العبارة ووقت البداية والنهاية. لا يُخمَّن التوقيت."); return; }
    var file = activeFile();
    cueState = { sig: file ? clipSig(file) : "manual", cues: next };
    renderCueList();
    drawPreview();
    setStatus("أُضيفت العبارة بتوقيتها.");
  });
  if ($("reTransBtn")) $("reTransBtn").addEventListener("click", function () {
    var file = activeFile();
    if (!file || !Khutbah.isVideoFile(file)) { setStatus("ارفع فيديو الملقي أو مقطعاً من النت أوّلاً."); return; }
    transcriptSig = "";
    transcriptWords = null;
    pendingTranscript = null;
    ensureTranscript(file).catch(function (err) {
      setStatus((err && err.message) || "تعذّر التفريغ.");
    });
  });
  var live = $("liveVideo");
  if (live) {
    live.addEventListener("timeupdate", function () {
      if (!scrubbing && $("scrub")) $("scrub").value = String(live.currentTime || 0);
      if (khutbahOn()) drawPreview();
    });
    live.addEventListener("seeked", drawPreview);
    live.addEventListener("play", function () { if ($("previewPlay")) $("previewPlay").textContent = "❚❚ إيقاف"; });
    live.addEventListener("pause", function () { if ($("previewPlay")) $("previewPlay").textContent = "▶ معاينة"; });
  }
  if ($("previewPlay")) $("previewPlay").addEventListener("click", function () {
    var v = $("liveVideo");
    if (!v || !v.src) return;
    if (v.paused) { v.muted = false; v.play(); }
    else v.pause();
  });
  if ($("scrub")) {
    $("scrub").addEventListener("pointerdown", function () { scrubbing = true; });
    $("scrub").addEventListener("input", function () {
      var v = $("liveVideo");
      if (!v) return;
      try { v.currentTime = Number($("scrub").value) || 0; } catch (e) { /* not seekable yet */ }
    });
    $("scrub").addEventListener("change", function () { scrubbing = false; drawPreview(); });
  }

  syncSourceUi();

  fetch("/api/auth/me", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var role = d && d.user && d.user.role;
      var staff = role === "manager" || role === "admin";
      document.querySelectorAll("[data-meta-label=facebook]").forEach(function (n) {
        n.textContent = staff ? "فيسبوك — صفحة رياض المتقين الرسمية (جاهز)" : "فيسبوك — صفحتك الخاصة (جاهز)";
      });
      document.querySelectorAll("[data-meta-label=instagram]").forEach(function (n) {
        n.textContent = staff ? "انستقرام ريلز — @almutaqyn الرسمي (جاهز)" : "انستقرام ريلز — صفحتك الخاصة (جاهز)";
      });
      var hint = document.getElementById("pubHint");
      if (hint && staff) {
        hint.innerHTML =
          "<strong>فيسبوك وانستقرام ريلز ويوتيوب</strong> جاهزة بعد الربط. " +
          "<strong>الموقع</strong> و<strong>تيليجرام</strong> يُنشَران مباشرةً. " +
          "المدير والأدمن ينشران على <strong>الحساب الرسمي</strong> (صفحة رياض المتقين و<span dir=\"ltr\">@almutaqyn</span>) " +
          "من <a class=\"gold\" href=\"/teacher/publish\">صفحة النشر</a> " +
          "بعد الربط من <a class=\"gold\" href=\"/manager/connections\">ربط حسابات النشر</a>. " +
          "يوتيوب يُرفع إلى قناتك المربوطة. تيك توك/إكس تُحفَظ في قائمة الإصدار حتى يُفعَّل الربط.";
      }
      var back = document.getElementById("staffBack");
      if (back && staff) {
        back.hidden = false;
        back.innerHTML = role === "admin"
          ? '<a class="gold" href="/admin">↩ عودة للوحة الأدمن</a>'
          : '<a class="gold" href="/manager">↩ عودة للوحة المدير</a>';
      }
    })
    .catch(function () {});
})();
