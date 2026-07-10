/* ===== رياض المتقين — الدخول والصلاحيات =====
   أربعة أدوار: متعلم · معلم · مدير الموقع · مدير النظام.

   ⚠️ حدود أمان صريحة (بلا مبالغة): هذا موقع ثابت بلا خادم، فالتحقّق يجري في المتصفح
   ببصمة SHA-256 (البريد:كلمة المرور). كلمات المرور نفسها ليست هنا ولا في المستودع —
   فقط بصماتها، ولا يمكن عكسها. هذا يمنع الدخول العابر ويكفي لأدوات لوحة لا تحمل
   بيانات حسّاسة؛ الحماية المصرفية الحقيقية تتطلّب خادماً (Cloudflare Worker) لاحقاً.

   🔑 لتغيير كلمة مرور نهائياً: مدير النظام → «مولّد البصمة» في لوحته، ثم استبدل
   البصمة hash هنا وارفع التعديل إلى GitHub. */

const ROLES = {
  student:  { label: "متعلم",       icon: "🎓" },
  teacher:  { label: "معلم",        icon: "📖" },
  admin:    { label: "مدير الموقع", icon: "🛠️" },
  sysadmin: { label: "مدير النظام", icon: "👑" },
};

const USERS = [
  { email: "student@riyadalmutaqin.com", role: "student",
    hash: "d3c6f4bfd67e8fafb7cdecbec16438524aef4fac0f39dda7817b8014f042e984" },
  { email: "teacher@riyadalmutaqin.com", role: "teacher",
    hash: "61f838cf801f1e3103672d89aa670a87ba4cae7702573bcbd4e699dea69ea0dd" },
  { email: "admin@riyadalmutaqin.com", role: "admin",
    hash: "35c7fa4f92c67db4fa7180f1af69ea640d332300757cd2f79842a5ef2907ac40" },
  { email: "ryadalmtqyn@gmail.com", role: "sysadmin",
    hash: "5b0b6171909c748e28568a8821c4a339fe26e7eb670ce6246967266ac18fa813" },
];

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* دخول: يتحقّق من البريد + كلمة المرور + (اختيارياً) الدور المختار */
async function login(email, password, expectedRole, remember) {
  email = String(email || "").trim().toLowerCase();
  const user = USERS.find((u) => u.email === email);
  if (!user) return { ok: false, error: "البريد أو كلمة المرور غير صحيحة." };
  const hash = await sha256Hex(email + ":" + password);
  if (hash !== user.hash) return { ok: false, error: "البريد أو كلمة المرور غير صحيحة." };
  if (expectedRole && user.role !== expectedRole) {
    return { ok: false, error: "هذا الحساب دوره «" + ROLES[user.role].label + "» — اختر التبويب الصحيح." };
  }
  const session = { email: user.email, role: user.role, at: Date.now() };
  (remember ? localStorage : sessionStorage).setItem("rm_session", JSON.stringify(session));
  return { ok: true, session };
}

function getSession() {
  try {
    const raw = sessionStorage.getItem("rm_session") || localStorage.getItem("rm_session");
    const s = raw ? JSON.parse(raw) : null;
    return s && ROLES[s.role] ? s : null;
  } catch { return null; }
}

function logout() {
  sessionStorage.removeItem("rm_session");
  localStorage.removeItem("rm_session");
  location.href = "index.html";
}

/* حارس الصفحات المحمية: يعيد الجلسة أو يحوّل لصفحة الدخول */
function requireSession() {
  const s = getSession();
  if (!s) { location.href = "login.html"; return null; }
  return s;
}
