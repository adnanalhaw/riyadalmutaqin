/* ===== رياض المتقين — المنطق المشترك =====
   الروابط الحقيقية للمنصّات في مكان واحد (SITE) — عدّلها هنا فتتحدّث في كل الموقع. */

const SITE = {
  name: "رياض المتقين",
  domain: "riyadalmutaqin.com",
  supportEmail: "ryadalmtqyn@gmail.com",
  links: {
    youtube: "https://www.youtube.com/@رياضالمتقين-س1ر",
    tiktok: "https://www.tiktok.com/@reyad.almutqyan",
    facebook: "https://www.facebook.com/profile.php?id=61586546952951",
    // الروابط التالية لم تُزوَّد بعد — حدّثها هنا عند إنشائها:
    instagram: "",
    x: "",
    telegram: "",
  },
};

/* ===== أدوات صغيرة ===== */
function $(id) { return document.getElementById(id); }

function toast(msg, kind) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.className = "toast" + (kind ? " " + kind : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* شعار مع بديل تلقائي إن غاب ملف logo.png */
function mountLogos() {
  document.querySelectorAll("img.logo").forEach((img) => {
    img.addEventListener("error", () => {
      const fb = document.createElement("div");
      fb.className = "logo-fallback";
      fb.textContent = "رياض";
      img.replaceWith(fb);
    });
  });
}

/* ===== الترجمة — أيقونة العالم 🌍 =====
   القائمة تفتح وتغلق فوراً (لا تعليق): مجرّد إظهار/إخفاء وتبديل نصوص من قاموس. */
const I18N = {
  ar: { dir: "rtl", label: "العربية" },
  en: { dir: "ltr", label: "English" },
};
const STRINGS = {
  "nav.login": { ar: "دخول", en: "Login" },
  "nav.logout": { ar: "خروج", en: "Logout" },
  "cta.title": { ar: "ابدأ رحلتك نحو العلم", en: "Start your journey to knowledge" },
  "cta.sub": { ar: "أربع محطات بسيطة — خطوة كل يوم تكفي", en: "Four simple stations — one step a day" },
  "tools.title": { ar: "أدوات المسلم", en: "Muslim tools" },
  "tools.sub": { ar: "السبحة · الأذكار · التاريخ الهجري", en: "Tasbih · Adhkar · Hijri date" },
  "hero.youtube": { ar: "يوتيوب", en: "YouTube" },
  "hero.youtube.sub": { ar: "شاهد الدروس والمحاضرات", en: "Watch lessons & lectures" },
  "hero.tiktok": { ar: "تيك توك", en: "TikTok" },
  "hero.tiktok.sub": { ar: "مقاطع قصيرة نافعة", en: "Short beneficial clips" },
  "hero.facebook": { ar: "فيسبوك", en: "Facebook" },
  "hero.facebook.sub": { ar: "تابعنا على صفحة الفيسبوك", en: "Follow our Facebook page" },
  "verse.text": {
    ar: "﴿ وَذَكِّرْ فَإِنَّ الذِّكْرَى تَنفَعُ الْمُؤْمِنِينَ ﴾",
    en: "“And remind, for indeed the reminder benefits the believers.”",
  },
  "verse.ref": { ar: "سورة الذاريات · 55", en: "Surah Adh-Dhariyat · 55" },
  "act.share": { ar: "شارك الصفحة", en: "Share the page" },
  "act.share.sub": { ar: "شارك الخير مع أصدقائك", en: "Share goodness with friends" },
  "act.teach": { ar: "التدريس معنا", en: "Teach with us" },
  "act.teach.sub": { ar: "كن جزءًا من رسالتنا", en: "Be part of our mission" },
  "act.privacy": { ar: "سياسة الخصوصية", en: "Privacy policy" },
  "act.privacy.sub": { ar: "قراءة سياسة الخصوصية", en: "Read our privacy policy" },
  "act.support": { ar: "تواصل مع الدعم", en: "Contact support" },
  "act.support.sub": { ar: "نحن هنا لمساعدتك", en: "We are here to help" },
  "footer.rights": { ar: "رياض المتقين © 2026 · جميع الحقوق محفوظة", en: "Riyad Al-Mutaqin © 2026 · All rights reserved" },
};

function currentLang() {
  const saved = localStorage.getItem("rm_lang");
  return I18N[saved] ? saved : "ar";
}

function applyLang(lang) {
  if (!I18N[lang]) lang = "ar";
  localStorage.setItem("rm_lang", lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = I18N[lang].dir;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const entry = STRINGS[el.dataset.i18n];
    if (entry && entry[lang]) el.textContent = entry[lang];
  });
  document.querySelectorAll(".lang-menu button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
}

function mountLangMenu() {
  const btn = $("lang-btn");
  const menu = $("lang-menu");
  if (!btn || !menu) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("hidden");
  });
  menu.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      applyLang(b.dataset.lang);
      menu.classList.add("hidden");
    });
  });
  // إغلاق عند النقر خارج القائمة أو بزر Escape — لا شيء يعلّق الشاشة
  document.addEventListener("click", () => menu.classList.add("hidden"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.classList.add("hidden"); });
  applyLang(currentLang());
}

/* ===== قائمة التنقّل (☰) ===== */
function mountNavMenu() {
  const btn = $("nav-btn");
  const menu = $("nav-menu");
  if (!btn || !menu) return;
  btn.addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("hidden"); });
  const here = location.pathname.split("/").pop() || "index.html";
  menu.querySelectorAll("[data-go]").forEach((b) => {
    b.classList.toggle("active", b.dataset.go === here); // الصفحة الحالية بالأزرق الملكي
    b.addEventListener("click", () => { location.href = b.dataset.go; });
  });
  document.addEventListener("click", () => menu.classList.add("hidden"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.classList.add("hidden"); });
}

/* ===== مشاركة الصفحة ===== */
async function sharePage() {
  const data = { title: SITE.name, text: "قناة رياض المتقين — العلم النافع من الكتاب والسنّة", url: "https://" + SITE.domain };
  try {
    if (navigator.share) { await navigator.share(data); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  try {
    await navigator.clipboard.writeText(data.url);
    toast("نُسخ رابط الموقع — شاركه مع أصدقائك 🌿", "ok");
  } catch {
    prompt("انسخ الرابط:", data.url);
  }
}

/* ===== النوافذ المنبثقة ===== */
function openModal(id) { const m = $(id); if (m) m.classList.remove("hidden"); }
function closeModal(id) { const m = $(id); if (m) m.classList.add("hidden"); }
function mountModals() {
  document.querySelectorAll("[data-open-modal]").forEach((el) =>
    el.addEventListener("click", () => openModal(el.dataset.openModal)));
  document.querySelectorAll("[data-close-modal]").forEach((el) =>
    el.addEventListener("click", () => el.closest(".modal").classList.add("hidden")));
}

/* ===== ربط بطاقات المنصّات والإجراءات ===== */
function openLink(url, nameAr) {
  if (!url) { toast("رابط «" + nameAr + "» لم يُضَف بعد — يضيفه مدير الموقع في app.js", "err"); return; }
  window.open(url, "_blank", "noopener");
}

function mountLanding() {
  const map = [
    ["card-youtube", SITE.links.youtube, "يوتيوب"],
    ["card-tiktok", SITE.links.tiktok, "تيك توك"],
    ["card-facebook", SITE.links.facebook, "فيسبوك"],
    ["soc-youtube", SITE.links.youtube, "يوتيوب"],
    ["soc-tiktok", SITE.links.tiktok, "تيك توك"],
    ["soc-facebook", SITE.links.facebook, "فيسبوك"],
    ["soc-instagram", SITE.links.instagram, "إنستغرام"],
    ["soc-x", SITE.links.x, "إكس"],
    ["soc-telegram", SITE.links.telegram, "تيليغرام"],
    ["card-telegram", SITE.links.telegram, "تيليغرام"],
  ];
  for (const [id, url, nameAr] of map) {
    const el = $(id);
    if (!el) continue;
    if (el.tagName === "A" && url) { el.href = url; el.target = "_blank"; el.rel = "noopener"; }
    else el.addEventListener("click", (e) => { e.preventDefault(); openLink(url, nameAr); });
  }
  const share = $("act-share");
  if (share) share.addEventListener("click", sharePage);
  const teach = $("act-teach");
  if (teach) teach.addEventListener("click", () => {
    location.href = "mailto:" + SITE.supportEmail +
      "?subject=" + encodeURIComponent("طلب انضمام للتدريس — رياض المتقين") +
      "&body=" + encodeURIComponent("السلام عليكم،\nأرغب بالانضمام لفريق التدريس.\nالاسم:\nالتخصص:\nنبذة:");
  });
  const support = $("act-support");
  if (support) support.addEventListener("click", () => {
    location.href = "mailto:" + SITE.supportEmail + "?subject=" + encodeURIComponent("دعم — رياض المتقين");
  });
}

/* ===== تهيئة عامة ===== */
document.addEventListener("DOMContentLoaded", () => {
  mountLogos();
  mountLangMenu();
  mountNavMenu();
  mountModals();
  mountLanding();
});
