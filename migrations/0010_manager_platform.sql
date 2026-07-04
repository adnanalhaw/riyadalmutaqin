-- نظام مدير الموقع: طلبات التعليم، الموافقة على المحتوى، الإشعارات،
-- بيانات تسجيل موسّعة (مفصولة حسب الدور)، وأوقات الدخول.

-- ===== بيانات المستخدم الموسّعة =====
ALTER TABLE users ADD COLUMN full_name       TEXT;  -- الاسم الكامل
ALTER TABLE users ADD COLUMN birth_date      TEXT;  -- تاريخ الميلاد YYYY-MM-DD
ALTER TABLE users ADD COLUMN education_stage TEXT;  -- المرحلة الدراسية
ALTER TABLE users ADD COLUMN country         TEXT;  -- مكان الإقامة (الدولة)
ALTER TABLE users ADD COLUMN city            TEXT;  -- المدينة
ALTER TABLE users ADD COLUMN nationality     TEXT;  -- الجنسية
ALTER TABLE users ADD COLUMN occupation      TEXT;  -- الوظيفة

-- ===== طلبات التعليم =====
CREATE TABLE IF NOT EXISTS teacher_applications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name      TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT,
  country        TEXT,
  nationality    TEXT,
  qualifications TEXT,                                -- المؤهّلات/الخبرة العلمية
  bio            TEXT,                                -- نبذة تعريفية
  sample_url     TEXT,                                -- رابط عيّنة محتوى (اختياري)
  status         TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | rejected
  notes          TEXT,                                -- ملاحظات مدير الموقع
  reviewed_by    INTEGER,
  reviewed_at    TEXT,
  user_id        INTEGER,                             -- حساب المعلّم المُنشأ عند الموافقة
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_teacher_apps_status ON teacher_applications(status);

-- ===== الموافقة على المحتوى =====
-- الافتراضي 'approved' حتى لا يختفي المحتوى الحالي (المعلّمون الحاليّون معتمدون).
-- المحتوى الجديد من المعلّمين يُضبط 'pending' في التطبيق.
ALTER TABLE clips         ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE lessons       ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE channel_posts ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE clips         ADD COLUMN reviewed_by INTEGER;
ALTER TABLE lessons       ADD COLUMN reviewed_by INTEGER;
ALTER TABLE channel_posts ADD COLUMN reviewed_by INTEGER;
ALTER TABLE lessons       ADD COLUMN author_id   INTEGER;  -- المعلّم المُنشئ (لإسناد الدرس للوحته)

-- ===== الإشعارات =====
CREATE TABLE IF NOT EXISTS notifications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_role TEXT,                                -- يصل لكل من له هذا الدور (مثل 'manager')
  recipient_id   INTEGER,                             -- أو لمستخدم بعينه
  type           TEXT NOT NULL,                       -- teacher_application | content_pending | ...
  title          TEXT NOT NULL,
  body           TEXT,
  link           TEXT,
  is_read        INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(recipient_role, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(recipient_id, is_read);

-- ===== أوقات الدخول =====
CREATE TABLE IF NOT EXISTS login_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  role       TEXT,
  country    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events(created_at);
