-- عيّنات كوربوس معتمدة لتجربة /ask (تُدرج فقط إن وُجد مستخدم واحد على الأقل)
INSERT INTO ai_contributions (user_id, kind, question, answer, source, topic, status, reviewed_at, consent_version)
SELECT u.id, 'qa',
  'ما معنى إنّما الأعمال بالنيّات؟',
  'الحديث أصل عظيم في الدين: أن قبول العمل وصلاحه مرتبط بنيّة صاحبه، فمن كانت هجرته إلى الله ورسوله فهجرته إلى الله ورسوله.',
  'صحيح البخاري ومسلم — حديث عمر بن الخطّاب رضي الله عنه',
  'حديث', 'approved', datetime('now'), '1.0'
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) AS u;

INSERT INTO ai_contributions (user_id, kind, question, answer, source, topic, status, reviewed_at, consent_version)
SELECT u.id, 'qa',
  'متى تُصلّى صلاة الضحى؟',
  'وقتها من ارتفاع الشمس قيد رمح إلى قبيل الزوال، وأفضلها حين ترمض الفصال.',
  'انظر كلام أهل العلم في أوقات النوافل؛ ومن الأدلة حديث زيد بن أرقم وغيره',
  'فقه', 'approved', datetime('now'), '1.0'
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) AS u;

INSERT INTO ai_contributions (user_id, kind, question, answer, source, topic, status, reviewed_at, consent_version)
SELECT u.id, 'qa',
  'ما فضل الصلاة على النبي ﷺ؟',
  'من صلّى على النبي ﷺ واحدةً صلّى الله عليه بها عشراً، كما في الصحيح.',
  'صحيح مسلم — عن أبي هريرة رضي الله عنه',
  'حديث', 'approved', datetime('now'), '1.0'
FROM (SELECT id FROM users ORDER BY id ASC LIMIT 1) AS u;
