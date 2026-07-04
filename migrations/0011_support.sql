-- نظام الدعم: رسائل/طلبات من المستخدمين يراها الأدمن.
CREATE TABLE IF NOT EXISTS support_tickets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,                              -- المستخدم المسجَّل إن وُجد
  name       TEXT,
  email      TEXT,
  category   TEXT,                                 -- نوع الطلب (مشكلة/اقتراح/استفسار…)
  subject    TEXT,
  message    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'open',      -- open | closed
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  closed_at  TEXT,
  closed_by  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets(status, created_at);
