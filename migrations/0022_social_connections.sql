-- ربطات التواصل لكل مستخدم (معلّم/مدير) — كلٌّ ينشر على قناته لا قناة الموقع العامة
CREATE TABLE IF NOT EXISTS social_connections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  channel     TEXT NOT NULL,          -- telegram | webhook | (لاحقاً oauth أخرى)
  label       TEXT NOT NULL DEFAULT 'افتراضي',
  -- telegram: {"bot_token":"...","chat_id":"..."}
  -- webhook:  {"url":"https://hook..."}
  config_json TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, channel, label)
);
CREATE INDEX IF NOT EXISTS idx_social_conn_user ON social_connections(user_id, is_active);
