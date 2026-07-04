// استوديو رياض المتقين: تصميم بطاقة موحّد (شعار + لقب القناة + اسم الملقي + عنوان + موجة + إطار)
// يُنتج صوراً (PNG) أو فيديو (صوت + نفس الخلفية) بعدّة مقاسات — داخل المتصفّح عبر ffmpeg.wasm.
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var BASE = "/vendor/ffmpeg/";
  var FFmpeg = (window.FFmpegWASM || {}).FFmpeg;
  var FU = window.FFmpegUtil || {};

  var FORMATS = [
    { key: "square", label: "مربّع 1:1",  w: 1080, h: 1080, chips: "إنستغرام · فيسبوك · تيليجرام · X" },
    { key: "story",  label: "ستوري 9:16", w: 1080, h: 1920, chips: "تيك توك · ريلز · شورتس · ستوري" },
    { key: "wide",   label: "أفقي 16:9",  w: 1920, h: 1080, chips: "يوتيوب · فيديو" },
  ];

  var ff = null, loadPromise = null, busy = false, results = [], chosenFile = null;

  var logo = new Image(); var logoReady = false;
  logo.onload = function () { logoReady = true; drawPreview(); };
  logo.src = "/assets/logo.png";

  // ===== أدوات =====
  function setStatus(m) { $("status").textContent = m || ""; }
  function setBar(p) { $("bar").style.width = Math.max(0, Math.min(100, p)) + "%"; }
  function human(b) { if (b == null) return ""; var u = ["B","KB","MB","GB"], i = 0, n = b; while (n >= 1024 && i < 3) { n /= 1024; i++; } return (Math.round(n*10)/10) + " " + u[i]; }
  function selectedFormats() { return FORMATS.filter(function (f) { var b = $("fmt_" + f.key); return b && b.checked; }); }
  function val(id) { var e = $(id); return e ? (e.value || "").trim() : ""; }

  function fields() {
    var hon = val("hon");
    var nm = val("name");
    var nameLine = (hon ? hon + " " : "") + nm;
    return { name: nameLine.trim(), topic: val("topic"), audio: $("audioTgl") && $("audioTgl").checked };
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
    var fmt = selectedFormats()[0] || FORMATS[0];
    if (c.width !== fmt.w || c.height !== fmt.h) { c.width = fmt.w; c.height = fmt.h; }
    paint(c.getContext("2d"), fmt.w, fmt.h);
    var lbl = $("previewLbl"); if (lbl) lbl.textContent = "معاينة: " + fmt.label;
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
  $("file").addEventListener("change", function (e) {
    chosenFile = (e.target.files && e.target.files[0]) || null;
    $("fileInfo").textContent = chosenFile ? ("المُختار: " + chosenFile.name + " (" + human(chosenFile.size) + ")") : "";
  });

  $("genBtn").addEventListener("click", function () {
    if (busy) return;
    var fmts = selectedFormats();
    if (!fmts.length) { setStatus("اختر مقاساً واحداً على الأقلّ."); return; }
    if (!chosenFile) { setStatus("ارفع ملفاً صوتيّاً/فيديو أوّلاً."); return; }
    runVideo(fmts);
  });

  function startRun() { busy = true; results = []; setBar(0); $("downloadWrap").innerHTML = ""; $("publishPanel").hidden = true; }
  function endRun() { busy = false; }

  function runVideo(fmts) {
    startRun();
    var inName = "in_" + Date.now() + "_" + chosenFile.name.replace(/[^\w.\-]+/g, "_");
    loadEngine()
      .then(function () { setStatus("جارٍ قراءة الملف…"); return FU.fetchFile(chosenFile).then(function (d) { return ff.writeFile(inName, d); }); })
      .then(function () {
        var chain = Promise.resolve();
        fmts.forEach(function (fmt, i) {
          chain = chain.then(function () {
            setStatus("جارٍ إنتاج: " + fmt.label + " (" + (i + 1) + "/" + fmts.length + ")"); setBar(0);
            return paintToBlob(fmt)
              .then(function (bg) { return FU.fetchFile(bg).then(function (d) { return ff.writeFile("bg.png", d); }); })
              .then(function () {
                return ff.exec(["-loop","1","-framerate","2","-i","bg.png","-i",inName,
                  "-map","0:v","-map","1:a","-c:v","libx264","-tune","stillimage","-preset","veryfast",
                  "-pix_fmt","yuv420p","-r","2","-g","20","-c:a","aac","-b:a","128k","-shortest","-movflags","+faststart","out.mp4"]);
              })
              .then(function () { return ff.readFile("out.mp4"); })
              .then(function (data) {
                var blob = new Blob([data], { type: "video/mp4" });
                results.push({ fmt: fmt, blob: blob, url: URL.createObjectURL(blob), type: "video" });
                try { ff.deleteFile("out.mp4"); } catch (e) {}
              });
          });
        });
        return chain;
      })
      .then(function () { try { ff.deleteFile(inName); ff.deleteFile("bg.png"); } catch (e) {} setStatus("اكتمل ✓ — " + results.length + " صيغة."); setBar(100); showResults(); })
      .catch(function (err) { setStatus("تعذّر: " + (err.message || err)); setBar(0); })
      .then(endRun);
  }

  function showResults() {
    var wrapEl = $("downloadWrap"); wrapEl.innerHTML = "";
    results.forEach(function (r) {
      var blk = document.createElement("div");
      blk.style.cssText = "margin-bottom:1.2rem;padding-bottom:1.2rem;border-bottom:1px solid var(--border)";
      var head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:.6rem";
      var tag = document.createElement("span"); tag.className = "badge"; tag.textContent = r.fmt.label + " · " + r.fmt.chips;
      var a = document.createElement("a");
      a.href = r.url; a.download = "riyad-" + r.fmt.key + ".mp4";
      a.className = "btn btn-primary"; a.style.cssText = "padding:.4rem 1rem;font-size:.9rem";
      a.textContent = "⤓ تنزيل (" + human(r.blob.size) + ")";
      head.appendChild(tag); head.appendChild(a);
      blk.appendChild(head);
      var v = document.createElement("video"); v.src = r.url; v.controls = true;
      var vert = r.fmt.h > r.fmt.w;
      v.style.cssText = "border-radius:12px;background:#000;display:block;" + (vert ? "max-height:420px;width:auto;margin-inline:auto" : "width:100%");
      blk.appendChild(v);
      wrapEl.appendChild(blk);
      try { a.click(); } catch (e) {}
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

    // للموقع: نختار صيغة فيديو أفقيّة إن وُجدت. للقنوات: أفضل ناتج (فيديو وإلا صورة).
    var siteVid = results.filter(function (r) { return r.type === "video" && r.fmt.key === "wide"; })[0] || results.filter(function (r) { return r.type === "video"; })[0];
    var media = results.filter(function (r) { return r.fmt.key === "wide"; })[0] || results[0];

    $("pubBtn").disabled = true; pubShow("جارٍ الرفع والنشر…");
    var jobs = [];
    if (toSite && siteVid) {
      jobs.push(uploadMedia(siteVid.blob, true).then(function (url) {
        return fetch("/api/teacher/clips", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: f.topic || f.name, doctor_name: f.name, video_url: url }) })
          .then(function (r) { return r.json(); }).then(function (d) { return { name: "الموقع", ok: !!d.ok, error: d.error }; });
      }).catch(function () { return { name: "الموقع", ok: false }; }));
    }
    if (channels.length) {
      jobs.push(uploadMedia(media.blob, media.type === "video").then(function (url) {
        return fetch("/api/teacher/posts", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: title, media_url: url, channels: channels, action: "now" }) })
          .then(function (r) { return r.json(); }).then(function (d) {
            var tg = (d.delivered || []).filter(function (x) { return x.channel === "telegram"; })[0];
            return { name: "القنوات", ok: !!d.ok, tg: tg, error: d.error };
          });
      }).catch(function () { return { name: "القنوات", ok: false }; }));
    }
    Promise.all(jobs).then(function (rs) {
      var msgs = rs.map(function (r) {
        if (r.name === "الموقع") return r.ok ? "الموقع ✓" : "الموقع ✗ " + (r.error || "");
        var p = []; if (r.tg && r.tg.ok) p.push("تيليجرام ✓"); else if (r.tg) p.push("تيليجرام ✗");
        p.push(r.ok ? "حُفِظ للقنوات" : "تعذّر"); return p.join(" — ");
      });
      pubShow(msgs.join("  •  ") + "  (نُشِر ناتج واحد؛ بقيّة المقاسات نزّلها وانشرها يدويّاً)");
    }).catch(function (e) { pubShow(e.message || "تعذّر النشر."); }).then(function () { $("pubBtn").disabled = false; });
  });

  // ===== ربط الأحداث =====
  ["hon", "name", "topic"].forEach(function (id) { var e = $(id); if (e) e.addEventListener("input", drawPreview); });
  var at = $("audioTgl"); if (at) at.addEventListener("change", drawPreview);
  FORMATS.forEach(function (f) { var b = $("fmt_" + f.key); if (b) b.addEventListener("change", drawPreview); });

  drawPreview();
})();
