// منطق مشترك لصفحات الزكاة: التحميل من قاعدة البيانات (مربوط بالحساب)، النِّصاب،
// الحَوْل، وحفظ الإعدادات والممتلكات. كلّ البيانات تراكميّة وتتطلّب تسجيل الدخول.
window.ZK = (function () {
  "use strict";
  var ar = RM.ar, esc = RM.esc, api = RM.api;
  var HAWL = 354; // أيّام السنة الهجريّة تقريباً
  var state = { user: null, settings: {}, entries: [], holdings: {} };

  function money(n) {
    var c = state.settings.currency || "د.ك";
    return ar(Math.round((n || 0) * 1000) / 1000) + " " + c;
  }
  function goldPrice() { return Number(state.settings.gold_price) || 0; }
  function silverPrice() { return Number(state.settings.silver_price) || 0; }
  function nisabGold() { return 85 * goldPrice(); }            // ٨٥غ ذهب
  function nisabSilver() { return 595 * silverPrice(); }       // ٥٩٥غ فضّة
  // نصاب النقد/الأسهم/العروض = الأقلّ من نصابَي الذهب والفضّة إن توفّرا (أحوط)، أو حسب الأساس.
  function nisabCash() {
    var g = nisabGold(), s = nisabSilver();
    if (state.settings.basis === "silver") return s || g;
    if (g && s) return Math.min(g, s);
    return g || s;
  }

  function hawl(start) {
    if (!start) return { has: false };
    var d = new Date(start + "T00:00:00");
    if (isNaN(d)) return { has: false };
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    var due = new Date(d.getTime() + HAWL * 86400000);
    return { has: true, start: d, days: days, remaining: Math.max(0, HAWL - days), complete: days >= HAWL, due: due };
  }
  function dueText(h) {
    if (!h.has) return "حدّد تاريخ بدء الحَوْل";
    if (h.complete) return "استحقّت منذ " + h.start.toLocaleDateString("ar") + " (اكتمل الحَوْل)";
    return "تستحقّ في " + h.due.toLocaleDateString("ar") + " · باقٍ " + ar(h.remaining) + " يوماً";
  }

  // ===== الشبكة =====
  function saveSettings(partial) {
    Object.keys(partial).forEach(function (k) { state.settings[k] = partial[k]; });
    return api("/api/zakat/settings", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gold_price: state.settings.gold_price, silver_price: state.settings.silver_price,
        currency: state.settings.currency, basis: state.settings.basis,
      }),
    });
  }
  function saveHolding(kind, data) {
    state.holdings[kind] = Object.assign({}, state.holdings[kind], data, { kind: kind });
    return api("/api/zakat/holding", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ kind: kind }, data)),
    });
  }
  function delHolding(kind) {
    delete state.holdings[kind];
    return api("/api/zakat/holding/" + kind, { method: "DELETE" });
  }
  function addEntry(e) {
    return api("/api/zakat/entry", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(e),
    }).then(function (res) {
      if (res.ok && res.d.ok) state.entries.push(Object.assign({ id: res.d.id }, e));
      return res;
    });
  }
  function delEntry(id) {
    return api("/api/zakat/entry/" + id, { method: "DELETE" }).then(function (res) {
      if (res.ok && res.d.ok) state.entries = state.entries.filter(function (x) { return x.id !== id; });
      return res;
    });
  }

  // ===== الأسعار الحيّة =====
  // تُجلب من الخادم (سوق عالمي محوَّل للدينار) وتُحفظ في الذاكرة فقط؛ لا إدخال يدويّ.
  function fetchLivePrices() {
    return api("/api/gold-price").then(function (res) {
      var d = res.d || {};
      if (res.ok && d.ok) {
        state.settings.gold_price = d.gold_price;
        state.settings.silver_price = d.silver_price;
        state.settings.currency = d.currency || "د.ك";
        state.live = { updated: d.updated, ok: true };
      } else {
        state.live = { ok: false };
      }
      return state.live;
    }).catch(function () { state.live = { ok: false }; return state.live; });
  }

  // بطاقة أسعارٍ حيّة ذاتيّة التحديث (تحلّ محلّ شريط الإدخال اليدويّ).
  function pricesCard(el, opts) {
    opts = opts || {};
    var period = opts.period || 60000; // إعادة الجلب كلّ دقيقة (السعر لا يتغيّر بالثواني فعليّاً)
    function timeStr() {
      try { return new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
      catch (e) { return ""; }
    }
    function render() {
      var ok = state.live && state.live.ok;
      var g = goldPrice(), s = silverPrice();
      var price = function (label, v) {
        return '<div style="flex:1;min-width:130px"><div class="muted" style="font-size:.8rem">' + label + '</div>' +
          '<div style="font-weight:800;color:var(--gold);font-size:1.15rem">' + (v ? money(v) : "—") + '</div></div>';
      };
      var nis = [];
      if (nisabGold()) nis.push("نصاب الذهب ٨٥غ ≈ " + money(nisabGold()));
      if (nisabSilver()) nis.push("نصاب الفضّة ٥٩٥غ ≈ " + money(nisabSilver()));
      el.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem">' +
        '<h3 style="color:var(--gold);margin:0">أسعار السوق الحيّة</h3>' +
        '<span class="muted" style="font-size:.78rem">' +
        (ok ? '🟢 يُحدَّث تلقائيّاً · آخر تحديث ' + timeStr() : '⚠️ تعذّر جلب الأسعار، نعيد المحاولة…') + '</span></div>' +
        '<div style="display:flex;gap:1rem;flex-wrap:wrap">' +
        price("غرام الذهب (عيار ٢٤)", g) + price("غرام الفضّة", s) + "</div>" +
        '<p class="muted" style="font-size:.82rem;margin:.7rem 0 0">' +
        (nis.length ? nis.join(" · ") : "بانتظار الأسعار…") +
        '<br><span style="opacity:.8">السعر تقديريٌّ من سوق المعادن العالمي محوّلاً إلى الدينار الكويتي.</span></p>';
    }
    function cycle() {
      fetchLivePrices().then(function () {
        render();
        if (window.__zkRecompute) window.__zkRecompute();
      });
    }
    el.innerHTML = '<p class="muted" style="margin:0">جارٍ جلب أسعار الذهب والفضّة…</p>';
    cycle();
    var t = setInterval(cycle, period);
    window.addEventListener("beforeunload", function () { clearInterval(t); });
  }

  // بوّابة الدخول: هذه بيانات تراكميّة، فالتسجيل واجب.
  function boot(onReady) {
    var gate = document.getElementById("gate");
    var main = document.getElementById("zkMain");
    return RM.getMe().then(function (u) {
      state.user = u;
      if (!u) {
        if (gate) {
          gate.hidden = false;
          gate.innerHTML =
            '<strong>هذه الخاصيّة للمتعلّمين المسجّلين.</strong><br>' +
            'زكاة المال <strong>بياناتٌ تراكميّة</strong> تُحسب على مدار <strong>الحَوْل (سنة كاملة)</strong>، ولا تُحسب في يومٍ وليلة؛ ' +
            'لذلك نحفظ سجلّك في حسابك ليتتبّع النِّصاب وموعد الاستحقاق. ' +
            '<a class="gold" href="/login">سجّل الدخول</a> أو <a class="gold" href="/register">أنشئ حساباً</a>.';
        }
        if (main) main.hidden = true;
        return;
      }
      // مسجَّل: نُظهِر المحتوى ونُخفي بوّابة الدخول.
      if (gate) gate.hidden = true;
      if (main) main.hidden = false;
      return api("/api/zakat").then(function (res) {
        if (res.status === 401) {
          // انتهت الجلسة فعليّاً رغم وجود مستخدمٍ مخزّن: نُظهِر البوّابة.
          if (main) main.hidden = true;
          if (gate) {
            gate.hidden = false;
            gate.innerHTML = '<strong>انتهت جلستك.</strong> <a class="gold" href="/login">سجّل الدخول من جديد</a> لمتابعة سجلّ زكاتك.';
          }
          return;
        }
        var d = res.d || {};
        state.settings = d.settings || { currency: "د.ك", basis: "gold" };
        if (!state.settings.currency) state.settings.currency = "د.ك";
        state.entries = d.entries || [];
        state.holdings = {};
        (d.holdings || []).forEach(function (h) { state.holdings[h.kind] = h; });
        if (onReady) onReady(state);
      });
    }).catch(function () {
      // عند أيّ خطأ غير متوقّع: نُبقي المحتوى ظاهراً ونعرض ملاحظةً بدل صفحةٍ فارغة.
      if (main) main.hidden = false;
      if (gate) { gate.hidden = false; gate.innerHTML = '<strong>تعذّر تحميل بياناتك.</strong> حدّث الصفحة، وإن كنت غير مسجّلٍ <a class="gold" href="/login">سجّل الدخول</a>.'; }
    });
  }

  // (أُزيل شريط الإدخال اليدويّ للأسعار وملخّصه — الأسعار حيّة من الخادم عبر pricesCard،
  //  وكانت بقاياه كوداً ميّتاً برسائل مضلّلة «أدخِل السعر/عدّل الأسعار» بلا أيّ حقل إدخال.)

  return {
    state: state, ar: ar, esc: esc, money: money,
    goldPrice: goldPrice, silverPrice: silverPrice,
    nisabGold: nisabGold, nisabSilver: nisabSilver, nisabCash: nisabCash,
    hawl: hawl, dueText: dueText, boot: boot,
    fetchLivePrices: fetchLivePrices, pricesCard: pricesCard,
    saveSettings: saveSettings, saveHolding: saveHolding, delHolding: delHolding,
    addEntry: addEntry, delEntry: delEntry,
  };
})();
