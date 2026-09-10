// هيكل مشترك: ترويسة وتذييل يُحقنان في كل صفحة، مع عكس حالة الدخول.
(function () {
  "use strict";

  var SITE = "رياض المتقين";
  var path = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  if (path === "") path = "/";

  // أيقونة الموقع (لكل الصفحات عبر نقطة واحدة)
  if (!document.querySelector('link[rel="icon"]')) {
    var fav = document.createElement("link");
    fav.rel = "icon";
    fav.type = "image/png";
    fav.href = "/assets/logo.png";
    document.head.appendChild(fav);
  }

  // وحدة التذكيرات داخل الصفحة (الصلاة على النبيّ ﷺ + الصيام) — تُحمَّل مرّةً، وتُهيّئ نفسها.
  if (!document.querySelector('script[data-rm-reminders]') && path.indexOf("/teacher") !== 0 &&
      path.indexOf("/manager") !== 0 && path.indexOf("/admin") !== 0) {
    var rs = document.createElement("script");
    rs.src = "/reminders.js";
    rs.setAttribute("data-rm-reminders", "1");
    rs.defer = true;
    document.head.appendChild(rs);
  }

  var links = [
    { href: "/", label: "الرئيسية" },
    { href: "/quran", label: "القرآن الكريم" },
    { href: "/live", label: "الدروس المباشرة" },
    { href: "/clips", label: "مكتبة المقاطع" },
    { href: "/tools", label: "أدوات المسلم" },
    { href: "/train", label: "ساهم بالتدريب" },
    { href: "/teachers", label: "المعلّمون" },
    { href: "/about", label: "عن الموقع" },
  ];

  function isActive(href) {
    if (href === "/") return path === "/";
    return path.indexOf(href) === 0;
  }

  function authArea(user) {
    var cur = readStoredLang();
    var curLabel = langLabel(cur);
    var lang = '<div class="lang-wrap notranslate" translate="no" style="position:relative">' +
      '<button class="btn btn-ghost" id="langBtn" title="اللغة / Language — ' + curLabel + '" aria-haspopup="true" aria-expanded="false" style="padding:.45rem .6rem">🌐 <span class="lang-code">' + escLang(cur) + "</span></button>" +
      '<div id="langMenu" class="lang-menu notranslate" translate="no" hidden></div></div>' +
      '<div id="google_translate_element" class="gt-slot" aria-hidden="true"></div>';
    if (user) {
      var home = user.role === "manager" ? "/manager"
        : user.role === "admin" ? "/admin"
        : user.role === "teacher" ? "/teacher"
        : "/account";
      return (
        lang +
        '<a class="btn btn-ghost" href="' + home + '">حسابي</a>' +
        '<a class="btn btn-outline" href="#" id="logoutBtn">خروج</a>'
      );
    }
    return lang + '<a class="btn btn-outline" href="/login">دخول</a>';
  }

  // قائمة لغاتٍ شائعة (تغطّي معظم العالم)؛ Google يترجم لأيٍّ منها فوراً.
  var LANGS = [
    ["ar", "العربية"], ["en", "English"], ["fr", "Français"], ["es", "Español"],
    ["de", "Deutsch"], ["tr", "Türkçe"], ["ur", "اردو"], ["fa", "فارسی"],
    ["id", "Indonesia"], ["ms", "Melayu"], ["ru", "Русский"], ["zh-CN", "中文"],
    ["hi", "हिन्दी"], ["bn", "বাংলা"], ["pt", "Português"], ["it", "Italiano"],
    ["nl", "Nederlands"], ["sw", "Kiswahili"], ["ha", "Hausa"], ["so", "Soomaali"],
    ["ps", "پښتو"], ["ku", "Kurdî"], ["az", "Azərbaycan"], ["uz", "Oʻzbek"],
    ["kk", "Қазақ"], ["uk", "Українська"], ["pl", "Polski"], ["ro", "Română"],
    ["th", "ไทย"], ["vi", "Tiếng Việt"], ["ja", "日本語"], ["ko", "한국어"],
    ["he", "עברית"], ["el", "Ελληνικά"], ["sq", "Shqip"], ["bs", "Bosanski"],
    ["am", "አማርኛ"], ["fil", "Filipino"], ["sv", "Svenska"], ["fi", "Suomi"],
  ];

  // العربية الأصل. أي لغة أخرى تُحفَظ عندنا ثم تُمرَّر لـ Google Translate
  // عبر googtrans + الهاش + اختيار القائمة — الثلاث معاً لأن الكوكي وحدها
  // تفشل غالباً (نسخ متعارضة على النطاق / CSP / توقيت التحميل).
  var LANG_STORE = "rm_lang";
  var RTL_LANGS = { ar: 1, ur: 1, fa: 1, he: 1, ps: 1, ku: 1 };

  function escLang(s) {
    return String(s || "ar").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function langLabel(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === code) return LANGS[i][1];
    return code || "العربية";
  }
  function getCookie(n) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function cookieFlags() {
    return (location.protocol === "https:" ? "; Secure" : "") + "; SameSite=Lax";
  }
  function cookieDomains() {
    var host = location.hostname;
    var list = ["", host];
    if (host && host.indexOf(".") !== -1 && host !== "localhost") {
      list.push("." + host);
      var parts = host.split(".");
      if (parts.length >= 2) {
        var root = parts.slice(-2).join(".");
        list.push(root);
        list.push("." + root);
      }
    }
    var out = [];
    var seen = {};
    list.forEach(function (d) {
      if (seen[d]) return;
      seen[d] = 1;
      out.push(d);
    });
    return out;
  }
  function writeCookie(name, value, extra) {
    document.cookie = name + "=" + value + "; path=/; max-age=31536000" + cookieFlags() + (extra || "");
  }
  function expireCookie(name, domain) {
    var extra = domain ? "; domain=" + domain : "";
    document.cookie = name + "=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0" + extra;
    document.cookie = name + "=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0" + extra + cookieFlags();
  }
  function clearGoogTransCookies() {
    cookieDomains().forEach(function (d) { expireCookie("googtrans", d); });
  }
  function setGoogTransCookie(val) {
    // امسح النسخ القديمة أولاً حتى لا يقرأ Google قيمة فارغة من نطاق آخر.
    clearGoogTransCookies();
    writeCookie("googtrans", val);
    cookieDomains().forEach(function (d) {
      if (d) writeCookie("googtrans", val, "; domain=" + d);
    });
  }
  function persistOurLang(code) {
    try { localStorage.setItem(LANG_STORE, code); } catch (e) { /* تجاهل */ }
    writeCookie(LANG_STORE, encodeURIComponent(code));
  }
  function clearOurLang() {
    try { localStorage.removeItem(LANG_STORE); } catch (e) { /* تجاهل */ }
    cookieDomains().forEach(function (d) { expireCookie(LANG_STORE, d); });
  }
  function langFromGoogTrans(raw) {
    var parts = String(raw || "").split("/");
    return parts[2] || "";
  }
  function readStoredLang() {
    try {
      var ls = localStorage.getItem(LANG_STORE);
      if (ls) return ls;
    } catch (e) { /* تجاهل */ }
    var ours = getCookie(LANG_STORE);
    if (ours) return ours;
    return langFromGoogTrans(getCookie("googtrans")) || "ar";
  }
  function applyDir(code) {
    var rtl = !!RTL_LANGS[code || "ar"];
    document.documentElement.lang = code || "ar";
    document.documentElement.dir = rtl ? "rtl" : "ltr";
  }
  function stripGoogTransHash() {
    if (location.hash && /googtrans/i.test(location.hash)) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { location.hash = ""; }
    }
  }
  function setGoogTransHash(code) {
    var want = "#googtrans(ar|" + code + ")";
    if (location.hash === want) return;
    try { history.replaceState(null, "", location.pathname + location.search + want); } catch (e) { location.hash = want.slice(1); }
  }
  function chooseLang(code) {
    if (!code) code = "ar";
    if (code === "ar") {
      clearOurLang();
      clearGoogTransCookies();
      stripGoogTransHash();
      applyDir("ar");
    } else {
      persistOurLang(code);
      setGoogTransCookie("/ar/" + code);
      setGoogTransHash(code);
      applyDir(code);
    }
    location.reload();
  }
  function includedLangCodes() {
    return LANGS.filter(function (l) { return l[0] !== "ar"; }).map(function (l) { return l[0]; }).join(",");
  }
  function ensureGtHolder() {
    var holder = document.getElementById("google_translate_element");
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "google_translate_element";
      holder.className = "gt-slot";
      holder.setAttribute("aria-hidden", "true");
      document.body.appendChild(holder);
    }
    return holder;
  }
  function injectGtCss() {
    if (document.getElementById("gt-hide-ui")) return;
    var st = document.createElement("style");
    st.id = "gt-hide-ui";
    // لا نُخفي #google_translate_element بـ display:none حتى يبقى تغيير
    // .goog-te-combo قادراً على إطلاق الترجمة. الإخفاء البصري عبر .gt-slot.
    st.textContent =
      ".goog-te-banner-frame,iframe.skiptranslate,#goog-gt-tt,.goog-te-balloon-frame" +
      "{display:none!important}" +
      "body{top:0!important;position:static!important}" +
      "font{background:transparent!important;box-shadow:none!important}" +
      ".goog-text-highlight{background:none!important;box-shadow:none!important}";
    document.head.appendChild(st);
  }
  function forceCombo(code) {
    var tries = 0;
    (function tick() {
      var combo = document.querySelector(".goog-te-combo");
      if (combo) {
        if (combo.value !== code) {
          combo.value = code;
          combo.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
      if (++tries < 50) setTimeout(tick, 120);
    })();
  }
  function retranslate() {
    var code = readStoredLang();
    if (!code || code === "ar") return;
    var combo = document.querySelector(".goog-te-combo");
    if (!combo) { forceCombo(code); return; }
    var v = combo.value || code;
    combo.value = "";
    combo.dispatchEvent(new Event("change", { bubbles: true }));
    setTimeout(function () {
      combo.value = v;
      combo.dispatchEvent(new Event("change", { bubbles: true }));
    }, 80);
  }
  window.rmRetranslate = retranslate;

  // إن كانت هناك لغةٌ مختارة (غير العربية) نُحمّل سكربت Google ليطبّق الترجمة.
  function applyStoredLang() {
    var code = readStoredLang();
    applyDir(code);
    if (code === "ar") {
      // إن بقي googtrans من زيارة سابقة أزلْه حتى لا تُترجم الصفحة دون قصد.
      if (getCookie("googtrans")) clearGoogTransCookies();
      stripGoogTransHash();
      return;
    }
    persistOurLang(code);
    setGoogTransCookie("/ar/" + code);
    setGoogTransHash(code);
    if (window.__gtLoaded) { forceCombo(code); return; }
    window.__gtLoaded = true;
    ensureGtHolder();
    injectGtCss();
    window.googleTranslateElementInit = function () {
      try {
        new google.translate.TranslateElement({
          pageLanguage: "ar",
          includedLanguages: includedLangCodes(),
          autoDisplay: false,
        }, "google_translate_element");
      } catch (e) { /* عنصر الترجمة قد يفشل بصمت إن حُجب السكربت */ }
      forceCombo(code);
    };
    var s = document.createElement("script");
    s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.head.appendChild(s);
  }

  // أعد الكوكي مبكّراً (قبل جلب الجلسة) حتى يراها عنصر الترجمة عند التحميل.
  applyDir(readStoredLang());
  if (readStoredLang() !== "ar") {
    try { setGoogTransCookie("/ar/" + readStoredLang()); } catch (e) { /* تجاهل */ }
  }

  function buildLangMenu(menu) {
    var cur = readStoredLang();
    menu.innerHTML = LANGS.map(function (l) {
      var on = l[0] === cur;
      return '<button type="button" class="lang-opt' + (on ? " on" : "") + '" data-lang="' + l[0] + '">' +
        (on ? "✓ " : "") + l[1] + "</button>";
    }).join("");
    menu.setAttribute("data-built", "1");
  }

  // زرّ اللغة: تفويضٌ على مستوى المستند (يعمل مهما كان توقيت حقن الترويسة) — أكثر موثوقيّة.
  var langDelegated = false;
  function setupLang() {
    if (langDelegated) return;
    langDelegated = true;
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("#langBtn");
      var menu = document.getElementById("langMenu");
      if (btn) {
        e.preventDefault();
        if (!menu) return;
        if (!menu.getAttribute("data-built")) buildLangMenu(menu);
        menu.hidden = !menu.hidden;
        btn.setAttribute("aria-expanded", String(!menu.hidden));
        return;
      }
      var opt = e.target.closest("#langMenu [data-lang]");
      if (opt) { e.preventDefault(); chooseLang(opt.getAttribute("data-lang")); return; }
      if (menu && !menu.hidden && !e.target.closest("#langMenu")) menu.hidden = true;
    });
  }

  function render(user) {
    var navHtml =
      '<header class="site-header"><nav class="container nav">' +
      '<a class="brand" href="/"><img class="logo" src="/assets/logo.png" alt=""><span>' + SITE + "</span></a>" +
      '<button class="nav-toggle" id="navToggle" aria-label="القائمة" aria-expanded="false">☰</button>' +
      '<ul class="nav-links" id="navLinks">' +
      links
        .map(function (l) {
          return '<li><a class="' + (isActive(l.href) ? "active" : "") + '" href="' + l.href + '">' + l.label + "</a></li>";
        })
        .join("") +
      "</ul>" +
      '<span class="nav-actions" style="display:flex;gap:.5rem;align-items:center">' + authArea(user) + "</span>" +
      "</nav></header>";

    var year = new Date().getFullYear();
    var footHtml =
      '<footer class="site-footer"><div class="container">' +
      '<div class="share"><a class="btn btn-outline" href="/share">✦ شارِك الصفحة</a>' +
      '<a class="btn btn-ghost" href="/teach">التدريس معنا</a>' +
      '<a class="btn btn-ghost" href="/support">تواصل مع الدعم</a>' +
      '<a class="btn btn-ghost" href="/privacy">سياسة الخصوصية</a></div>' +
      '<div class="copy">@RiyadALMutaqin · رياض المتقين © ' + year + "</div>" +
      "</div></footer>";

    var h = document.querySelector("[data-header]");
    if (h) h.outerHTML = navHtml;
    var f = document.querySelector("[data-footer]");
    if (f) f.outerHTML = footHtml;

    var lo = document.getElementById("logoutBtn");
    if (lo) {
      lo.addEventListener("click", function (e) {
        e.preventDefault();
        fetch("/api/auth/logout", { method: "POST" }).then(function () {
          location.href = "/";
        });
      });
    }
    setupLang();
    applyStoredLang();
    var nt = document.getElementById("navToggle");
    var nl = document.getElementById("navLinks");
    if (nt && nl) {
      nt.addEventListener("click", function () {
        var open = nl.classList.toggle("open");
        nt.setAttribute("aria-expanded", String(open));
      });
      // إغلاق القائمة عند اختيار رابط (على الهاتف).
      nl.addEventListener("click", function (e) { if (e.target.closest("a")) nl.classList.remove("open"); });
    }

    // حماية صفحات المعلّم على جهة العميل (الحماية الفعلية على الـ API).
    // مدير الموقع يستخدم أدوات المعلّم (مونتاج/نشر) من لوحة المدير.
    if (path.indexOf("/teacher") === 0) {
      if (!user) { location.href = "/login?role=teacher"; return; }
      if (user.role !== "teacher" && user.role !== "manager" && user.role !== "admin") {
        location.href = "/";
        return;
      }
    }
    // حماية صفحات مدير الموقع (manager/admin فقط).
    if (path.indexOf("/manager") === 0) {
      if (!user) { location.href = "/login"; return; }
      if (user.role !== "manager" && user.role !== "admin") { location.href = "/"; return; }
    }
    // حماية صفحات الأدمن (admin فقط).
    if (path.indexOf("/admin") === 0) {
      if (!user) { location.href = "/login"; return; }
      if (user.role !== "admin") { location.href = "/"; return; }
    }
  }

  // تتبّع زيارة مجهولة للصفحات العامّة (لا نتتبّع لوحة المعلّم).
  if (path.indexOf("/teacher") !== 0) {
    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: location.pathname, referrer: document.referrer, query: location.search }),
        keepalive: true,
      });
    } catch (e) { /* تجاهل */ }
  }

  fetch("/api/auth/me", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      // إلزام تغيير كلمة المرور المؤقّتة قبل أي صفحة أخرى.
      if (data && data.user && data.must_change_password && path !== "/change-password") {
        location.href = "/change-password";
        return;
      }
      render(data && data.user ? data.user : null);
    })
    .catch(function () { render(null); });
})();
