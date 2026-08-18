// تذكيرات داخل الصفحة (بلا أذونات نظام، تعمل ما دام الموقع مفتوحاً):
//  • الصلاة على النبيّ ﷺ كلّ ٥ دقائق (+ نغمة اختيارية).
//  • تذكير صيام التطوّع (الإثنين/الخميس + الأيّام البيض ١٣/١٤/١٥) عشيّة اليوم السابق.
//  • وِرد تسبيحٍ متنوّع كلّ ٢٠ دقيقة مع رابط عدّاد التسبيح.
(function () {
  "use strict";
  var SALAH_MS = 5 * 60 * 1000; // ٥ دقائق

  function injectStyles() {
    if (document.getElementById("rm-rem-style")) return;
    var st = document.createElement("style");
    st.id = "rm-rem-style";
    st.textContent =
      "#rm-toast{position:fixed;inset-inline:0;bottom:1rem;display:flex;flex-direction:column;align-items:center;gap:.6rem;z-index:9999;pointer-events:none;padding:0 1rem}" +
      ".rm-card{pointer-events:auto;max-width:440px;width:100%;background:linear-gradient(135deg,#0c4d2c,#062417);color:#eaf3ec;border:1px solid #1c6b42;border-radius:14px;" +
      "padding:.9rem 1rem;box-shadow:0 10px 30px rgba(0,0,0,.4);font-family:Tajawal,system-ui,sans-serif;display:flex;align-items:center;gap:.7rem;animation:rmIn .35s ease}" +
      ".rm-card .rm-ic{font-size:1.5rem;flex:none}.rm-card .rm-tx{flex:1;font-size:.98rem;line-height:1.6}" +
      ".rm-card .rm-tx b{color:#e9c46a}.rm-card .rm-x,.rm-card .rm-mute{flex:none;background:transparent;border:0;color:#bfe0cc;font-size:1.05rem;cursor:pointer;line-height:1;padding:.2rem}" +
      ".rm-card .rm-mute{opacity:.9}" +
      "@keyframes rmIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}" +
      "@media (prefers-reduced-motion:reduce){.rm-card{animation:none}}";
    document.head.appendChild(st);
  }

  function wrap() {
    var w = document.getElementById("rm-toast");
    if (!w) {
      w = document.createElement("div");
      w.id = "rm-toast";
      w.setAttribute("aria-live", "polite");
      w.setAttribute("aria-relevant", "additions");
      document.body.appendChild(w);
    }
    return w;
  }

  function muteLabel() {
    var on = window.RMSound ? window.RMSound.isEnabled() : true;
    return on ? "🔊" : "🔇";
  }

  function toast(icon, html, ttlMs, soundKind) {
    injectStyles();
    if (window.RMSound && soundKind) {
      try { window.RMSound.play(soundKind); } catch (e) { /* تجاهل */ }
    }
    var card = document.createElement("div");
    card.className = "rm-card";
    card.innerHTML =
      '<span class="rm-ic">' + icon + "</span>" +
      '<div class="rm-tx">' + html + "</div>" +
      '<button type="button" class="rm-mute" title="كتم/تشغيل الصوت" aria-label="كتم أو تشغيل الصوت">' + muteLabel() + "</button>" +
      '<button type="button" class="rm-x" aria-label="إغلاق">✕</button>';
    card.querySelector(".rm-x").addEventListener("click", function () { card.remove(); });
    card.querySelector(".rm-mute").addEventListener("click", function () {
      if (!window.RMSound) return;
      window.RMSound.toggle();
      card.querySelector(".rm-mute").textContent = muteLabel();
    });
    wrap().appendChild(card);
    if (ttlMs) setTimeout(function () { card.remove(); }, ttlMs);
  }

  function salahReminder() {
    toast("🤍",
      "اللهمّ صلِّ وسلِّم على نبيّنا <b>محمّد</b> ﷺ.<br>" +
      '<span style="opacity:.85;font-size:.86rem">«من صلّى عليّ واحدةً صلّى الله عليه بها عشراً».</span>',
      60000,
      "salawat");
  }

  function hijriDay(date) {
    try {
      return parseInt(new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric" }).format(date), 10);
    } catch (e) { return null; }
  }

  function tomorrowFastReason() {
    var t = new Date(); t.setDate(t.getDate() + 1);
    var dow = t.getDay();
    if (dow === 1) return "غداً الإثنين، ومن السنّة صيامه (تُعرض فيه الأعمال على الله).";
    if (dow === 4) return "غداً الخميس، ومن السنّة صيامه (تُعرض فيه الأعمال على الله).";
    var hd = hijriDay(t);
    if (hd === 13 || hd === 14 || hd === 15) return "غداً من الأيّام البيض (" + hd + " هجري)، ومن السنّة صيامها.";
    return null;
  }

  function periodNow() {
    var h = new Date().getHours();
    if (h >= 4 && h < 12) return "morning";
    if (h >= 16 && h < 24) return "evening";
    return null;
  }

  function dayKey() { return new Date().toISOString().slice(0, 10); }

  function fastingCheck() {
    var period = periodNow();
    if (!period) return;
    var reason = tomorrowFastReason();
    if (!reason) return;
    var key = "rm_fast_" + dayKey() + "_" + period;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch (e) { /* تجاهل */ }
    var when = period === "morning" ? "صباح الخير 🌅" : "مساء الخير 🌙";
    toast("🌙",
      "<b>" + when + "</b><br>" + reason + "<br>" +
      '<span style="opacity:.85;font-size:.86rem">انوِ الصيام، وأبشِر بالأجر إن شاء الله.</span>',
      90000,
      "fast");
  }

  var TASBEEH_MS = 20 * 60 * 1000;
  var ATHKAR = [
    ["سبحان الله وبحمده، سبحان الله العظيم",
      "«كلمتان خفيفتان على اللسان، ثقيلتان في الميزان، حبيبتان إلى الرحمن» — متفق عليه."],
    ["لا إله إلا الله وحده لا شريك له، له الملك وله الحمد، وهو على كل شيء قدير",
      "من قالها مئةً في يومٍ كانت له عِدل عشر رقاب — متفق عليه."],
    ["أستغفر الله وأتوب إليه",
      "قال ﷺ: «إني لأستغفر الله في اليوم مئة مرة» — رواه مسلم."],
    ["لا حول ولا قوة إلا بالله",
      "«كنزٌ من كنوز الجنة» — متفق عليه."],
  ];
  var tasbeehIdx = 0;

  function tasbeehReminder() {
    var a = ATHKAR[tasbeehIdx % ATHKAR.length];
    tasbeehIdx += 1;
    toast("📿",
      "<b>" + a[0] + "</b><br>" +
      '<span style="opacity:.85;font-size:.86rem">' + a[1] + "</span><br>" +
      '<a href="/tasbeeh" style="color:#e9c46a;font-size:.86rem">افتح عدّاد التسبيح ›</a>',
      60000,
      "tasbeeh");
  }

  function start() {
    if (window.__rmRemStarted) return;
    window.__rmRemStarted = true;
    setTimeout(fastingCheck, 4000);
    setTimeout(salahReminder, 60000);
    setInterval(salahReminder, SALAH_MS);
    setTimeout(function () { tasbeehReminder(); setInterval(tasbeehReminder, TASBEEH_MS); }, 8 * 60 * 1000);
  }

  // للاختبار الفوري من الكونسول أثناء التطوير
  window.__rmTestReminder = function (kind) {
    if (kind === "tasbeeh") return tasbeehReminder();
    if (kind === "fast") return fastingCheck();
    return salahReminder();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
