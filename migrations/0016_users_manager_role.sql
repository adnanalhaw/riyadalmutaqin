-- إصلاح بنيويّ: قيد role كان يمنع 'manager' فيتعذّر إنشاء حساب مدير الموقع.
-- نعيد بناء الجدول بقيدٍ يشمل المدير، مع تأجيل فحص المفاتيح الأجنبيّة حتى نهاية المعاملة.
PRAGMA defer_foreign_keys = on;

CREATE TABLE users_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','teacher','admin','manager')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_reset_at  TEXT,
  full_name       TEXT,
  birth_date      TEXT,
  education_stage TEXT,
  country         TEXT,
  city            TEXT,
  nationality     TEXT,
  occupation      TEXT
);

INSERT INTO users_new
  (id, name, email, password_hash, role, email_verified, status, created_at,
   must_change_password, last_reset_at, full_name, birth_date, education_stage,
   country, city, nationality, occupation)
SELECT
   id, name, email, password_hash, role, email_verified, status, created_at,
   must_change_password, last_reset_at, full_name, birth_date, education_stage,
   country, city, nationality, occupation
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
