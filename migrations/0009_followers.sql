-- نظام المتابعة + تحليلات المحتوى (متابعون، مشاهدات، تحميلات لكل مقطع)
-- الطلاب يتابعون المعلّمين؛ كل معلّم يرى متابعيه وأداء مقاطعه.

-- صاحب المقطع (المعلّم الذي أنشأه) — يربط المقاطع بلوحة المعلّم.
ALTER TABLE clips ADD COLUMN author_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_clips_author ON clips(author_id);

-- أحداث المحتوى: مشاهدة/تحميل لكل مقطع (مع زائر مجهول أو مستخدم مسجَّل).
CREATE TABLE IF NOT EXISTS content_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  clip_id    INTEGER NOT NULL,
  kind       TEXT    NOT NULL,            -- 'view' | 'download'
  user_id    INTEGER,                     -- المستخدم المسجَّل إن وُجد
  visitor_id TEXT,                         -- معرّف الزائر (كوكي rvid) للأشخاص المجهولين
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_content_events_clip ON content_events(clip_id, kind);
CREATE INDEX IF NOT EXISTS idx_content_events_created ON content_events(created_at);

-- المتابعة: طالبٌ (follower) يتابع معلّماً (teacher).
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL,
  teacher_id  INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, teacher_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_teacher ON follows(teacher_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
