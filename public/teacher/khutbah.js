// Friday-sermon reel look: header, lower third, timed captions, scripture cards, outro.
// Composited in the browser with ffmpeg.wasm onto the speaker video. Workers cannot
// run ffmpeg or Remotion, so the studio keeps the picture locally and only sends audio
// to /api/teacher/transcribe.
(function () {
  "use strict";

  var C = function () { return globalThis.KhutbahCues; };

  function even(n) {
    n = Math.round(n);
    if (n < 2) return 2;
    return n % 2 === 0 ? n : n - 1;
  }

  function headerHeight(H) {
    return even(Math.min(Math.max(H * 0.2, 140), 400));
  }

  function lowerHeight(H, kind) {
    var tall = kind === "quran" || kind === "hadith";
    var ratio = tall ? 0.42 : 0.32;
    var cap = tall ? 780 : 560;
    return even(Math.min(H * ratio, cap));
  }

  function isVideoFile(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf("video/") === 0) return true;
    return /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name || "");
  }

  function font(ctx, px, family, weight) {
    ctx.font = (weight || "700") + " " + Math.max(12, Math.round(px)) + "px " + family;
  }

  function wrap(ctx, text, maxW) {
    var words = String(text || "").split(/\s+/).filter(Boolean);
    var lines = [];
    var line = "";
    for (var i = 0; i < words.length; i++) {
      var trial = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(trial).width > maxW && line) {
        lines.push(line);
        line = words[i];
      } else line = trial;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function starPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (var i = 0; i < 16; i++) {
      var a = (Math.PI / 8) * i - Math.PI / 2;
      var rad = i % 2 === 0 ? r : r * 0.56;
      var x = cx + Math.cos(a) * rad;
      var y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawGeoField(ctx, w, h, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#e7c16a";
    ctx.lineWidth = 1.2;
    var step = Math.max(54, Math.round(Math.min(w, h) / 8));
    for (var y = step / 2; y < h; y += step) {
      for (var x = step / 2; x < w; x += step) {
        starPath(ctx, x, y, step * 0.28);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLogoMark(ctx, img, cx, cy, size) {
    if (img && img.complete && img.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.clip();
      var lw = img.naturalWidth;
      var lh = img.naturalHeight;
      var sc = Math.max(size / lw, size / lh);
      var dw = lw * sc;
      var dh = lh * sc;
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.restore();
    } else {
      starPath(ctx, cx, cy, size / 2);
      ctx.fillStyle = "#0e3a28";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + size * 0.06, size * 0.16, Math.PI, 0);
      ctx.fillStyle = "#e7c16a";
      ctx.fill();
      ctx.fillRect(cx - size * 0.22, cy + size * 0.06, size * 0.44, size * 0.06);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(231,193,106,0.9)";
    ctx.lineWidth = Math.max(2, size * 0.045);
    ctx.stroke();
  }

  function goldLine(ctx, x1, x2, y, h) {
    var g = ctx.createLinearGradient(x1, 0, x2, 0);
    g.addColorStop(0, "rgba(231,193,106,0)");
    g.addColorStop(0.5, "rgba(231,193,106,0.95)");
    g.addColorStop(1, "rgba(231,193,106,0)");
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x1, x2), y - h / 2, Math.abs(x2 - x1), h);
  }

  function paintHeader(ctx, W, H, model) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(6,22,16,0.78)");
    g.addColorStop(0.62, "rgba(6,22,16,0.28)");
    g.addColorStop(1, "rgba(6,22,16,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    try { ctx.direction = "rtl"; } catch (e) { /* older canvases */ }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var u = H / 400;
    var kicker = "من خطبة الجمعة";
    font(ctx, 30 * u, "Tajawal, Amiri, sans-serif", "700");
    ctx.fillStyle = "#f4efe2";
    var ky = H * 0.2;
    ctx.fillText(kicker, W / 2, ky);
    var kw = ctx.measureText(kicker).width;
    goldLine(ctx, W / 2 - kw / 2 - 18 * u, W / 2 - kw / 2 - 90 * u, ky, Math.max(1, 2 * u));
    goldLine(ctx, W / 2 + kw / 2 + 18 * u, W / 2 + kw / 2 + 90 * u, ky, Math.max(1, 2 * u));

    var title = model.title || (model.placeholders ? "عنوان الخطبة" : "");
    if (title) {
      var titlePx = 68 * u;
      font(ctx, titlePx, "'Aref Ruqaa', Amiri, serif", "700");
      var lines = wrap(ctx, title, W * 0.72).slice(0, H < 220 ? 1 : 2);
      ctx.fillStyle = "#e7c16a";
      var lh = titlePx * 1.15;
      var block = lines.length * lh;
      var y0 = H * 0.48 - block / 2 + lh / 2;
      lines.forEach(function (line, i) { ctx.fillText(line, W / 2, y0 + i * lh); });
    }

    var speaker = model.speaker || (model.placeholders ? "اسم الملقي" : "");
    if (speaker) {
      font(ctx, 28 * u, "Tajawal, Amiri, sans-serif", "700");
      var tw = Math.min(W * 0.7, ctx.measureText(speaker).width + 48 * u);
      var ph = 46 * u;
      var py = H * 0.8;
      roundRect(ctx, (W - tw) / 2, py - ph / 2, tw, ph, ph / 2);
      ctx.fillStyle = "#0e3a28";
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, 2 * u);
      ctx.strokeStyle = "#e7c16a";
      ctx.stroke();
      ctx.fillStyle = "#f4dc92";
      ctx.fillText(speaker, W / 2, py);
    }

    drawLogoMark(ctx, model.logo, W - 78 * u, Math.min(H * 0.28, 78 * u), 96 * u);
  }

  function drawLowerPattern(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(6,24,16,0)");
    g.addColorStop(0.28, "rgba(6,24,16,0.45)");
    g.addColorStop(1, "rgba(4,18,12,0.94)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h * 0.38, w, h * 0.62);
    ctx.clip();
    drawGeoField(ctx, w, h, 0.35);
    ctx.restore();
  }

  function paintProgress(ctx, w, h, p) {
    var barH = Math.max(4, Math.round(h * 0.012));
    var y = h - barH - 2;
    ctx.fillStyle = "rgba(231,193,106,0.28)";
    ctx.fillRect(0, y, w, barH);
    ctx.fillStyle = "#e7c16a";
    var ratio = Math.max(0, Math.min(1, p || 0));
    ctx.fillRect(0, y, w * ratio, barH);
  }

  function iconGlyph(ctx, id, cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "#f4dc92";
    ctx.fillStyle = "#f4dc92";
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    var s = r * 0.85;
    if (id === "parents" || id === "people") {
      function person(x, scale) {
        ctx.beginPath();
        ctx.arc(x, -s * 0.28, s * 0.16 * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, s * 0.22, s * 0.28 * scale, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      person(-s * 0.22, 0.85);
      person(s * 0.22, 1);
    } else if (id === "kin") {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.45);
      ctx.lineTo(0, -s * 0.05);
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-s * 0.5, -s * 0.1, -s * 0.45, -s * 0.55, 0, -s * 0.15);
      ctx.bezierCurveTo(s * 0.45, -s * 0.55, s * 0.5, -s * 0.1, 0, 0);
      ctx.stroke();
    } else if (id === "mosque") {
      ctx.beginPath();
      ctx.arc(0, s * 0.05, s * 0.28, Math.PI, 0);
      ctx.lineTo(s * 0.28, s * 0.4);
      ctx.lineTo(-s * 0.28, s * 0.4);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.28);
      ctx.lineTo(0, -s * 0.48);
      ctx.stroke();
    } else if (id === "prayer") {
      ctx.beginPath();
      ctx.arc(s * 0.08, 0, s * 0.32, Math.PI * 0.7, Math.PI * 1.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-s * 0.02, -s * 0.02, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "knowledge") {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.05);
      ctx.bezierCurveTo(-s * 0.15, -s * 0.28, -s * 0.45, -s * 0.28, -s * 0.45, -s * 0.02);
      ctx.lineTo(-s * 0.45, s * 0.32);
      ctx.bezierCurveTo(-s * 0.3, s * 0.16, -s * 0.12, s * 0.18, 0, s * 0.32);
      ctx.bezierCurveTo(s * 0.12, s * 0.18, s * 0.3, s * 0.16, s * 0.45, s * 0.32);
      ctx.lineTo(s * 0.45, -s * 0.02);
      ctx.bezierCurveTo(s * 0.45, -s * 0.28, s * 0.15, -s * 0.28, 0, -s * 0.05);
      ctx.stroke();
    } else if (id === "zakat" || id === "benefit") {
      ctx.beginPath();
      ctx.arc(0, s * 0.12, s * 0.28, Math.PI, 0);
      ctx.quadraticCurveTo(s * 0.32, s * 0.2, 0, s * 0.48);
      ctx.quadraticCurveTo(-s * 0.32, s * 0.2, -s * 0.28, s * 0.12);
      ctx.stroke();
    } else {
      starPath(ctx, 0, 0, s * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawKeyword(ctx, keyword, cx, cy, r) {
    starPath(ctx, cx, cy, r);
    ctx.fillStyle = "#0e3a28";
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.strokeStyle = "#e7c16a";
    ctx.stroke();
    iconGlyph(ctx, keyword.id, cx, cy, r * 0.62);
    var label = keyword.label || "";
    if (!label) return;
    font(ctx, r * 0.34, "Tajawal, Amiri, sans-serif", "700");
    var tw = ctx.measureText(label).width + r * 0.4;
    var th = r * 0.42;
    var y = cy + r + th * 0.15;
    roundRect(ctx, cx - tw / 2, y, tw, th, th / 2);
    ctx.fillStyle = "#0e3a28";
    ctx.fill();
    ctx.strokeStyle = "rgba(231,193,106,0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#f4efe2";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, y + th / 2);
  }

  function boxOrnaments(ctx, x, y, w, h) {
    ctx.fillStyle = "#e7c16a";
    var s = Math.max(4, Math.min(w, h) * 0.035);
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(function (p) {
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    });
  }

  function paintCaptionBox(ctx, W, H, model, cue) {
    var text = (cue && (cue.display || cue.text)) || "";
    var u = W / 1080;
    var boxW = W * 0.86;
    var boxH = Math.min(H * 0.42, 210 * u);
    var x = (W - boxW) / 2;
    var y = H * 0.48;
    if (model.title) {
      font(ctx, 26 * u, "Tajawal, Amiri, sans-serif", "700");
      var chip = model.title;
      var cw = Math.min(boxW * 0.8, ctx.measureText(chip).width + 36 * u);
      var ch = 40 * u;
      var cy = y - ch * 0.35;
      roundRect(ctx, (W - cw) / 2, cy - ch / 2, cw, ch, 10 * u);
      ctx.fillStyle = "#0e3a28";
      ctx.fill();
      ctx.strokeStyle = "#e7c16a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#f4efe2";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(chip, W / 2, cy);
    }
    roundRect(ctx, x, y, boxW, boxH, 18 * u);
    ctx.fillStyle = "rgba(10,48,34,0.94)";
    ctx.fill();
    ctx.lineWidth = Math.max(2, 3 * u);
    ctx.strokeStyle = "#d4b15a";
    ctx.stroke();
    boxOrnaments(ctx, x, y, boxW, boxH);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var one = text.split(/\s+/).length <= 2;
    var px = one ? 72 * u : 46 * u;
    font(ctx, px, "'Aref Ruqaa', Amiri, serif", "700");
    var lines = wrap(ctx, text, boxW * 0.86).slice(0, 2);
    ctx.fillStyle = "#f4dc92";
    var lh = px * 1.2;
    var y0 = y + boxH / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach(function (line, i) { ctx.fillText(line, W / 2, y0 + i * lh); });
  }

  function paintScriptureCard(ctx, W, H, model, cue) {
    var u = Math.min(W, H) / 1080;
    var text = (cue && (cue.display || cue.text)) || "";
    var quran = cue && cue.kind === "quran";
    var boxW = W * 0.84;
    var boxH = Math.min(H * 0.34, 460 * u);
    var x = (W - boxW) / 2;
    var y = H * 0.34;
    if (model.title && !quran) {
      font(ctx, 24 * u, "Tajawal, sans-serif", "700");
    }
    roundRect(ctx, x, y, boxW, boxH, 16 * u);
    ctx.fillStyle = quran ? "#f7f1e2" : "rgba(8,46,32,0.96)";
    ctx.fill();
    ctx.lineWidth = Math.max(2, 3 * u);
    ctx.strokeStyle = "#c6a15a";
    ctx.stroke();
    boxOrnaments(ctx, x, y, boxW, boxH);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var head = quran ? (model.title || "القرآن") : "قال رسول الله ﷺ";
    font(ctx, 26 * u, "Tajawal, Amiri, sans-serif", "700");
    var hw = Math.min(boxW * 0.7, ctx.measureText(head).width + 40 * u);
    var hh = 42 * u;
    roundRect(ctx, (W - hw) / 2, y - hh / 2, hw, hh, hh / 2);
    ctx.fillStyle = quran ? "#123d2c" : "#0e3a28";
    ctx.fill();
    ctx.strokeStyle = "#e7c16a";
    ctx.stroke();
    ctx.fillStyle = "#f4efe2";
    ctx.fillText(head, W / 2, y);
    var family = quran ? "'Scheherazade New', Amiri, serif" : "'Aref Ruqaa', Amiri, serif";
    var px = quran ? 54 * u : 42 * u;
    font(ctx, px, family, "700");
    var lines = wrap(ctx, text, boxW * 0.84).slice(0, 3);
    ctx.fillStyle = quran ? "#1d4a32" : "#f4dc92";
    var lh = px * 1.35;
    var y0 = y + boxH * 0.48 - ((lines.length - 1) * lh) / 2;
    lines.forEach(function (line, i) { ctx.fillText(line, W / 2, y0 + i * lh); });
    if (cue && cue.cite) {
      font(ctx, 24 * u, "Tajawal, Amiri, sans-serif", "500");
      ctx.fillStyle = quran ? "#6d5a32" : "#f3eeda";
      ctx.fillText(cue.cite, W / 2, y + boxH - 36 * u);
    }
  }

  function paintKeywords(ctx, W, H, keywords) {
    if (!keywords || !keywords.length || H < 220) return;
    var r = Math.min(W, H) * 0.075;
    var gap = r * 3.1;
    var n = Math.min(2, keywords.length);
    var cx0 = W / 2 - ((n - 1) * gap) / 2;
    var cy = H * 0.2;
    for (var i = 0; i < n; i++) drawKeyword(ctx, keywords[i], cx0 + i * gap, cy, r);
  }

  function paintStrip(ctx, W, H, model, cue, progress) {
    drawLowerPattern(ctx, W, H);
    try { ctx.direction = "rtl"; } catch (e) { /* ignore */ }
    if (cue && cue.keywords) paintKeywords(ctx, W, H, cue.keywords);
    if (cue && (cue.kind === "quran" || cue.kind === "hadith")) paintScriptureCard(ctx, W, H, model, cue);
    else if (cue && (cue.display || cue.text)) paintCaptionBox(ctx, W, H, model, cue);
    paintProgress(ctx, W, H, progress);
  }

  function paintScriptureFrame(ctx, W, H, model, cue, progress) {
    var top = headerHeight(H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, H - top);
    ctx.clip();
    ctx.fillStyle = "rgba(5,18,12,0.72)";
    ctx.fillRect(0, top, W, H - top);
    drawGeoField(ctx, W, H, 0.18);
    ctx.restore();
    try { ctx.direction = "rtl"; } catch (e) { /* ignore */ }
    paintScriptureCard(ctx, W, H, model, cue);
    paintProgress(ctx, W, H, progress);
  }

  function paintOutro(ctx, W, H, model) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0d3a28");
    g.addColorStop(1, "#071910");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawGeoField(ctx, W, H, 0.28);
    try { ctx.direction = "rtl"; } catch (e) { /* ignore */ }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var u = Math.min(W / 1080, H / 1080);
    drawLogoMark(ctx, model.logo, W / 2, H * 0.34, 180 * u);
    var mosque = model.mosque || "";
    font(ctx, 32 * u, "Tajawal, Amiri, sans-serif", "700");
    ctx.fillStyle = "#f4efe2";
    ctx.fillText(mosque ? "مسجد" : "قناة", W / 2, H * 0.5);
    var name = mosque || "رياض المتقين";
    font(ctx, 64 * u, "'Aref Ruqaa', Amiri, serif", "700");
    var lines = wrap(ctx, name, W * 0.8).slice(0, 2);
    ctx.fillStyle = "#e7c16a";
    var lh = 74 * u;
    lines.forEach(function (line, i) {
      ctx.fillText(line, W / 2, H * 0.58 + i * lh);
    });
    var ly = H * 0.58 + lines.length * lh;
    goldLine(ctx, W * 0.28, W * 0.72, ly, Math.max(2, 3 * u));
    font(ctx, 26 * u, "Tajawal, sans-serif", "500");
    ctx.fillStyle = "#f4efe2";
    ctx.fillText("riyadalmutaqin.com", W / 2, ly + 40 * u);
  }

  function progressAt(model, t) {
    var dur = model.duration || 0;
    if (!dur) return 0;
    return Math.max(0, Math.min(1, t / dur));
  }

  function paintFrame(ctx, W, H, model, t, opts) {
    opts = opts || {};
    ctx.clearRect(0, 0, W, H);
    if (opts.backdrop) {
      ctx.fillStyle = "#10281c";
      ctx.fillRect(0, 0, W, H);
      drawGeoField(ctx, W, H, 0.16);
    }
    var dur = model.duration || 0;
    var tRel = Math.max(0, t || 0);
    var outroAt = C().outroStart(dur);
    if (outroAt != null && tRel >= outroAt) {
      paintOutro(ctx, W, H, model);
      return;
    }
    var win = dur ? C().windowAt(model.cues || [], tRel, dur) : null;
    var cue = win ? win.cue : null;
    if (!cue && model.placeholders && !(model.cues && model.cues.length)) {
      cue = { kind: "caption", display: "النص المتزامن يظهر هنا", text: "", keywords: [], cite: "" };
    }
    var p = progressAt(model, tRel);
    if (cue && (cue.kind === "quran" || cue.kind === "hadith")) {
      paintScriptureFrame(ctx, W, H, model, cue, p);
    } else {
      var sh = lowerHeight(H, "caption");
      ctx.save();
      ctx.translate(0, H - sh);
      paintStrip(ctx, W, sh, model, cue, p);
      ctx.restore();
    }
    var hh = headerHeight(H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, hh);
    ctx.clip();
    paintHeader(ctx, W, hh, model);
    ctx.restore();
  }

  function canvasBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("تعذّر رسم طبقة القالب"));
      }, "image/png");
    });
  }

  function renderCanvas(w, h, draw) {
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext("2d"));
    return canvasBlob(canvas);
  }

  function copyBytes(data) {
    var src = data instanceof Uint8Array ? data : new Uint8Array(data);
    var out = new Uint8Array(src.byteLength);
    out.set(src);
    return out;
  }

  async function writePng(ff, FU, name, blob) {
    await ff.writeFile(name, await FU.fetchFile(blob));
  }

  async function extractAudio(ff, FU, inName, start, dur) {
    if (dur > 180) {
      throw new Error("التفريغ الآلي يدعم حتى ٣ دقائق. قصّ المقطع من حقلي البداية والنهاية، أو أضف العبارات بوقتها.");
    }
    var base = [];
    if (start > 0.01) base.push("-ss", start.toFixed(3));
    if (dur > 0) base.push("-t", dur.toFixed(3));
    base.push("-i", inName, "-vn", "-ac", "1", "-ar", "16000");
    var mp3 = base.concat(["-c:a", "libmp3lame", "-b:a", "48k", "kh_audio.mp3"]);
    var code = await ff.exec(mp3);
    var name = "kh_audio.mp3";
    var mime = "audio/mpeg";
    if (code !== 0 && code != null) {
      try { await ff.deleteFile("kh_audio.mp3"); } catch (e) { /* absent */ }
      name = "kh_audio.wav";
      mime = "audio/wav";
      code = await ff.exec(base.concat(["-c:a", "pcm_s16le", name]));
    }
    if (code !== 0 && code != null) throw new Error("تعذّر استخراج الصوت من المقطع");
    var data = copyBytes(await ff.readFile(name));
    try { await ff.deleteFile(name); } catch (e) { /* ignore */ }
    if (!data.byteLength) throw new Error("الصوت المستخرج فارغ");
    if (data.byteLength > 6 * 1024 * 1024) {
      throw new Error("ملف الصوت أكبر من حد التفريغ. قصّ مقطعاً أقصر.");
    }
    return { bytes: data, mime: mime, filename: name === "kh_audio.wav" ? "khutbah.wav" : "khutbah.mp3" };
  }

  function layerPlan(model, W, H) {
    var dur = model.duration || 0;
    var outroAt = C().outroStart(dur);
    var windows = C().displayWindows(model.cues || [], dur || 1, outroAt);
    if (windows.length > 24) windows = windows.slice(0, 24);
    var layers = [{ name: "kh_header.png", x: 0, y: 0, kind: "header" }];
    windows.forEach(function (win, i) {
      var scripture = win.cue.kind === "quran" || win.cue.kind === "hadith";
      var sh = scripture ? H : lowerHeight(H, "caption");
      layers.push({
        name: "kh_c" + i + ".png",
        x: 0,
        y: scripture ? 0 : H - sh,
        start: win.start,
        end: win.end,
        kind: scripture ? "scripture" : "strip",
        cue: win.cue,
        h: sh,
      });
    });
    if (outroAt != null) {
      layers.push({ name: "kh_outro.png", x: 0, y: 0, start: outroAt, end: null, kind: "outro" });
    }
    return { layers: layers, outroAt: outroAt, dropped: (model.cues || []).length > windows.length };
  }

  async function renderReel(opts) {
    var ff = opts.ff;
    var FU = opts.FU;
    var W = even(opts.w);
    var H = even(opts.h);
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* draw with fallbacks */ }
    }
    var model = {
      title: opts.title || "",
      speaker: opts.speaker || "",
      mosque: opts.mosque || "",
      logo: opts.logo || null,
      duration: opts.duration || 0,
      cues: opts.cues || [],
      placeholders: false,
    };
    var plan = layerPlan(model, W, H);
    var progressOf = function (layer) {
      if (!model.duration || layer.start == null) return 0;
      return Math.max(0, Math.min(1, layer.start / model.duration));
    };
    var names = [];
    for (var i = 0; i < plan.layers.length; i++) {
      var layer = plan.layers[i];
      var blob;
      if (layer.kind === "header") {
        var hh = headerHeight(H);
        blob = await renderCanvas(W, hh, function (ctx) { paintHeader(ctx, W, hh, model); });
      } else if (layer.kind === "outro") {
        blob = await renderCanvas(W, H, function (ctx) { paintOutro(ctx, W, H, model); });
      } else if (layer.kind === "scripture") {
        blob = await renderCanvas(W, H, function (ctx) {
          paintScriptureFrame(ctx, W, H, model, layer.cue, progressOf(layer));
        });
      } else {
        blob = await renderCanvas(W, layer.h, function (ctx) {
          paintStrip(ctx, W, layer.h, model, layer.cue, progressOf(layer));
        });
      }
      await writePng(ff, FU, layer.name, blob);
      names.push(layer.name);
    }
    var graph = C().buildFilter({
      w: W,
      h: H,
      formatAuto: opts.formatAuto !== false,
      layers: plan.layers.map(function (layer) {
        return { x: layer.x, y: layer.y, start: layer.start, end: layer.end };
      }),
    });
    var args = [];
    if (opts.start > 0.01) args.push("-ss", Number(opts.start).toFixed(3));
    if (opts.duration > 0) args.push("-t", Number(opts.duration).toFixed(3));
    args.push("-i", opts.inName);
    names.forEach(function (name) { args.push("-loop", "1", "-i", name); });
    args.push(
      "-filter_complex", graph,
      "-map", "[vout]",
      "-map", "0:a:0",
      "-c:v", "libx264", "-profile:v", "baseline", "-level", "4.0",
      "-preset", "veryfast", "-crf", "22",
      "-pix_fmt", "yuv420p", "-r", "25", "-g", "50",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100",
      "-shortest", "-movflags", "+faststart",
      "kh_out.mp4",
    );
    var code = await ff.exec(args);
    if (code !== 0 && code != null && opts.formatAuto !== false) {
      try { await ff.deleteFile("kh_out.mp4"); } catch (e) { /* retry without format=auto */ }
      var retryArgs = args.slice();
      var fi = retryArgs.indexOf("-filter_complex");
      retryArgs[fi + 1] = C().buildFilter({
        w: W,
        h: H,
        formatAuto: false,
        layers: plan.layers.map(function (layer) {
          return { x: layer.x, y: layer.y, start: layer.start, end: layer.end };
        }),
      });
      code = await ff.exec(retryArgs);
    }
    var data = null;
    var encodeError = null;
    try {
      if (code !== 0 && code != null) encodeError = new Error("فشل ترميز ريل الخطبة (رمز " + code + ")");
      else data = copyBytes(await ff.readFile("kh_out.mp4"));
    } finally {
      var all = names.concat(["kh_out.mp4"]);
      for (var n = 0; n < all.length; n++) {
        try { await ff.deleteFile(all[n]); } catch (e) { /* already gone */ }
      }
    }
    if (encodeError) throw encodeError;
    if (!data || !data.byteLength) throw new Error("الملف الناتج فارغ");
    return new Blob([data], { type: "video/mp4" });
  }

  globalThis.Khutbah = {
    isVideoFile: isVideoFile,
    headerHeight: headerHeight,
    lowerHeight: lowerHeight,
    paintFrame: paintFrame,
    extractAudio: extractAudio,
    renderReel: renderReel,
  };
})();
