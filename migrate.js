/**
 * One-time migration script: Google Sheets (via Apps Script) → Supabase
 * Run: node migrate.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const GAS_URL = 'https://script.google.com/macros/s/AKfycbylDPgJp5gPUj68V_hI-1BuhG-vcWIA8dNIVY6VUZ098iUm6oB3UCet8irDlHbpy63M/exec';

const camelToSnake = s => s.replace(/([A-Z])/g, c => '_' + c.toLowerCase());

const toSnake = obj => Object.fromEntries(
  Object.entries(obj).map(([k, v]) => [camelToSnake(k), v == null ? '' : String(v)])
);

async function fetchAllData() {
  console.log('Fetching all data from Apps Script...');
  const url = `${GAS_URL}?action=getAllData&allMonths=true`;
  const res = await fetch(url, { redirect: 'follow' });
  const data = await res.json();
  console.log('Fetched. Keys:', Object.keys(data).join(', '));
  return data;
}

async function upsertBatch(table, rows, onConflict = 'id') {
  if (!rows || rows.length === 0) { console.log(`  ${table}: nothing to insert`); return; }
  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) { console.error(`  ✗ ${table} batch ${i}:`, error.message); }
    else total += batch.length;
  }
  console.log(`  ✓ ${table}: ${total} rows`);
}

async function run() {
  const data = await fetchAllData();

  // ── sellers ──────────────────────────────────────────────────────────────────
  const sellers = (data.sellers || []).map(s => ({
    id: String(s.id || ''),
    name: String(s.name || ''),
    created_at: String(s.createdAt || ''),
    site_address: String(s.siteAddress || ''),
    site_postal_code: String(s.sitePostalCode || ''),
    pin_salt: String(s.pinSalt || ''),
    pin_hash: String(s.pinHash || ''),
  })).filter(r => r.id);
  await upsertBatch('sellers', sellers);

  // ── affiliates ───────────────────────────────────────────────────────────────
  const affiliates = (data.affiliates || []).map(a => ({
    id: String(a.id || ''),
    name: String(a.name || ''),
    created_at: String(a.createdAt || ''),
    phone: String(a.phone || ''),
    shipping_address: String(a.shippingAddress || ''),
    shipping_postal_code: String(a.shippingPostalCode || ''),
    delivery_instructions: String(a.deliveryInstructions || ''),
    shipping_recipient_name: String(a.shippingRecipientName || ''),
    pin_salt: String(a.pinSalt || ''),
    pin_hash: String(a.pinHash || ''),
  })).filter(r => r.id);
  await upsertBatch('affiliates', affiliates);

  // ── slots ────────────────────────────────────────────────────────────────────
  const slots = (data.slots || []).map(s => ({
    id: String(s.id || ''),
    seller_id: String(s.sellerId || ''),
    seller_name: String(s.sellerName || ''),
    date: String(s.date || ''),
    start_time: String(s.startTime || ''),
    end_time: String(s.endTime || ''),
    description: String(s.description || ''),
    created_at: String(s.createdAt || ''),
  })).filter(r => r.id);
  await upsertBatch('slots', slots);

  // ── bookings ─────────────────────────────────────────────────────────────────
  const bookings = (data.bookings || []).map(b => ({
    id: String(b.id || ''),
    slot_id: String(b.slotId || ''),
    seller_id: String(b.sellerId || ''),
    seller_name: String(b.sellerName || ''),
    affiliate_id: String(b.affiliateId || ''),
    affiliate_name: String(b.affiliateName || ''),
    date: String(b.date || ''),
    start_time: String(b.startTime || ''),
    end_time: String(b.endTime || ''),
    booked_at: String(b.bookedAt || ''),
  })).filter(r => r.id);
  await upsertBatch('bookings', bookings);

  // ── brand_applications ───────────────────────────────────────────────────────
  const bas = (data.brandApplications || []).map(a => ({
    id: String(a.id || ''),
    brand_id: String(a.brandId || ''),
    brand_name: String(a.brandName || ''),
    shop_id: String(a.shopId || ''),
    shop_name: String(a.shopName || ''),
    month: String(a.month || ''),
    stream_count: String(a.streamCount || ''),
    seller_type: String(a.sellerType || ''),
    product_nominations_confirmed: String(a.productNominationsConfirmed || ''),
    num_products_sponsored: String(a.numProductsSponsored || ''),
    stream_location: String(a.streamLocation || ''),
    has_package_activation: String(a.hasPackageActivation || ''),
    preferred_date: String(a.preferredDate || ''),
    seller_site_required: String(a.sellerSiteRequired || ''),
    ams_commission: String(a.amsCommission || ''),
    bundle_deals_agreed: String(a.bundleDealsAgreed || ''),
    voucher_tier: String(a.voucherTier || ''),
    creator_assignment_agreed: String(a.creatorAssignmentAgreed || ''),
    seller_pic_name: String(a.sellerPicName || ''),
    seller_pic_mobile: String(a.sellerPicMobile || ''),
    seller_pic_email: String(a.sellerPicEmail || ''),
    status: String(a.status || ''),
    created_at: String(a.createdAt || ''),
    livestream_brief: String(a.livestreamBrief || ''),
    seller_site_address: String(a.sellerSiteAddress || ''),
    cancel_reason: String(a.cancelReason || ''),
    cancelled_at: String(a.cancelledAt || ''),
    brand_activation_type: String(a.brandActivationType || ''),
    rejected_at: String(a.rejectedAt || ''),
    rejection_reason: String(a.rejectionReason || ''),
    seller_site_timeslots: String(a.sellerSiteTimeslots || ''),
    seller_site_postal_code: String(a.sellerSitePostalCode || ''),
    seller_pdpa_consent_given: String(a.sellerPdpaConsentGiven || ''),
    loaned_product_return_costs_agreed: String(a.loanedProductReturnCostsAgreed || ''),
    is_paused: String(a.isPaused || ''),
  })).filter(r => r.id);
  await upsertBatch('brand_applications', bas);

  // ── creator_applications ─────────────────────────────────────────────────────
  const cas = (data.creatorApplications || []).map(a => ({
    id: String(a.id || ''),
    creator_id: String(a.creatorId || ''),
    creator_name: String(a.creatorName || ''),
    brand_application_id: String(a.brandApplicationId || ''),
    brand_name: String(a.brandName || ''),
    shop_name: String(a.shopName || ''),
    stream_date: String(a.streamDate || ''),
    stream_time: String(a.streamTime || ''),
    stream_end_date: String(a.streamEndDate || ''),
    stream_end_time: String(a.streamEndTime || ''),
    affiliate_username: String(a.affiliateUsername || ''),
    phone: String(a.phone || ''),
    telegram: String(a.telegram || ''),
    shipping_address: String(a.shippingAddress || ''),
    willing_to_travel: String(a.willingToTravel || ''),
    status: String(a.status || ''),
    created_at: String(a.createdAt || ''),
    sample_sent_at: String(a.sampleSentAt || ''),
    sample_received_at: String(a.sampleReceivedAt || ''),
    has_samples: String(a.hasSamples || ''),
    cancel_reason: String(a.cancelReason || ''),
    cancelled_at: String(a.cancelledAt || ''),
    courier: String(a.courier || ''),
    tracking_id: String(a.trackingId || ''),
    rejected_at: String(a.rejectedAt || ''),
    rejection_reason: String(a.rejectionReason || ''),
    delivery_instructions: String(a.deliveryInstructions || ''),
    shipping_postal_code: String(a.shippingPostalCode || ''),
    shipping_recipient_name: String(a.shippingRecipientName || ''),
  })).filter(r => r.id);
  await upsertBatch('creator_applications', cas);

  // ── managed_sellers ──────────────────────────────────────────────────────────
  const ms = (data.managedSellers || []).map(s => ({
    shop_id: String(s.Shopid || s.shopId || s.shop_id || ''),
    rm_email: String(s['RM email'] || s.rmEmail || s.rm_email || ''),
  })).filter(r => r.shop_id);
  await upsertBatch('managed_sellers', ms, 'shop_id');

  // ── managed_affiliates ───────────────────────────────────────────────────────
  const ma = (data.managedAffiliates || []).map(a => ({
    affiliate_id: String(a.affiliate_id || a.affiliateId || '').trim().toLowerCase(),
  })).filter(r => r.affiliate_id);
  await upsertBatch('managed_affiliates', ma, 'affiliate_id');

  // ── business_mapping_values ──────────────────────────────────────────────────
  const bmv = (data.businessMappingValues || []).map(v => ({
    type: String(v.Type || v.type || ''),
    description: String(v.Description || v.description || ''),
    active: String(v.Active || v.active || ''),
  })).filter(r => r.type);
  // No id on these — delete and reinsert to keep clean
  if (bmv.length) {
    await supabase.from('business_mapping_values').delete().neq('id', 0);
    const { error } = await supabase.from('business_mapping_values').insert(bmv);
    if (error) console.error('  ✗ business_mapping_values:', error.message);
    else console.log(`  ✓ business_mapping_values: ${bmv.length} rows`);
  }

  console.log('\n✅ Migration complete.');
  console.log('\n⚠️  Still to do manually in Supabase (Table Editor → Import CSV):');
  console.log('   - internal_team  (export from Google Sheets → CSV)');
  console.log('   - telegram_users (export from Google Sheets → CSV)');
}

run().catch(err => { console.error('Migration failed:', err); process.exit(1); });
