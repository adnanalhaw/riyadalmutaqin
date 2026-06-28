// هيكل مشترك: ترويسة وتذييل يُحقنان في كل صفحة لتوحيد الشكل.
(function () {
  "use strict";

  var SITE = "رياض المتقين";
  var path = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  if (path === "") path = "/";

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

  var navHtml =
    '<header class="site-header"><nav class="container nav">' +
    '<a class="brand" href="/"><img class="logo" src="/assets/logo.svg" alt=""><span>' + SITE + "</span></a>" +
    '<ul class="nav-links">' +
    links
      .map(function (l) {
        return '<li><a class="' + (isActive(l.href) ? "active" : "") + '" href="' + l.href + '">' + l.label + "</a></li>";
      })
      .join("") +
    "</ul>" +
    '<a class="btn btn-outline" href="/login">دخول</a>' +
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
})();
