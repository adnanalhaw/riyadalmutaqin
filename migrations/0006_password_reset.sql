-- إعادة ضبط كلمة المرور: علم إجبار تغيير الكلمة، وختم آخر طلب إعادة ضبط (للحدّ من التكرار).
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_reset_at TEXT;
