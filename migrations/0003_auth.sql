-- المرحلة ٢: المصادقة — جدول تحديد المحاولات

-- تتبّع محاولات الدخول (للحدّ من التخمين/brute force)
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT,
  email      TEXT,
  success    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_ip ON login_attempts(ip, created_at);

-- ملاحظة أمنيّة: أُزيلت الحسابات التجريبية (teacher@riyad.test / student@riyad.test)
-- لأنّ كلماتها كانت معروفةً في الشيفرة. لا تُنشَأ حسابات بكلمات مرور عبر الترحيلات أبداً.
