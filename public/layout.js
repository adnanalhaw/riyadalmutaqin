// هيكل مشترك: ترويسة وتذييل يُحقنان في كل صفحة، مع عكس حالة الدخول.
(function () {
  "use strict";

  var SITE = "رياض المتقين";
  var path = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  if (path === "") path = "/";

  // مصدر واحد لروابط التواصل — فارغ = يُخفى الزر. يوتيوب يُضاف عند توفّر الرابط العام.
  // يمكن لـ /api/settings/public أن يستبدل هذه القيم لاحقاً.
  var SOCIAL = {
    instagram: "https://www.instagram.com/almutaqyn",
    youtube: "",
    tiktok: "https://vt.tiktok.com/ZSarkqaDJ/",
    facebook: "https://www.facebook.com/profile.php?id=61586546952951",
  };
  window.RM_SOCIAL = SOCIAL;

  function applySocialLinks(map) {
    var links = map || SOCIAL;
    var any = false;
    Object.keys(links).forEach(function (k) {
      var nodes = document.querySelectorAll('[data-social="' + k + '"]');
      if (!nodes.length) return;
      var url = links[k];
      nodes.forEach(function (row) {
        if (url) {
          row.href = url;
          row.target = "_blank";
          row.rel = "noopener";
          row.style.display = "";
          any = true;
        } else {
          row.style.display = "none";
        }
      });
    });
    var note = document.getElementById("socialNote");
    if (note) note.hidden = any;
  }

  // جرس إشعارات للأدوار المسجّلة — يستطلع /api/notifications.
  var __rmLastUnread = null;
  function notifHome(role) {
    if (role === "manager") return "/manager";
    if (role === "admin") return "/admin";
    if (role === "teacher") return "/teacher";
    return "/account";
  }
  function setupNotifBell(user) {
    var wrap = document.getElementById("notifBellWrap");
    if (!wrap || !user) return;
    function ar(n) {
      return String(n).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
    }
    function paint(unread) {
      var n = Number(unread) || 0;
      wrap.innerHTML =
        '<a class="btn btn-ghost" href="' + notifHome(user.role) + '" id="notifBell" title="الإشعارات" style="padding:.45rem .55rem;position:relative">' +
        "🔔" +
        (n > 0
          ? '<span style="position:absolute;top:0;inset-inline-end:0;background:var(--gold);color:#2a1f04;border-radius:999px;font-size:.65rem;font-weight:800;min-width:1.1rem;padding:0 .25rem;line-height:1.2">' +
            ar(n > 99 ? 99 : n) + "</span>"
          : "") +
        "</a>";
      if (__rmLastUnread !== null && n > __rmLastUnread && window.RMSound) {
        try { window.RMSound.play("alert"); } catch (e) { /* تجاهل */ }
      }
      __rmLastUnread = n;
    }
    function poll() {
      fetch("/api/notifications", { headers: { accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.ok) return;
          paint(d.unread || 0);
        })
        .catch(function () { /* تجاهل */ });
    }
    poll();
    setInterval(poll, 60000);
  }

  // أيقونة الموقع (لكل الصفحات عبر نقطة واحدة)
  if (!document.querySelector('link[rel="icon"]')) {
    var fav = document.createElement("link");
    fav.rel = "icon";
    fav.type = "image/png";
    fav.href = "/assets/logo.png";
    document.head.appendChild(fav);
  }

  // الصوت متاح لكل الصفحات (كتم الترويسة + جرس الإشعارات). التذكيرات للعامّة فقط.
  if (!document.querySelector('script[data-rm-sound]')) {
    var ss = document.createElement("script");
    ss.src = "/sound.js";
    ss.setAttribute("data-rm-sound", "1");
    document.head.appendChild(ss);
  }
  if (path.indexOf("/teacher") !== 0 && path.indexOf("/manager") !== 0 && path.indexOf("/admin") !== 0) {
    if (!document.querySelector('script[data-rm-reminders]')) {
      var rs = document.createElement("script");
      rs.src = "/reminders.js";
      rs.setAttribute("data-rm-reminders", "1");
      rs.defer = true;
      document.head.appendChild(rs);
    }
  }

  var links = [
    { href: "/", label: "الرئيسية" },
    { href: "/quran", label: "القرآن الكريم" },
    { href: "/live", label: "الدروس المباشرة" },
    { href: "/clips", label: "مكتبة المقاطع" },
    { href: "/audio", label: "المكتبة الصوتية" },
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
    var soundBtn =
      '<button type="button" class="btn btn-ghost" id="soundBtn" title="كتم/تشغيل الإشعارات الصوتية" aria-label="الصوت" style="padding:.45rem .6rem">' +
      (function () {
        try {
          var v = localStorage.getItem("rm_sound_enabled");
          if (v === "0" || v === "false") return "🔇";
        } catch (e) { /* تجاهل */ }
        return "🔊";
      })() +
      "</button>";
    var lang = soundBtn +
      '<div class="lang-wrap" style="position:relative">' +
      '<button class="btn btn-ghost" id="langBtn" title="اللغة / Language" aria-haspopup="true" aria-expanded="false" style="padding:.45rem .6rem">🌐</button>' +
      '<div id="langMenu" class="lang-menu" hidden></div></div>' +
      '<div id="google_translate_element" style="display:none"></div>';
    if (user) {
      var home = user.role === "manager" ? "/manager"
        : user.role === "admin" ? "/admin"
        : user.role === "teacher" ? "/teacher"
        : "/account";
      return (
        lang +
        '<span id="notifBellWrap"></span>' +
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

  function getCookie(n) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function setLangCookie(val) {
    // googtrans مقروءٌ من Google Translate لتطبيق الترجمة بعد إعادة التحميل.
    var host = location.hostname;
    document.cookie = "googtrans=" + val + "; path=/";
    document.cookie = "googtrans=" + val + "; path=/; domain=" + host;
    document.cookie = "googtrans=" + val + "; path=/; domain=." + host;
  }
  function currentLang() {
    var c = getCookie("googtrans"); // مثل /ar/en
    var parts = c.split("/");
    return parts[2] || "ar";
  }
  function chooseLang(code) {
    if (code === "ar") {
      setLangCookie(""); // إزالة الترجمة
    } else {
      setLangCookie("/ar/" + code);
    }
    location.reload();
  }

  // إن كانت هناك لغةٌ مختارة (غير العربية) نُحمّل سكربت Google ليطبّق الترجمة.
  function applyStoredLang() {
    if (currentLang() === "ar") return;
    if (window.__gtLoaded) return;
    window.__gtLoaded = true;
    var holder = document.getElementById("google_translate_element");
    if (!holder) { holder = document.createElement("div"); holder.id = "google_translate_element"; holder.style.display = "none"; document.body.appendChild(holder); }
    var st = document.createElement("style");
    st.textContent = ".goog-te-banner-frame,.skiptranslate>iframe{display:none!important}body{top:0!important;position:static!important}#goog-gt-tt,.goog-te-balloon-frame{display:none!important}";
    document.head.appendChild(st);
    window.googleTranslateElementInit = function () {
      try { new google.translate.TranslateElement({ pageLanguage: "ar", autoDisplay: false }, "google_translate_element"); } catch (e) { /* تجاهل */ }
    };
    var s = document.createElement("script");
    s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    document.head.appendChild(s);
  }

  function buildLangMenu(menu) {
    var cur = currentLang();
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
    var sb = document.getElementById("soundBtn");
    if (sb) {
      var syncSoundBtn = function () {
        var on = true;
        try {
          if (window.RMSound) on = window.RMSound.isEnabled();
          else {
            var v = localStorage.getItem("rm_sound_enabled");
            on = !(v === "0" || v === "false");
          }
        } catch (e) { /* تجاهل */ }
        sb.textContent = on ? "🔊" : "🔇";
        sb.setAttribute("aria-pressed", on ? "true" : "false");
      };
      sb.addEventListener("click", function (e) {
        e.preventDefault();
        if (window.RMSound) window.RMSound.toggle();
        else {
          try {
            var cur = localStorage.getItem("rm_sound_enabled");
            var next = cur === "0" || cur === "false";
            localStorage.setItem("rm_sound_enabled", next ? "1" : "0");
          } catch (err) { /* تجاهل */ }
        }
        syncSoundBtn();
      });
      document.addEventListener("rm-sound-change", syncSoundBtn);
      syncSoundBtn();
    }
    if (user) setupNotifBell(user);
    setupLang();
    applyStoredLang();
    applySocialLinks(SOCIAL);
    // إعدادات عامة من الخادم (إن وُجدت) تستبدل الروابط الافتراضية.
    fetch("/api/settings/public", { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok || !d.settings) return;
        var s = d.settings;
        var next = {
          youtube: s.social_youtube || SOCIAL.youtube,
          tiktok: s.social_tiktok || SOCIAL.tiktok,
          facebook: s.social_facebook || SOCIAL.facebook,
          instagram: s.social_instagram || SOCIAL.instagram,
        };
        window.RM_SOCIAL = next;
        applySocialLinks(next);
      })
      .catch(function () { /* fallback المحلّي يكفي */ });
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
    if (path.indexOf("/teacher") === 0) {
      if (!user) { location.href = "/login?role=teacher"; return; }
      if (user.role !== "teacher" && user.role !== "admin") { location.href = "/"; return; }
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
