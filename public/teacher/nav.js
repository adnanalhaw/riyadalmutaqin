// شريط جانبي مشترك للوحة المعلّم — يُحقن في كل صفحة (نقطة صيانة واحدة).
(function () {
  "use strict";
  var path = location.pathname.replace(/index\.html$/, "").replace(/\.html$/, "");
  if (path.length > 1) path = path.replace(/\/$/, "");

  var links = [
    { href: "/teacher", label: "📊 لوحة التحكم", exact: true },
    { href: "/teacher/lessons", label: "🔴 الدروس المباشرة" },
    { href: "/teacher/editor", label: "✂ المونتاج" },
    { href: "/teacher/content", label: "📚 مكتبة المقاطع" },
    { href: "/teacher/audience", label: "👥 المتابعون والأداء" },
    { href: "/teacher/analytics", label: "📈 تحليل البيانات" },
    { href: "/teacher/publish", label: "📤 النشر على القنوات" },
  ];

  function active(l) {
    return l.exact ? path === "/teacher" : path.indexOf(l.href) === 0;
  }

  function renderNav(extra) {
    var all = links.concat(extra || []);
    var html =
      "<h4>لوحة المعلّم</h4>" +
      all
        .map(function (l) {
          return '<a class="' + (active(l) ? "active" : "") + '" href="' + l.href + '">' + l.label + "</a>";
        })
        .join("");
    var el = document.querySelector("[data-teacher-nav]");
    if (el) el.innerHTML = html;
  }

  // الأدمن له لوحته المستقلّة (/admin)؛ ومدير الموقع له لوحته (/manager).
  // نعرض رابط العودة إلى لوحة الأدمن إن كان أدمن (لأنه قد يصل لصفحات المعلّم تقنيّاً).
  renderNav();
  fetch("/api/auth/me", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.user && d.user.role === "admin") {
        renderNav([{ href: "/admin", label: "↩ لوحة الأدمن" }]);
      }
    })
    .catch(function () {});
})();
