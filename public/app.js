// سكربت بسيط للموقع العام — يُوسَّع في المراحل التالية.
(function () {
  "use strict";

  // سنة التذييل.
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // تأكيد جاهزية الواجهة الخلفية (نقطة الصحّة) — للتشخيص فقط.
  fetch("/api/health")
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (data) {
      if (data && data.ok) {
        console.info("الواجهة الخلفية جاهزة:", data.service);
      }
    })
    .catch(function () {
      /* الموقع العام يعمل بدون الـ API أيضاً */
    });
})();
