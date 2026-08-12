-- «ساهم بتدريب الذكاء الاصطناعي»: مساهمات معرفية شرعية تطوعية (بلا مقابل مادي)
-- بشفافية كاملة — المساهم يقرّ أن مساهمته تُستخدم لتطوير قدرات الذكاء الاصطناعي
-- في العلوم الشرعية. لا تدخل أي مساهمة كوربوس التدريب قبل مراجعة واعتماد
-- مدير الموقع (صفحة /manager/training) — الجودة والمصداقية قبل الكمية.
CREATE TABLE IF NOT EXISTS ai_contributions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('qa','question')),  -- qa: سؤال+جواب موثّق · question: سؤال يحتاج جواباً
  question        TEXT NOT NULL,
  answer          TEXT,                                             -- إلزامي لنوع qa (يفرضه التطبيق)
  source          TEXT,                                             -- المصدر الشرعي (آية/حديث بتخريجه/مرجع)
  topic           TEXT,                                             -- فقه/عقيدة/حديث/تفسير/سيرة/أخلاق/أذكار/عام
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note     TEXT,                                             -- ملاحظة المدير (تظهر للمساهم — تعليم لا تخطئة)
  reviewed_by     INTEGER,                                          -- user_id للمدير المعتمِد
  reviewed_at     TEXT,
  -- عند تصحيح المدير للنص قبل الاعتماد نحفظ أصل المساهم (أمانة علمية + رجوع)
  orig_question   TEXT,
  orig_answer     TEXT,
  orig_source     TEXT,
  consent_version TEXT NOT NULL DEFAULT '1.0',                      -- ختم نسخة إقرار الشفافية لحظة المساهمة
  document_id     INTEGER,                                          -- ربط مستقبلي بمستند PDF (المرحلة القادمة)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_contrib_status ON ai_contributions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_contrib_user   ON ai_contributions(user_id, created_at);

-- مستندات المصادر (كتب/ملفات PDF في الفقه والدين) — البنية جاهزة من الآن للمرحلة
-- القادمة: الرفع إلى R2 (ربط MEDIA موجود) ثم توليد مهام أسئلة من كل مستند.
CREATE TABLE IF NOT EXISTS ai_documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  r2_key      TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
