// شريط جانبي مشترك للوحة الأدمن — يُحقن في كل صفحة.
(function () {
  "use strict";
  var path = location.pathname.replace(/index\.html$/, "").replace(/\.html$/, "");
  if (path.length > 1) path = path.replace(/\/$/, "");

  var links = [
    { href: "/admin", label: "📊 لوحة النظام", exact: true },
    { href: "/admin/support", label: "🎫 الدعم والطلبات" },
    { href: "/admin/logins", label: "🕒 سجلّ الدخول" },
    { href: "/admin/users", label: "👥 المستخدمون والأدوار" },
    { href: "/manager", label: "🗂️ طلبات وموافقات (مدير)" },
  ];

  function active(l) { return l.exact ? path === "/admin" : path.indexOf(l.href) === 0; }

  function render(counts) {
    counts = counts || {};
    function ar(n) { return String(n).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; }); }
    var badges = { "/admin/support": counts.open_tickets };
    var html = "<h4>لوحة الأدمن</h4>" + links.map(function (l) {
      var c = badges[l.href];
      var badge = c ? ' <span class="badge" style="background:var(--gold);color:#2a1f04;font-size:.72rem">' + ar(c) + "</span>" : "";
      return '<a class="' + (active(l) ? "active" : "") + '" href="' + l.href + '">' + l.label + badge + "</a>";
    }).join("");
    var el = document.querySelector("[data-admin-nav]");
    if (el) el.innerHTML = html;
  }

  render();
  fetch("/api/admin/overview", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.ok) render(d.stats); })
    .catch(function () {});
})();
