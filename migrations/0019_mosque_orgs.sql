-- مساجد/جمعيات: صفحات عامة + خطط Free/Pro (اشتراك خدمة — ليست تبرعات)
CREATE TABLE IF NOT EXISTS mosque_orgs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  city            TEXT,
  country         TEXT DEFAULT 'Kuwait',
  lat             REAL,
  lng             REAL,
  address         TEXT,
  iqama_json      TEXT,              -- {"Fajr":25,...}
  description     TEXT,
  external_url    TEXT,              -- موقع المسجد إن وُجد
  plan            TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro')),
  plan_expires_at TEXT,
  owner_user_id   INTEGER,
  is_published    INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mosque_orgs_slug ON mosque_orgs(slug);
CREATE INDEX IF NOT EXISTS idx_mosque_orgs_owner ON mosque_orgs(owner_user_id);

-- طلب ترقية Pro (يتابعه المدير — الفوترة الخارجية لاحقاً)
CREATE TABLE IF NOT EXISTS mosque_plan_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mosque_id   INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
