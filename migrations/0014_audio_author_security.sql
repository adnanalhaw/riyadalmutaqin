-- تحصينات أمان: ربط الصوتيات بصاحبها لمنع تعديل/حذف معلّمٍ لمحتوى غيره (IDOR).
ALTER TABLE audio_posts ADD COLUMN author_id INTEGER;
ALTER TABLE audio_posts ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE audio_posts ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1;
