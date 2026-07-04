-- متتبّع ختمة القرآن (مربوطٌ بالحساب — بيانات تراكميّة).
CREATE TABLE IF NOT EXISTS khatma (
  user_id       INTEGER PRIMARY KEY,
  total_pages   INTEGER NOT NULL DEFAULT 604,
  current_page  INTEGER NOT NULL DEFAULT 0,
  target_date   TEXT,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  khatmat_done  INTEGER NOT NULL DEFAULT 0
);
