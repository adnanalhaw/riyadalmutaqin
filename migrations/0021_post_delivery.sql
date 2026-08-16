-- سجلّ تسليم المنشورات لكل قناة (JSON)
ALTER TABLE channel_posts ADD COLUMN delivery_log TEXT;
