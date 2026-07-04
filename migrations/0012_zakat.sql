-- دفتر الزكاة مربوطٌ بحساب المستخدم (يُحفظ في قاعدة البيانات ويتزامن عبر الأجهزة).
CREATE TABLE IF NOT EXISTS zakat_settings (
  user_id    INTEGER PRIMARY KEY,
  gold_price REAL,                                  -- سعر غرام الذهب
  currency   TEXT    NOT NULL DEFAULT 'د.ك',
  basis      TEXT    NOT NULL DEFAULT 'gold',       -- gold | silver
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS zakat_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  entry_date TEXT    NOT NULL,                       -- YYYY-MM-DD
  type       TEXT    NOT NULL,                       -- income | expense
  amount     REAL    NOT NULL,
  note       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_zakat_entries_user ON zakat_entries(user_id, entry_date);
