// Phrase cues, scripture/keyword hints, and ffmpeg overlay graph for the Friday sermon reel.
// Timings always come from a transcriber or from times the manager typed. This file never
// spreads a transcript evenly across a clip.
(function (root) {
  "use strict";

  var MAX_CHUNKS = 18;

  var KEYWORDS = [
    { id: "parents", label: "الوالدين", terms: ["الوالدين", "والديك", "والديه", "بر الوالدين"] },
    { id: "kin", label: "الأرحام", terms: ["الارحام", "ارحام", "صلة الرحم", "ذوي القربي"] },
    { id: "good", label: "افعلوا الخير", terms: ["افعلوا الخير"] },
    { id: "good", label: "الخير", terms: ["الخير"], shortOnly: true },
    { id: "benefit", label: "نفع الناس", terms: ["نفع", "انفعهم"], shortOnly: true },
    { id: "people", label: "الناس", terms: ["الناس"], shortOnly: true },
    { id: "prayer", label: "الصلاة", terms: ["الصلاة", "الصلاه"] },
    { id: "zakat", label: "الزكاة", terms: ["الزكاة", "الزكاه"] },
    { id: "mosque", label: "المسجد", terms: ["المسجد", "المساجد"] },
    { id: "knowledge", label: "العلم", terms: ["العلم", "طلب العلم"] },
  ];

  // Small starter dictionary — not a Quran/Hadith search. Follow-up: a sourced corpus.
  var AYAHS = [
    { phrase: "وافعلوا الخير", display: "وَافْعَلُوا الْخَيْرَ", cite: "سورة الحج : ٧٧" },
    { phrase: "وقل رب ارحمهما", display: "وَقُل رَّبِّ ارْحَمْهُمَا", cite: "سورة الإسراء : ٢٤" },
    { phrase: "وبالوالدين احسانا", display: "وَبِالْوَالِدَيْنِ إِحْسَانًا", cite: "سورة الإسراء : ٢٣" },
    { phrase: "ان الله يامر بالعدل والاحسان", display: "إِنَّ اللَّهَ يَأْمُرُ بِالْعَدْلِ وَالْإِحْسَانِ", cite: "سورة النحل : ٩٠" },
    { phrase: "وتعاونوا على البر والتقوى", display: "وَتَعَاوَنُوا عَلَى الْبِرِّ وَالتَّقْوَى", cite: "سورة المائدة : ٢" },
  ];

  var HADITHS = [
    {
      phrase: "انفعهم للناس",
      display: "أَحَبُّ النَّاسِ إِلَى اللَّهِ أَنْفَعُهُمْ لِلنَّاسِ",
      cite: "رواه الطبراني في الأوسط · وحسنه الألباني",
    },
    {
      phrase: "احب الناس الى الله",
      display: "أَحَبُّ النَّاسِ إِلَى اللَّهِ أَنْفَعُهُمْ لِلنَّاسِ",
      cite: "رواه الطبراني في الأوسط · وحسنه الألباني",
    },
  ];

  var HADITH_HINTS = ["قال رسول الله", "قال النبي", "سمعت رسول الله", "ان رسول الله"];

  function normalize(input) {
    return String(input || "")
      .replace(/[\u064B-\u0652\u0670\u0640\u06D6-\u06ED]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\u0621-\u063A\u0641-\u064A0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasTerm(normalized, term) {
    var n = normalize(term);
    if (!n) return false;
    return (" " + normalized + " ").indexOf(" " + n + " ") !== -1;
  }

  function round3(n) {
    return Math.round(n * 1000) / 1000;
  }

  function cleanWords(words) {
    var clean = [];
    for (var i = 0; i < (words || []).length; i++) {
      var w = words[i] || {};
      var text = String(w.word || w.text || "").replace(/\s+/g, " ").trim();
      var start = Number(w.start);
      var end = Number(w.end);
      if (!text || !isFinite(start) || !isFinite(end)) continue;
      if (end < start) end = start;
      clean.push({ word: text, start: start, end: end });
    }
    clean.sort(function (a, b) { return a.start - b.start; });
    return clean;
  }

  function chunkWords(words, maxChunks) {
    var limit = maxChunks || MAX_CHUNKS;
    var clean = cleanWords(words);
    if (!clean.length) return [];
    if (clean.length <= limit) {
      return clean.map(function (w) {
        return { words: [w], start: w.start, end: Math.max(w.end, w.start) };
      });
    }
    var size = Math.ceil(clean.length / limit);
    var groups = [];
    for (var i = 0; i < clean.length; i += size) {
      var slice = clean.slice(i, Math.min(clean.length, i + size));
      groups.push({
        words: slice,
        start: slice[0].start,
        end: slice[slice.length - 1].end,
      });
    }
    for (var g = 0; g < groups.length; g++) {
      if (g < groups.length - 1 && groups[g].end > groups[g + 1].start) {
        groups[g].end = groups[g + 1].start;
      }
    }
    return groups;
  }

  function detect(text) {
    var n = normalize(text);
    var tokens = n ? n.split(" ").length : 0;
    var keywords = [];
    for (var i = 0; i < KEYWORDS.length; i++) {
      var k = KEYWORDS[i];
      if (k.shortOnly && tokens > 5) continue;
      if (keywords.some(function (item) { return item.id === k.id; })) continue;
      for (var t = 0; t < k.terms.length; t++) {
        if (hasTerm(n, k.terms[t])) {
          keywords.push({ id: k.id, label: k.label });
          break;
        }
      }
      if (keywords.length === 2) break;
    }
    var ayah = null;
    for (var a = 0; a < AYAHS.length; a++) {
      if (hasTerm(n, AYAHS[a].phrase) || n.indexOf(normalize(AYAHS[a].phrase)) !== -1) {
        ayah = AYAHS[a];
        break;
      }
    }
    var hadith = null;
    if (!ayah) {
      for (var h = 0; h < HADITHS.length; h++) {
        if (n.indexOf(normalize(HADITHS[h].phrase)) !== -1) {
          hadith = HADITHS[h];
          break;
        }
      }
    }
    var hint = !ayah && !hadith && HADITH_HINTS.some(function (phrase) {
      return n.indexOf(normalize(phrase)) !== -1;
    });
    var kind = ayah ? "quran" : (hadith || hint) ? "hadith" : "caption";
    return {
      kind: kind,
      keywords: keywords,
      cite: ayah ? ayah.cite : hadith ? hadith.cite : hint ? "قال رسول الله ﷺ" : "",
      display: ayah ? ayah.display : hadith ? hadith.display : String(text || "").trim(),
    };
  }

  function refreshCue(cue) {
    if (!cue || cue.manual) return cue;
    var hit = detect(cue.text);
    cue.kind = hit.kind;
    cue.cite = hit.cite;
    cue.keywords = hit.keywords;
    cue.display = hit.display || cue.text;
    return cue;
  }

  function cueFromText(text, start, end, manual) {
    var cue = {
      start: round3(start),
      end: round3(end),
      text: String(text || "").trim(),
      manual: !!manual,
      userAdded: !!manual,
    };
    return manual ? Object.assign(cue, {
      kind: "caption",
      cite: "",
      keywords: detect(cue.text).keywords,
      display: cue.text,
    }) : refreshCue(cue);
  }

  function linkNeighbors(cues) {
  for (var i = 1; i < cues.length; i++) {
    if (cues[i].manual || cues[i - 1].manual) continue;
    if (cues[i].start - cues[i - 1].end > 1.2) continue;
    var hit = detect(cues[i - 1].text + " " + cues[i].text);
    if (hit.kind === "caption") continue;
    cues[i].kind = hit.kind;
    cues[i].display = hit.display;
    cues[i].cite = hit.cite;
    cues[i].keywords = hit.keywords;
  }
  return cues;
}

function buildCues(words) {
  var cues = chunkWords(words).map(function (group) {
    var text = group.words.map(function (w) { return w.word; }).join(" ").replace(/\s+/g, " ").trim();
    return cueFromText(text, group.start, Math.max(group.end, group.start), false);
  }).filter(function (cue) { return cue.text && cue.end >= cue.start; });
  return linkNeighbors(cues);
}

  function addPhrase(cues, phrase) {
    var start = Number(phrase && phrase.start);
    var end = Number(phrase && phrase.end);
    var text = String((phrase && phrase.text) || "").trim();
    if (!text || !isFinite(start) || !isFinite(end) || end <= start) return cues || [];
    var next = (cues || []).concat([cueFromText(text, start, end, true)]);
    next.sort(function (a, b) { return a.start - b.start; });
    return next;
  }

  function applyManual(cues, manual) {
    var list = (cues || []).slice();
    if (!manual || !String(manual.text || "").trim()) return list;
    var start = Number(manual.at);
    var end = Number(manual.end);
    var text = String(manual.text).trim();
    if (!isFinite(start) || !isFinite(end) || end <= start) return list;
    var type = manual.type === "hadith" ? "hadith" : "quran";
    var hit = false;
    list = list.map(function (cue) {
      if (start < cue.end && end > cue.start) {
        hit = true;
        return {
          start: cue.start,
          end: cue.end,
          text: cue.text,
          display: text,
          manual: true,
          userAdded: cue.userAdded,
          kind: type,
          cite: String(manual.cite || "").trim(),
          keywords: [],
        };
      }
      return cue;
    });
    if (!hit) {
      list.push({
        start: round3(start),
        end: round3(end),
        text: text,
        display: text,
        manual: true,
        userAdded: true,
        kind: type,
        cite: String(manual.cite || "").trim(),
        keywords: [],
      });
      list.sort(function (a, b) { return a.start - b.start; });
    }
    return list;
  }

  function outroLength(dur) {
    if (!isFinite(dur) || dur < 5) return 0;
    if (dur < 12) return 2;
    return 3;
  }

  function outroStart(dur) {
    var len = outroLength(dur);
    if (!len) return null;
    return round3(Math.max(0, dur - len));
  }

  // Hold each phrase on screen until the next one so the lower third does not flicker.
  // The stored cue start/end stay the spoken times.
  function displayWindows(cues, dur, outroAt) {
    var limit = outroAt == null ? dur : outroAt;
    if (!isFinite(limit) || limit <= 0) limit = Infinity;
    var list = (cues || []).filter(function (cue) {
      return isFinite(cue.start) && cue.start < limit;
    }).slice().sort(function (a, b) { return a.start - b.start; });
    return list.map(function (cue, i) {
      var next = list[i + 1];
      var end = next ? next.start : (isFinite(limit) ? limit : cue.end);
      if (end < cue.end) end = cue.end;
      if (isFinite(limit) && end > limit) end = limit;
      if (end < cue.start) end = cue.start;
      return { cue: cue, start: round3(cue.start), end: round3(end) };
    }).filter(function (win) { return win.end > win.start; });
  }

  function windowAt(cues, t, dur) {
    var wins = displayWindows(cues, dur, outroStart(dur));
    for (var i = 0; i < wins.length; i++) {
      if (t >= wins[i].start && t < wins[i].end) return wins[i];
    }
    return null;
  }

  function enableExpr(start, end) {
    function n(x) { return Number(x).toFixed(3); }
    if (start == null && end == null) return "";
    if (start != null && end == null) return "gte(t\\," + n(start) + ")";
    if (start == null) return "lt(t\\," + n(end) + ")";
    return "gte(t\\," + n(start) + ")*lt(t\\," + n(end) + ")";
  }

  function buildFilter(spec) {
    var w = spec.w;
    var h = spec.h;
    var layers = spec.layers || [];
    var fmt = spec.formatAuto === false ? "" : ":format=auto";
    var head = "[0:v]scale=" + w + ":" + h + ":force_original_aspect_ratio=increase,crop=" + w + ":" + h + ",setsar=1,fps=25";
    if (!layers.length) return head + "[vout]";
    var parts = [head + "[v0]"];
    var last = "v0";
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var input = i + 1;
      var out = i === layers.length - 1 ? "vout" : "v" + input;
      var en = enableExpr(layer.start, layer.end);
      var enable = en ? ":enable='" + en + "'" : "";
      parts.push("[" + last + "][" + input + ":v]overlay=" + (layer.x || 0) + ":" + (layer.y || 0) + fmt + enable + "[" + out + "]");
      last = out;
    }
    return parts.join(";");
  }

  root.KhutbahCues = {
    MAX_CHUNKS: MAX_CHUNKS,
    normalize: normalize,
    cleanWords: cleanWords,
    chunkWords: chunkWords,
    detect: detect,
    refreshCue: refreshCue,
    buildCues: buildCues,
    addPhrase: addPhrase,
    applyManual: applyManual,
    outroLength: outroLength,
    outroStart: outroStart,
    displayWindows: displayWindows,
    windowAt: windowAt,
    enableExpr: enableExpr,
    buildFilter: buildFilter,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
