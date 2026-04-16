ALTER TABLE creator_applications ADD COLUMN IF NOT EXISTS reminder1d_telegram_sent_at TEXT DEFAULT '';
ALTER TABLE business_mapping_values ADD COLUMN IF NOT EXISTS code TEXT DEFAULT '';
ALTER TABLE managed_sellers ADD COLUMN IF NOT EXISTS cluster TEXT DEFAULT '';
ALTER TABLE managed_sellers ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '';
ALTER TABLE managed_sellers ADD COLUMN IF NOT EXISTS username TEXT DEFAULT '';
ALTER TABLE managed_sellers ADD COLUMN IF NOT EXISTS shop_name TEXT DEFAULT '';
ALTER TABLE managed_affiliates ADD COLUMN IF NOT EXISTS affiliate_name TEXT DEFAULT '';
DROP TABLE IF EXISTS slots;
DROP TABLE IF EXISTS bookings;
