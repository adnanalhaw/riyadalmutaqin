-- المرحلة ٢: المصادقة — جدول تحديد المحاولات + حسابات تجريبية

-- تتبّع محاولات الدخول (للحدّ من التخمين/brute force)
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT,
  email      TEXT,
  success    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_ip ON login_attempts(ip, created_at);

-- حسابات تجريبية (للاختبار فقط — تُحذف/تُغيّر كلماتها قبل الإطلاق).
-- المعلّم:  teacher@riyad.test  /  riyad-teacher
-- المتعلّم: student@riyad.test  /  riyad-student
INSERT OR IGNORE INTO users (name, email, password_hash, role, email_verified)
VALUES
  ('معلّم تجريبي', 'teacher@riyad.test',
   'pbkdf2:100000:m5AWGfZAVV87AaBY9X7zhg==:dT0c4uL/PBKsw3KugkZWyozbnfJodVnQKEUWbFQvlBc=',
   'teacher', 1),
  ('متعلّم تجريبي', 'student@riyad.test',
   'pbkdf2:100000:cPDS07IltvjeGRTbrox82w==:+mUHU5AsHi6gxZeTvxFlgnwiByqBCK3cNNv06wyFL4M=',
   'student', 1);
