// مُهيّئ صفحة نوعٍ من الزكاة (ذهب/فضّة/أسهم/عروض تجارة): يربط الإدخال بقاعدة البيانات
// ويحسب القيمة والنِّصاب والحَوْل وموعد الاستحقاق ومقدار الزكاة.
ZK.holdingPage = function (cfg) {
  // cfg: { kind, mode:'grams'|'value', qtyLabel, valueOf(qty), nisabValue(), reached(qty,value), nisabHint() }
  var k = cfg.kind;

  function el(id) { return document.getElementById(id); }
  function num(id) { return parseFloat(el(id).value) || 0; }

  ZK.boot(function () {
    window.__zkRecompute = compute;
    var sb = document.getElementById("settingsBar");
    if (sb) ZK.pricesCard(sb);
    document.getElementById("qtyLabel").textContent = cfg.qtyLabel;
    var h = ZK.state.holdings[k] || {};
    if (cfg.mode === "grams" && h.grams != null) el("qty").value = h.grams;
    if (cfg.mode === "value" && h.value != null) el("qty").value = h.value;
    if (h.hawl_start) el("hawl").value = h.hawl_start;
    if (h.note) el("note").value = h.note;
    compute();
  });

  function compute() {
    var qty = num("qty");
    var value = cfg.valueOf(qty);
    var nis = cfg.nisabValue();
    var reached = cfg.reached(qty, value);
    var hawl = ZK.hawl(el("hawl").value);
    var zakat = reached && hawl.complete ? value * 0.025 : 0;
    var expected = reached ? value * 0.025 : 0;

    el("r_value").textContent = ZK.money(value);
    el("r_nisab").textContent = nis ? ZK.money(nis) : (cfg.nisabHint ? cfg.nisabHint() : "أدخِل السعر");
    el("r_reached").textContent = !nis && cfg.mode === "value" ? "—" : (reached ? "نعم ✓" : "لا، دون النِّصاب");
    el("r_due").textContent = ZK.dueText(hawl);
    el("r_zakat").textContent = ZK.money(zakat);
    var note = el("r_note");
    if (note) {
      note.textContent = !reached ? "مالُك دون النِّصاب، فلا زكاة." :
        (hawl.complete ? "استحقّت زكاتُك. أخرِجها مبارَكاً لك." :
          (hawl.has ? "الزكاة المتوقّعة عند تمام الحَوْل ≈ " + ZK.money(expected) : "حدّد تاريخ بدء الحَوْل (يوم بلوغك النِّصاب)."));
    }
  }

  el("qty").addEventListener("input", compute);
  el("hawl").addEventListener("change", compute);

  el("save").addEventListener("click", function () {
    var data = { hawl_start: el("hawl").value, note: el("note").value.trim() };
    if (cfg.mode === "grams") data.grams = num("qty"); else data.value = num("qty");
    el("save").disabled = true;
    var msg = el("saveMsg"); msg.hidden = false; msg.textContent = "جارٍ الحفظ…";
    ZK.saveHolding(k, data).then(function (res) {
      el("save").disabled = false;
      msg.textContent = (res.ok && res.d.ok) ? "حُفظ في حسابك ✓" : "تعذّر الحفظ.";
      compute();
    }).catch(function () { el("save").disabled = false; msg.textContent = "تعذّر الاتصال."; });
  });
};
