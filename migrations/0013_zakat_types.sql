-- توسيع الزكاة لأنواع متعدّدة (ذهب/فضّة/أسهم/عروض تجارة) مربوطة بالحساب.
ALTER TABLE zakat_settings ADD COLUMN silver_price REAL;   -- سعر غرام الفضّة

-- ممتلكاتٌ لكلّ نوع زكاة، لكلّ مستخدم سجلٌّ واحدٌ لكلّ نوع (يُحدَّث).
CREATE TABLE IF NOT EXISTS zakat_holdings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  kind       TEXT    NOT NULL,                -- gold | silver | stocks | trade
  grams      REAL,                            -- للذهب/الفضّة
  value      REAL,                            -- للأسهم/عروض التجارة (قيمة نقدية)
  hawl_start TEXT,                            -- بداية الحَوْل YYYY-MM-DD
  note       TEXT,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, kind)
);
