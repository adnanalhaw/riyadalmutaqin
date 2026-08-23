-- ربط حسابات Meta (صفحة فيسبوك + حساب انستقرام أعمال) لكل مستخدم مخوّل
-- (مدير الموقع/المعلّم/الأدمن). التوكن المحفوظ هو Page Access Token طويل الأمد
-- الناتج عن تدفّق OAuth الرسمي — لا كلمات مرور إطلاقاً.
CREATE TABLE IF NOT EXISTS meta_accounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id      TEXT,
  page_name    TEXT,
  page_token   TEXT,          -- Page Access Token (طويل الأمد) — به يُنشَر
  user_token   TEXT,          -- توكن المستخدم طويل الأمد — به نُعيد سرد صفحاته لتبديلها
  ig_user_id   TEXT,          -- حساب انستقرام الأعمال المرتبط بالصفحة (إن وُجد)
  ig_username  TEXT,
  token_expiry TEXT,          -- تاريخ انتهاء تقديري (توكن الصفحة غالباً بلا انتهاء)
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id)
);

-- سجلّ تسليم لكل منشور: أي قناة نجحت وأيها فشلت ولماذا (JSON) — شفافية للمشغّل.
ALTER TABLE channel_posts ADD COLUMN delivery TEXT;
-- معرّف حاوية انستقرام حين لا يكتمل رفع الفيديو داخل الطلب (يُكمله مشغّل cron).
ALTER TABLE channel_posts ADD COLUMN ig_creation_id TEXT;
