-- دعم فيديو مُستضاف للمقاطع (ناتج المونتاج المرفوع إلى R2)، إلى جانب youtube_id.
ALTER TABLE clips ADD COLUMN video_url TEXT;
