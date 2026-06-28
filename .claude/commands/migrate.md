---
description: تطبيق ترحيلات قاعدة البيانات (D1) — محلياً أو على الإنتاج
argument-hint: "[local|remote]"
---

طبّق ترحيلات قاعدة بيانات رياض المتقين.

- إن كان الوسيط `remote`: نفّذ `npm run db:migrate:remote` (يتطلّب `database_id` حقيقياً وتسجيل دخول wrangler).
- غير ذلك (الافتراضي `local`): نفّذ `npm run db:migrate:local`.

بعد التطبيق، اعرض ملخّصاً للجداول التي أُنشئت أو الترحيلات التي طُبّقت، وتحقّق بسرعة:
`npx wrangler d1 execute riyad_db --local --command "SELECT name FROM sqlite_master WHERE type='table';"`
