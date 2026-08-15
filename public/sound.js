// محرّك صوت خفيف لرياض المتقين — نغمات Web Audio بلا ملفات خارجية.
// يحترم سياسات المتصفّح: unlock بعد أول تفاعل، وكتم عبر localStorage.
(function (global) {
  "use strict";

  var STORAGE_KEY = "rm_sound_enabled";
  var ctx = null;
  var unlocked = false;

  function isEnabled() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v === null) return true; // افتراضي: مفعّل بعد unlock
      return v !== "0" && v !== "false";
    } catch (e) {
      return true;
    }
  }

  function setEnabled(on) {
    try { localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch (e) { /* تجاهل */ }
    try {
      global.dispatchEvent(new CustomEvent("rm-sound-change", { detail: { enabled: !!on } }));
    } catch (e2) { /* تجاهل */ }
  }

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function unlock() {
    var c = ensureCtx();
    if (!c) return Promise.resolve(false);
    if (c.state === "suspended") {
      return c.resume().then(function () { unlocked = true; return true; }).catch(function () { return false; });
    }
    unlocked = true;
    return Promise.resolve(true);
  }

  // نغمة نغمية بسيطة: تسلسل نغمات قصيرة (لا أذان مسجّل).
  var PRESETS = {
    soft:    [{ f: 523.25, d: 0.12, g: 0.08 }, { f: 659.25, d: 0.18, g: 0.07 }],
    salawat: [{ f: 392.00, d: 0.16, g: 0.09 }, { f: 523.25, d: 0.20, g: 0.08 }, { f: 659.25, d: 0.28, g: 0.07 }],
    tasbeeh: [{ f: 440.00, d: 0.14, g: 0.08 }, { f: 554.37, d: 0.14, g: 0.07 }, { f: 659.25, d: 0.22, g: 0.06 }],
    fast:    [{ f: 349.23, d: 0.18, g: 0.08 }, { f: 440.00, d: 0.22, g: 0.07 }],
    prayer:  [
      { f: 293.66, d: 0.22, g: 0.10 },
      { f: 349.23, d: 0.22, g: 0.09 },
      { f: 440.00, d: 0.28, g: 0.08 },
      { f: 523.25, d: 0.40, g: 0.07 },
    ],
    alert:   [{ f: 880.00, d: 0.10, g: 0.07 }, { f: 660.00, d: 0.14, g: 0.06 }],
  };

  function toneAt(c, start, freq, dur, gain) {
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function play(kind) {
    if (!isEnabled()) return Promise.resolve(false);
    var notes = PRESETS[kind] || PRESETS.soft;
    return unlock().then(function (ok) {
      if (!ok || !ctx) return false;
      var t = ctx.currentTime + 0.02;
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        toneAt(ctx, t, n.f, n.d, n.g);
        t += n.d * 0.85;
      }
      return true;
    });
  }

  // أول تفاعل يفتح السياق (سياسات التشغيل التلقائي).
  function bindUnlockOnce() {
    if (global.__rmSoundUnlockBound) return;
    global.__rmSoundUnlockBound = true;
    var once = function () {
      unlock();
      global.removeEventListener("pointerdown", once, true);
      global.removeEventListener("keydown", once, true);
    };
    global.addEventListener("pointerdown", once, true);
    global.addEventListener("keydown", once, true);
  }

  bindUnlockOnce();

  global.RMSound = {
    play: play,
    unlock: unlock,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    toggle: function () {
      var next = !isEnabled();
      setEnabled(next);
      if (next) play("soft");
      return next;
    },
    // للاختبار اليدوي من الكونسول
    __presets: Object.keys(PRESETS),
  };
})(window);
