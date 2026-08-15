-- إعدادات الموقع العامة + اعتماد الصوتيات + مستندات التدريب + ملكية الدورات
-- المرحلة: اكتمال الإدارة (Phase 3)

CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- قيم ابتدائية لروابط التواصل (يمكن للمدير تعديلها من اللوحة)
INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('social_youtube', ''),
  ('social_tiktok', 'https://vt.tiktok.com/ZSarkqaDJ/'),
  ('social_facebook', 'https://www.facebook.com/profile.php?id=61586546952951'),
  ('social_instagram', 'https://www.instagram.com/almutaqyn'),
  ('site_tagline', 'القرآن والسنّة بفهم سلف الأمّة');

-- اعتماد الصوتيات: عمود المراجع
ALTER TABLE audio_posts ADD COLUMN reviewed_by INTEGER;

-- مستندات PDF للتدريب: حوكمة الاعتماد وحقوق النشر
ALTER TABLE ai_documents ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE ai_documents ADD COLUMN reviewed_by INTEGER;
ALTER TABLE ai_documents ADD COLUMN reviewed_at TEXT;
ALTER TABLE ai_documents ADD COLUMN notes TEXT;
ALTER TABLE ai_documents ADD COLUMN mime TEXT;
ALTER TABLE ai_documents ADD COLUMN bytes INTEGER;
ALTER TABLE ai_documents ADD COLUMN source_rights TEXT; -- إقرار: public_domain | publisher_permission | official

-- ملكية الدورات للمعلّم
ALTER TABLE courses ADD COLUMN author_id INTEGER;
ALTER TABLE courses ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
