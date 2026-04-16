-- Supabase schema for Shopee Live Creator Match
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS sellers (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  site_address TEXT DEFAULT '',
  site_postal_code TEXT DEFAULT '',
  pin_salt TEXT DEFAULT '',
  pin_hash TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS affiliates (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  shipping_address TEXT DEFAULT '',
  shipping_postal_code TEXT DEFAULT '',
  pin_salt TEXT DEFAULT '',
  pin_hash TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  seller_id TEXT DEFAULT '',
  seller_name TEXT DEFAULT '',
  date TEXT DEFAULT '',
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  slot_id TEXT DEFAULT '',
  seller_id TEXT DEFAULT '',
  seller_name TEXT DEFAULT '',
  affiliate_id TEXT DEFAULT '',
  affiliate_name TEXT DEFAULT '',
  date TEXT DEFAULT '',
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  booked_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS brand_applications (
  id TEXT PRIMARY KEY,
  brand_id TEXT DEFAULT '',
  brand_name TEXT DEFAULT '',
  shop_id TEXT DEFAULT '',
  shop_name TEXT DEFAULT '',
  month TEXT DEFAULT '',
  stream_count TEXT DEFAULT '',
  seller_type TEXT DEFAULT '',
  product_nominations_confirmed TEXT DEFAULT '',
  num_products_sponsored TEXT DEFAULT '',
  stream_location TEXT DEFAULT '',
  has_package_activation TEXT DEFAULT '',
  preferred_date TEXT DEFAULT '',
  seller_site_required TEXT DEFAULT '',
  ams_commission TEXT DEFAULT '',
  bundle_deals_agreed TEXT DEFAULT '',
  voucher_tier TEXT DEFAULT '',
  creator_assignment_agreed TEXT DEFAULT '',
  seller_pic_name TEXT DEFAULT '',
  seller_pic_mobile TEXT DEFAULT '',
  seller_pic_email TEXT DEFAULT '',
  status TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  livestream_brief TEXT DEFAULT '',
  seller_site_address TEXT DEFAULT '',
  cancel_reason TEXT DEFAULT '',
  cancelled_at TEXT DEFAULT '',
  brand_activation_type TEXT DEFAULT '',
  rejected_at TEXT DEFAULT '',
  rejection_reason TEXT DEFAULT '',
  seller_site_timeslots TEXT DEFAULT '',
  seller_site_postal_code TEXT DEFAULT '',
  seller_pdpa_consent_given TEXT DEFAULT '',
  loaned_product_return_costs_agreed TEXT DEFAULT '',
  is_paused TEXT DEFAULT '',
  approved_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_brand_applications_shop_id ON brand_applications(shop_id);
CREATE INDEX IF NOT EXISTS idx_brand_applications_month ON brand_applications(month);
CREATE INDEX IF NOT EXISTS idx_brand_applications_status ON brand_applications(status);

CREATE TABLE IF NOT EXISTS creator_applications (
  id TEXT PRIMARY KEY,
  creator_id TEXT DEFAULT '',
  creator_name TEXT DEFAULT '',
  brand_application_id TEXT DEFAULT '',
  brand_name TEXT DEFAULT '',
  shop_name TEXT DEFAULT '',
  stream_date TEXT DEFAULT '',
  stream_time TEXT DEFAULT '',
  stream_end_date TEXT DEFAULT '',
  stream_end_time TEXT DEFAULT '',
  affiliate_username TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  telegram TEXT DEFAULT '',
  shipping_address TEXT DEFAULT '',
  willing_to_travel TEXT DEFAULT '',
  status TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  sample_sent_at TEXT DEFAULT '',
  sample_received_at TEXT DEFAULT '',
  has_samples TEXT DEFAULT '',
  cancel_reason TEXT DEFAULT '',
  cancelled_at TEXT DEFAULT '',
  courier TEXT DEFAULT '',
  tracking_id TEXT DEFAULT '',
  rejected_at TEXT DEFAULT '',
  rejection_reason TEXT DEFAULT '',
  delivery_instructions TEXT DEFAULT '',
  shipping_postal_code TEXT DEFAULT '',
  shipping_recipient_name TEXT DEFAULT '',
  reminder1d_telegram_sent_at TEXT DEFAULT '',
  approved_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_creator_applications_brand_application_id ON creator_applications(brand_application_id);
CREATE INDEX IF NOT EXISTS idx_creator_applications_creator_id ON creator_applications(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_applications_stream_date ON creator_applications(stream_date);
CREATE INDEX IF NOT EXISTS idx_creator_applications_status ON creator_applications(status);

CREATE TABLE IF NOT EXISTS telegram_users (
  username TEXT PRIMARY KEY,
  chat_id TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS internal_team (
  id TEXT PRIMARY KEY,
  email TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS business_mapping_values (
  id SERIAL PRIMARY KEY,
  type TEXT DEFAULT '',
  code TEXT DEFAULT '',
  description TEXT DEFAULT '',
  active TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS managed_sellers (
  shop_id TEXT PRIMARY KEY,
  rm_email TEXT DEFAULT '',
  cluster TEXT DEFAULT '',
  category TEXT DEFAULT '',
  username TEXT DEFAULT '',
  shop_name TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS managed_affiliates (
  affiliate_id TEXT PRIMARY KEY,
  affiliate_name TEXT DEFAULT ''
);

-- Used to replace Apps Script PropertiesService (Telegram dedup, sample message IDs)
CREATE TABLE IF NOT EXISTS properties (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);
