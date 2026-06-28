# رياض المتقين — منصة دعوية

منصةٌ دعويةٌ لقناة **رياض المتقين**، مبنيةٌ على Cloudflare بتكلفةٍ منخفضة.
تتكوّن من ثلاث طبقات: موقعٌ عامٌّ مجاني، ومنطقةُ أعضاءٍ بمحتوًى حصري، ولوحةُ إدارة.

## البنية التقنية

| المكوّن | الأداة |
| --- | --- |
| الكود والاستضافة | Cloudflare Workers |
| قاعدة البيانات | Cloudflare D1 (SQLite) |
| تخزين الملفات (صوت/صور) | Cloudflare R2 |
| الفيديو | YouTube (تضمين، لا تخزين) |
| مصادقة المدير | Cloudflare Access (Zero Trust) |
| النشر التلقائي | GitHub → Cloudflare |

## حالة المشروع — المراحل

التنفيذ يتمّ **مرحلةً واحدةً في كل مرة**:

- [x] **المرحلة ٠ — التأسيس:** تهيئة بنية المشروع كـ Worker، ربط D1 وR2 وCloudflare Access، الموقع العام يعمل، ونقطة `/api/health`.
- [ ] المرحلة ١ — قاعدة البيانات (الجداول + الترحيلات + بيانات تجريبية).
- [ ] المرحلة ٢ — تسجيل دخول الأعضاء (آمن).
- [ ] المرحلة ٣ — قيمة العضوية (تقدّم، مفضّلة، شهادات، محتوى حصري).
- [ ] المرحلة ٤ — لوحة الإدارة (Cloudflare Access).
- [ ] المرحلة ٥ — إدارة المحتوى (CRUD + أعضاء + أسئلة).
- [ ] المرحلة ٦ — استوديو المنشورات + الصوت.
- [ ] المرحلة ٧ — اللمسات الأخيرة والإطلاق.

## التشغيل محلياً

```bash
npm install
npm run dev          # خادم تطوير محلي على wrangler
```

ثم افتح المتصفّح، وتحقّق من نقطة الصحّة:

```bash
curl http://localhost:8787/api/health
# {"ok":true,"service":"رياض المتقين", ...}
```

## الإعداد على Cloudflare (مرّة واحدة)

```bash
# 1) سجّل الدخول
npx wrangler login

# 2) أنشئ قاعدة البيانات وضع database_id في wrangler.toml
npx wrangler d1 create riyad_db

# 3) أنشئ مخزن الملفات
npx wrangler r2 bucket create riyad-media

# 4) انشر
npm run deploy
```

### النشر التلقائي عبر GitHub

أضف السرّين التاليين في إعدادات المستودع (Settings → Secrets → Actions):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

وبعدها كل دفعةٍ إلى `main` تُنشَر تلقائياً (راجع `.github/workflows/deploy.yml`).

## بنية المجلدات

```
.
├── public/              # الموقع العام (أصول ثابتة)
├── src/index.ts         # نقطة دخول الـ Worker وواجهة /api
├── migrations/          # ترحيلات D1 (تبدأ في المرحلة ١)
├── wrangler.toml        # إعداد Worker وربط D1 وR2 والأصول
└── .github/workflows/   # النشر التلقائي
```
