---
description: نشر موقع رياض المتقين على Cloudflare (مع التحقّق قبل النشر)
---

انشر منصّة رياض المتقين على Cloudflare Workers خطوة بخطوة:

1. تحقّق أولاً: `npm run typecheck` — لا تنشر إن فشل.
2. تأكّد أن `wrangler.toml` يحتوي `database_id` حقيقياً (ليس PLACEHOLDER). إن كان نائباً:
   - أرشِد المستخدم لإنشاء القاعدة: `npx wrangler d1 create riyad_db` ووضع المعرّف في `wrangler.toml`.
   - وإنشاء المخزن: `npx wrangler r2 bucket create riyad-media`.
3. طبّق الترحيلات على القاعدة البعيدة: `npm run db:migrate:remote`.
4. انشر: `npm run deploy`.
5. إن طُلبت المصادقة، أرشِد المستخدم إلى `npx wrangler login` أوّلاً.
6. بعد النجاح، اعرض رابط الـ Worker الناتج، وذكّر المستخدم بإضافة أسرار يوتيوب إن أرادها:
   `npx wrangler secret put GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET`.

لا تنفّذ أي خطوة تتطلّب حساب المستخدم دون إعلامه؛ اشرح ثم نفّذ.
