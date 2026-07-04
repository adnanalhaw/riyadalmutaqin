-- تتبّع زوّار مجهول: مشاهدات الصفحات + المصدر (من أين أتى الزائر).
CREATE TABLE IF NOT EXISTS page_views (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id  TEXT,
  path        TEXT,
  source      TEXT,
  referrer    TEXT,
  country     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_pv_visitor ON page_views(visitor_id);
CREATE INDEX IF NOT EXISTS idx_pv_source ON page_views(source);
