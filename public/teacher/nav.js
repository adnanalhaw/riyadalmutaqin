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
  // في الاستوديو/النشر نبدّل الشريط إلى لوحتهم حتى لا يظنّوا الصفحة للمعلّم فقط.
  function swapTo(attr, src) {
    var el = document.querySelector("[data-teacher-nav]");
    if (!el) return false;
    el.removeAttribute("data-teacher-nav");
    el.setAttribute(attr, "");
    var s = document.createElement("script");
    s.src = src;
    document.body.appendChild(s);
    return true;
  }

  renderNav();
  fetch("/api/auth/me", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var role = d && d.user && d.user.role;
      var studio = path === "/teacher/editor" || path === "/teacher/publish";
      if (role === "admin") {
        if (studio && swapTo("data-admin-nav", "/admin/nav.js")) return;
        renderNav([{ href: "/admin", label: "↩ عودة للوحة الأدمن" }]);
      } else if (role === "manager") {
        if (studio && swapTo("data-manager-nav", "/manager/nav.js")) return;
        renderNav([{ href: "/manager", label: "↩ عودة للوحة المدير" }]);
      }
    })
    .catch(function () {});
})();
