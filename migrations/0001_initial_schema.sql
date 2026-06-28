-- المرحلة ١: مخطط قاعدة بيانات رياض المتقين (Cloudflare D1 / SQLite)
-- الأدوار: student (متعلّم) / teacher (معلّم) / admin (مدير)

-- المستخدمون
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','teacher','admin')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الجلسات
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- الدورات (سلاسل علمية)
CREATE TABLE IF NOT EXISTS courses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  category        TEXT,
  description     TEXT,
  cover_image     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_published    INTEGER NOT NULL DEFAULT 1,
  is_members_only INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الدروس (مباشر / مسجّل / مستورد من يوتيوب)
CREATE TABLE IF NOT EXISTS lessons (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id       INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  doctor_name     TEXT,                       -- اسم الدكتور/الشيخ
  type            TEXT NOT NULL DEFAULT 'recorded' CHECK (type IN ('live','recorded','youtube')),
  youtube_id      TEXT,                        -- معرّف فيديو يوتيوب (تضمين/استيراد)
  audio_url       TEXT,                        -- رابط صوت في R2
  cover_image     TEXT,                        -- غلاف القناة (صورتي)
  duration        INTEGER,                     -- بالثواني
  status          TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','scheduled','live','published')),
  scheduled_at    TEXT,                        -- موعد البث المجدول
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_published    INTEGER NOT NULL DEFAULT 1,
  is_members_only INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);

-- متابعة التقدّم
CREATE TABLE IF NOT EXISTS progress (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id     INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed     INTEGER NOT NULL DEFAULT 0,
  last_position INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, lesson_id)
);

-- مكتبة الحفظ (المفضّلة)
CREATE TABLE IF NOT EXISTS bookmarks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id  INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, lesson_id)
);

-- المقاطع القصيرة
CREATE TABLE IF NOT EXISTS clips (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  doctor_name  TEXT,
  youtube_id   TEXT,
  thumbnail    TEXT,
  duration     INTEGER,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- المكتبة الصوتية
CREATE TABLE IF NOT EXISTS audio_posts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,
  description      TEXT,
  doctor_name      TEXT,
  audio_url        TEXT,                 -- رابط في R2
  background_image TEXT,
  duration         INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- شهادات الإتمام
CREATE TABLE IF NOT EXISTS certificates (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, course_id)
);

-- المرفقات/الموارد
CREATE TABLE IF NOT EXISTS resources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  type            TEXT,
  file_url        TEXT,
  is_members_only INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الأسئلة الواردة وردودها
CREATE TABLE IF NOT EXISTS questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  answer     TEXT,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ربط حسابات يوتيوب للمعلّمين (الرموز السرّية تُخزَّن كأسرار، لا هنا)
CREATE TABLE IF NOT EXISTS youtube_accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id    TEXT,
  channel_title TEXT,
  connected_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (teacher_id)
);

-- منشورات النشر على القنوات (تيك توك/فيسبوك/إكس/تيليجرام...)
CREATE TABLE IF NOT EXISTS channel_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  content      TEXT,
  media_url    TEXT,
  channels     TEXT,                 -- JSON: ["youtube","tiktok",...]
  scheduled_at TEXT,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','failed')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- سجلّ التدقيق
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT,
  action      TEXT NOT NULL,
  target      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
