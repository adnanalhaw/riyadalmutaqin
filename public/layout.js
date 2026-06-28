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

  var links = [
    { href: "/", label: "الرئيسية" },
    { href: "/live", label: "الدروس المباشرة" },
    { href: "/clips", label: "مكتبة المقاطع" },
    { href: "/audio", label: "المكتبة الصوتية" },
    { href: "/about", label: "عن الموقع" },
  ];

  function isActive(href) {
    if (href === "/") return path === "/";
    return path.indexOf(href) === 0;
  }

  function authArea(user) {
    if (user) {
      var home = user.role === "teacher" || user.role === "admin" ? "/teacher" : "/account";
      return (
        '<a class="btn btn-ghost" href="' + home + '">حسابي</a>' +
        '<a class="btn btn-outline" href="#" id="logoutBtn">خروج</a>'
      );
    }
    return '<a class="btn btn-outline" href="/login">دخول</a>';
  }

  function render(user) {
    var navHtml =
      '<header class="site-header"><nav class="container nav">' +
      '<a class="brand" href="/"><img class="logo" src="/assets/logo.png" alt=""><span>' + SITE + "</span></a>" +
      '<ul class="nav-links">' +
      links
        .map(function (l) {
          return '<li><a class="' + (isActive(l.href) ? "active" : "") + '" href="' + l.href + '">' + l.label + "</a></li>";
        })
        .join("") +
      "</ul>" +
      '<span style="display:flex;gap:.5rem">' + authArea(user) + "</span>" +
      "</nav></header>";

    var year = new Date().getFullYear();
    var footHtml =
      '<footer class="site-footer"><div class="container">' +
      '<div class="share"><a class="btn btn-outline" href="/share">✦ شارِك الصفحة</a></div>' +
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

    // حماية صفحات المعلّم على جهة العميل (الحماية الفعلية على الـ API).
    if (path.indexOf("/teacher") === 0) {
      if (!user) { location.href = "/login?role=teacher"; return; }
      if (user.role !== "teacher" && user.role !== "admin") { location.href = "/"; return; }
    }
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
