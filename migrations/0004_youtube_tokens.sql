-- المرحلة ٦: أعمدة رموز يوتيوب لكل معلّم (تُحفظ في القاعدة الخاصة).
ALTER TABLE youtube_accounts ADD COLUMN access_token  TEXT;
ALTER TABLE youtube_accounts ADD COLUMN refresh_token TEXT;
ALTER TABLE youtube_accounts ADD COLUMN token_expiry  TEXT;
ALTER TABLE youtube_accounts ADD COLUMN scope         TEXT;
