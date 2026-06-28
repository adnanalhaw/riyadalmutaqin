-- المرحلة ٩: توسيع حالات channel_posts لتشمل 'queued'
-- (محفوظ في قائمة الإصدار للقنوات التي لم يُربط تسليمها التلقائي بعد).
-- SQLite لا يدعم تعديل قيد CHECK مباشرةً، فنعيد بناء الجدول مع نقل البيانات.

CREATE TABLE channel_posts_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  content      TEXT,
  media_url    TEXT,
  channels     TEXT,                 -- JSON: ["youtube","tiktok",...]
  scheduled_at TEXT,
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','queued','scheduled','published','failed')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO channel_posts_new (id, author_id, content, media_url, channels, scheduled_at, status, created_at)
  SELECT id, author_id, content, media_url, channels, scheduled_at, status, created_at FROM channel_posts;

DROP TABLE channel_posts;
ALTER TABLE channel_posts_new RENAME TO channel_posts;
