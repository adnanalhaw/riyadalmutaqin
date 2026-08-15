// شريط جانبي مشترك للوحة مدير الموقع — يُحقن في كل صفحة (نقطة صيانة واحدة).
(function () {
  "use strict";
  var path = location.pathname.replace(/index\.html$/, "").replace(/\.html$/, "");
  if (path.length > 1) path = path.replace(/\/$/, "");

  var links = [
    { href: "/manager", label: "📊 لوحة القيادة", exact: true },
    { href: "/manager/applications", label: "📝 طلبات التعليم" },
    { href: "/manager/approvals", label: "✅ الموافقة على المحتوى" },
    { href: "/manager/mosques", label: "🏛️ طلبات مساجد Pro" },
    { href: "/manager/training", label: "🤖 مراجعة بيانات التدريب" },
    { href: "/manager/settings", label: "⚙️ إعدادات الموقع" },
    { href: "/manager/analytics", label: "📈 تحليل البيانات" },
  ];

  function active(l) {
    return l.exact ? path === "/manager" : path.indexOf(l.href) === 0;
  }

  function render(counts) {
    counts = counts || {};
    var badges = {
      "/manager/applications": counts.pending_apps,
      "/manager/approvals": (counts.pending_clips || 0) + (counts.pending_lessons || 0) + (counts.pending_posts || 0) + (counts.pending_audio || 0),
      "/manager/training": counts.pending_docs,
      "/manager/mosques": counts.pending_mosque_pro,
    };
    function ar(n) { return String(n).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; }); }
    var html = "<h4>مدير الموقع</h4>" + links.map(function (l) {
      var c = badges[l.href];
      var badge = c ? ' <span class="badge" style="background:var(--gold);color:#2a1f04;font-size:.72rem">' + ar(c) + "</span>" : "";
      return '<a class="' + (active(l) ? "active" : "") + '" href="' + l.href + '">' + l.label + badge + "</a>";
    }).join("");
    var el = document.querySelector("[data-manager-nav]");
    if (el) el.innerHTML = html;
  }

  render();
  fetch("/api/manager/dashboard", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.ok) render(d.stats); })
    .catch(function () {});
})();
