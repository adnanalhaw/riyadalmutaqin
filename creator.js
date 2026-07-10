/* ===== رياض المتقين — أدوات صانع المحتوى =====
   مكتبة المحتوى + جدولة النشر (بموافقة صاحب المحتوى) + الإرسال عبر Webhooks.
   البيانات على جهاز صاحب الحساب (localStorage) — لا خادم لنا ولا كلمات مرور منصّات. */

function libGet() { try { return JSON.parse(localStorage.getItem("rm_library") || "[]"); } catch { return []; } }
function libSave(v) { localStorage.setItem("rm_library", JSON.stringify(v)); }
function schedGet() { try { return JSON.parse(localStorage.getItem("rm_schedule") || "[]"); } catch { return []; } }
function schedSave(v) { localStorage.setItem("rm_schedule", JSON.stringify(v)); }
function hooksGet() { try { return JSON.parse(localStorage.getItem("rm_webhooks") || "{}"); } catch { return {}; } }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmtWhen(iso) {
  try { return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)); }
  catch { return iso; }
}

/* نص المنشور الجاهز */
function captionOf(item) {
  return `${item.title ? item.title + " " : ""}${item.name}\n${item.subject}\n` +
         `${item.badge ? "🎧 مقطع صوتي\n" : ""}#رياض_المتقين · riyadalmutaqin.com`;
}

/* توليد صورة بمقاس منصّة محدّدة من عنصر مكتبة (يعيد dataURL) */
function renderItemImage(item, platformKey) {
  const p = PLATFORMS.find((x) => x.key === platformKey) || PLATFORMS[0];
  const canvas = document.createElement("canvas");
  drawPost(canvas, p, { title: item.title, name: item.name, subject: item.subject, audioBadge: item.badge, style: item.style || "classic" });
  return { dataUrl: canvas.toDataURL("image/png"), canvas };
}

/* نشر مباشر إلى قناة تيليغرام عبر Bot API (يدعم النداء من المتصفح) */
async function publishTelegram(item) {
  let cfg = null;
  try { cfg = JSON.parse(localStorage.getItem("rm_telegram") || "null"); } catch { }
  if (!cfg || !cfg.token || !cfg.chat) throw new Error("اضبط بوت تيليغرام من صفحة الربط والنشر أولاً.");
  const { canvas } = renderItemImage(item, "telegram");
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  const form = new FormData();
  form.append("chat_id", cfg.chat);
  form.append("caption", captionOf(item));
  form.append("photo", blob, "riyad.png");
  const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendPhoto`, { method: "POST", body: form });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(out.description || "HTTP " + res.status);
}

/* إرسال عنصر لمنصّة عبر Webhook المحفوظ */
async function publishItem(item, platformKey) {
  await ensureFonts();
  if (platformKey === "telegram") return publishTelegram(item); // مباشر عبر البوت
  const hooks = hooksGet();
  const url = hooks[platformKey];
  if (!url) throw new Error("لا يوجد ربط لهذه المنصّة — اضبطه من صفحة الربط والنشر.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform: platformKey,
      title: item.title, name: item.name, subject: item.subject,
      caption: captionOf(item),
      imageDataUrl: renderItemImage(item, platformKey).dataUrl,
      sentAt: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
}

/* ===== المكتبة ===== */
function saveCurrentDesignToLibrary() {
  const item = {
    id: uid(),
    title: $("st-title").value.trim(),
    name: $("st-name").value.trim(),
    subject: $("st-subject").value.trim(),
    badge: $("st-audio").checked,
    style: (document.querySelector(".style-card.active") || {}).dataset?.style || "classic",
    createdAt: new Date().toISOString(),
    views: null, likes: null, publishedAt: null,
  };
  if (!item.name && !item.subject) { toast("اكتب الاسم والعنوان أولاً", "err"); return; }
  const lib = libGet(); lib.unshift(item); libSave(lib);
  renderLibrary(); renderSchedule(); // تحديث قائمة اختيار المحتوى في الجدولة أيضاً
  toast("حُفظ في مكتبة المحتوى 💾", "ok");
}

function renderLibrary() {
  const wrap = $("library-list");
  if (!wrap) return;
  const lib = libGet();
  if (!lib.length) { wrap.innerHTML = '<p class="xsmall muted center">مكتبتك فارغة — صمّم بوستاً واضغط «حفظ في المكتبة».</p>'; return; }
  wrap.innerHTML = lib.map((it) => `
    <div class="card" style="margin-bottom:.7rem">
      <div class="row between">
        <b class="gold small">${it.title || ""} ${it.name}</b>
        <span class="xsmall muted">${fmtWhen(it.createdAt)}</span>
      </div>
      <p class="small" style="margin:.25rem 0">${it.subject}</p>
      <div class="row gap" style="flex-wrap:wrap">
        <button class="btn btn-sm" data-lib-load="${it.id}">فتح بالاستوديو 🎨</button>
        <button class="btn btn-sm" data-lib-sched="${it.id}">جدولة 🗓️</button>
        <button class="btn btn-sm" data-lib-del="${it.id}" style="border-color:var(--danger); color:var(--danger)">حذف</button>
      </div>
      <div class="row gap" style="margin-top:.5rem">
        <input type="number" min="0" placeholder="مشاهدات" value="${it.views ?? ""}" data-lib-views="${it.id}" style="direction:ltr">
        <input type="number" min="0" placeholder="تفاعل" value="${it.likes ?? ""}" data-lib-likes="${it.id}" style="direction:ltr">
        <button class="btn btn-sm" data-lib-stat="${it.id}">تحديث الأداء</button>
      </div>
      <p class="xsmall muted" style="margin-top:.3rem">سجّل أرقام أدائه بعد النشر — تغذّي لوحة التحليلات.</p>
    </div>`).join("");
}

/* ===== الجدولة ===== */
function renderSchedule() {
  const wrap = $("schedule-list");
  if (!wrap) return;
  const sched = schedGet().sort((a, b) => a.when.localeCompare(b.when));
  const lib = libGet();
  const sel = $("sch-item");
  if (sel) sel.innerHTML = lib.length
    ? lib.map((it) => `<option value="${it.id}">${(it.title || "") + " " + it.name} — ${it.subject.slice(0, 30)}</option>`).join("")
    : '<option value="">المكتبة فارغة — احفظ تصميماً أولاً</option>';
  if (!sched.length) { wrap.innerHTML = '<p class="xsmall muted center">لا جدولة بعد.</p>'; return; }
  wrap.innerHTML = sched.map((s) => {
    const it = lib.find((x) => x.id === s.libId);
    const due = !s.sentAt && new Date(s.when) <= new Date();
    return `<div class="card" style="margin-bottom:.7rem; ${due ? "border-color:var(--gold-2)" : ""}">
      <div class="row between">
        <b class="small gold">${it ? it.name + " — " + it.subject.slice(0, 26) : "عنصر محذوف"}</b>
        <span class="xsmall ${s.sentAt ? "" : due ? "gold" : "muted"}">${s.sentAt ? "✓ أُرسل" : due ? "⏰ مستحق الآن" : fmtWhen(s.when)}</span>
      </div>
      <p class="xsmall muted">المنصّات: ${s.platforms.join("، ")} · الموافقة: ${s.approved ? "✓ موافَق" : "✗ بانتظار موافقتك"}</p>
      <div class="row gap" style="flex-wrap:wrap; margin-top:.4rem">
        ${!s.approved && !s.sentAt ? `<button class="btn btn-sm btn-gold" data-sch-approve="${s.id}">أوافق على النشر ✓</button>` : ""}
        ${s.approved && !s.sentAt && it ? `<button class="btn btn-sm btn-blue" data-sch-send="${s.id}">أرسل الآن ⚡</button>` : ""}
        ${!s.sentAt ? `<button class="btn btn-sm" data-sch-del="${s.id}" style="border-color:var(--danger); color:var(--danger)">إلغاء</button>` : ""}
      </div>
      <p class="xsmall" id="sch-st-${s.id}" style="min-height:.9rem; margin-top:.3rem"></p>
    </div>`;
  }).join("");
  // تنبيه المستحق
  const due = sched.filter((s) => s.approved && !s.sentAt && new Date(s.when) <= new Date());
  const banner = $("due-banner");
  if (banner) banner.classList.toggle("hidden", due.length === 0);
}

function addSchedule() {
  const libId = $("sch-item").value;
  const when = $("sch-when").value;
  const platforms = Array.from(document.querySelectorAll("[data-sch-plat]:checked")).map((c) => c.dataset.schPlat);
  if (!libId) { toast("احفظ تصميماً في المكتبة أولاً", "err"); return; }
  if (!when) { toast("اختر موعد النشر", "err"); return; }
  if (!platforms.length) { toast("اختر منصّة واحدة على الأقل", "err"); return; }
  const sched = schedGet();
  sched.push({ id: uid(), libId, when: new Date(when).toISOString(), platforms, approved: $("sch-approve").checked, sentAt: null });
  schedSave(sched); renderSchedule();
  toast("أُضيفت للجدولة 🗓️", "ok");
}

/* الإرسال الفعلي لعنصر مجدول (كل منصّاته) */
async function sendScheduled(id) {
  const sched = schedGet();
  const s = sched.find((x) => x.id === id);
  const it = libGet().find((x) => x.id === s.libId);
  const st = $("sch-st-" + id);
  if (!s || !it) return;
  let ok = 0, fails = [];
  for (const p of s.platforms) {
    st.textContent = "جارٍ الإرسال إلى " + p + "…";
    try { await publishItem(it, p); ok++; }
    catch (e) { fails.push(p + " (" + e.message + ")"); }
  }
  if (ok > 0) {
    s.sentAt = new Date().toISOString(); schedSave(sched);
    const lib = libGet(); const li = lib.find((x) => x.id === it.id);
    if (li && !li.publishedAt) { li.publishedAt = s.sentAt; libSave(lib); }
  }
  renderSchedule();
  toast(fails.length ? "أُرسل لـ" + ok + " ورفضت: " + fails.join("، ") : "نُشر بنجاح على كل المنصّات ✅", fails.length ? "err" : "ok");
}

/* ===== الربط بالواجهة ===== */
function mountCreator() {
  const saveBtn = $("st-save-lib");
  if (saveBtn) saveBtn.addEventListener("click", saveCurrentDesignToLibrary);
  const addBtn = $("sch-add");
  if (addBtn) addBtn.addEventListener("click", addSchedule);

  document.addEventListener("click", async (e) => {
    const d = e.target.dataset || {};
    if (d.libLoad) {
      const it = libGet().find((x) => x.id === d.libLoad);
      if (it) {
        $("st-title").value = it.title; $("st-name").value = it.name;
        $("st-subject").value = it.subject; $("st-audio").checked = it.badge;
        renderAll(); $("sec-studio").scrollIntoView({ behavior: "smooth" });
        toast("فُتح في الاستوديو 🎨", "ok");
      }
    }
    if (d.libDel) { libSave(libGet().filter((x) => x.id !== d.libDel)); renderLibrary(); renderSchedule(); }
    if (d.libStat) {
      const lib = libGet(); const it = lib.find((x) => x.id === d.libStat);
      if (it) {
        it.views = parseInt(document.querySelector(`[data-lib-views="${d.libStat}"]`).value, 10) || null;
        it.likes = parseInt(document.querySelector(`[data-lib-likes="${d.libStat}"]`).value, 10) || null;
        if (it.views && !it.publishedAt) it.publishedAt = new Date().toISOString();
        libSave(lib); toast("حُدّث الأداء 📊", "ok");
      }
    }
    if (d.libSched) {
      const sel = $("sch-item"); if (sel) { sel.value = d.libSched; $("sec-schedule").scrollIntoView({ behavior: "smooth" }); }
    }
    if (d.schApprove) {
      const sched = schedGet(); const s = sched.find((x) => x.id === d.schApprove);
      if (s) { s.approved = true; schedSave(sched); renderSchedule(); toast("تمّت موافقتك ✓", "ok"); }
    }
    if (d.schDel) { schedSave(schedGet().filter((x) => x.id !== d.schDel)); renderSchedule(); }
    if (d.schSend) sendScheduled(d.schSend);
  });

  renderLibrary();
  renderSchedule();
}
