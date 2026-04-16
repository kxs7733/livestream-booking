'use strict';
const express = require('express');
const router = express.Router();

const { db } = require('./lib/db');
const { hashPin, randomUUID } = require('./lib/auth');
const { sendEmail } = require('./lib/email');
const {
  telegramSend,
  getTelegramChatId,
  saveTelegramUser,
  getInternalPicContactString,
  formatDateDDMMMYYYY,
  getRmEmail,
  sendApprovalNotificationForRow,
  sendRescheduledApprovalNotification,
  sendSampleSentNotification,
  sendSampleUndoNotification,
  sendRejectionNotification_CreatorApp,
  sendCancellationNotification_CreatorApp,
} = require('./lib/telegram');

const INTERNAL_PASSWORD = process.env.INTERNAL_PASSWORD || 'shopeelive2025';

// ─── Utilities ─────────────────────────────────────────────────────────────────

function getCurrentMonthStr() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function timeslotsOverlap(a, b) {
  const aStart = (a.date || a.streamDate || '') + 'T' + (a.startTime || a.streamTime || '00:00');
  const aEnd   = (a.endDate || a.streamEndDate || a.date || a.streamDate || '') + 'T' + (a.endTime || a.streamEndTime || '00:00');
  const bStart = (b.date || b.streamDate || '') + 'T' + (b.startTime || b.streamTime || '00:00');
  const bEnd   = (b.endDate || b.streamEndDate || b.date || b.streamDate || '') + 'T' + (b.endTime || b.streamEndTime || '00:00');
  return aStart < bEnd && aEnd > bStart;
}

// ─── GET /api ─────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { action } = req.query;
  try {
    let result;
    switch (action) {
      case 'getAllData':
        result = await getAllData(req.query.allMonths === 'true', parseInt(req.query.pastMonths || 0));
        break;
      case 'addSeller':
        result = await addSeller(JSON.parse(req.query.data));
        break;
      case 'addAffiliate':
        result = await addAffiliate(JSON.parse(req.query.data));
        break;
      case 'addSlot':
        result = await addSlot(JSON.parse(req.query.data));
        break;
      case 'addBooking':
        result = await addBooking(JSON.parse(req.query.data));
        break;
      case 'addBrandApplication':
        result = await addBrandApplication(JSON.parse(req.query.data));
        break;
      case 'addCreatorApplication':
        result = await addCreatorApplication(JSON.parse(req.query.data));
        break;
      case 'updateBrandApplication':
        result = await updateBrandApplication(req.query.id, JSON.parse(req.query.data));
        break;
      case 'toggleBrandPause':
        result = await toggleBrandPause(req.query.id);
        break;
      case 'cancelBrandApplication':
        result = await cancelBrandApplication(req.query.id, req.query.cancelReason);
        break;
      case 'updateCreatorApplication':
        result = await updateCreatorApplication(req.query.id, JSON.parse(req.query.data));
        break;
      case 'rescheduleCreatorApplication':
        result = await rescheduleCreatorApplication(req.query.id, JSON.parse(req.query.data));
        break;
      case 'deleteSlot':
        result = await deleteSlot(req.query.id);
        break;
      case 'deleteBooking':
        result = await deleteBooking(req.query.id);
        break;
      case 'validateBrandLogin':
        result = await validateBrandLogin(req.query.shopId, req.query.shopName);
        break;
      case 'validateCreatorLogin':
        result = await validateCreatorLogin(req.query.affiliateId, req.query.affiliateUsername, req.query.phone);
        break;
      case 'updateSellerProfile':
        result = await updateSellerProfile(req.query.shopId, JSON.parse(req.query.data));
        break;
      case 'updateAffiliateProfile':
        result = await updateAffiliateProfile(req.query.affiliateId, JSON.parse(req.query.data));
        break;
      case 'validateInternalLogin':
        result = await validateInternalLogin(req.query.password, req.query.email);
        break;
      case 'setPin':
        result = await setPin(req.query.userId, req.query.userType, req.query.pin);
        break;
      case 'validatePin':
        result = await validatePin(req.query.userId, req.query.userType, req.query.pin);
        break;
      case 'changePin':
        result = await changePin(req.query.userId, req.query.userType, req.query.currentPin, req.query.newPin);
        break;
      case 'adminResetPin':
        result = await adminResetPin(req.query.userId, req.query.userType);
        break;
      default:
        result = { error: 'Unknown action' };
    }
    res.json(result);
  } catch (err) {
    console.error('[API Error]', action, err.message);
    res.json({ error: err.message });
  }
});

// ─── POST /api (file upload) ──────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (body && body.action === 'uploadBrief') {
      const result = await uploadBriefFile(body.fileName, body.fileData, body.mimeType);
      return res.json(result);
    }
    res.json({ error: 'Unknown POST action' });
  } catch (err) {
    console.error('[POST /api]', err.message);
    res.json({ error: err.message });
  }
});

// ─── POST /api/telegram-webhook ───────────────────────────────────────────────

router.post('/telegram-webhook', async (req, res) => {
  res.json({ ok: true }); // respond immediately so Telegram doesn't retry
  try {
    const body = req.body;
    if (!body || body.update_id === undefined) return;

    // Deduplicate
    const lastId = parseInt((await db.getProp('lastUpdateId')) || '0', 10);
    if (body.update_id <= lastId) return;
    await db.setProp('lastUpdateId', String(body.update_id));

    await handleTelegramUpdate(body);
  } catch (err) {
    console.error('[Telegram webhook]', err.message);
  }
});

// ─── getAllData ────────────────────────────────────────────────────────────────

async function getAllData(allMonths, pastMonths) {
  // Compute filter month
  let filterMonth = null;
  if (!allMonths) {
    filterMonth = getCurrentMonthStr();
    if (pastMonths > 0) {
      const d = new Date();
      d.setMonth(d.getMonth() - pastMonths);
      filterMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
  }

  // Fetch all tables in parallel — filter brand/creator applications server-side
  const [sellers, affiliates, slots, bookings, managedSellers, managedAffiliates, businessMappingValues] =
    await Promise.all([
      db.all('sellers'),
      db.all('affiliates'),
      db.all('slots'),
      db.all('bookings'),
      db.all('managed_sellers'),
      db.all('managed_affiliates'),
      db.all('business_mapping_values'),
    ]);

  // Brand applications — filter by month if not allMonths
  let brandAppQuery = db.client.from('brand_applications').select('*');
  if (filterMonth) brandAppQuery = brandAppQuery.gte('month', filterMonth);
  const { data: baRaw } = await brandAppQuery;
  const brandApplications = (baRaw || []).map(row => {
    const obj = {};
    for (const [k, v] of Object.entries(row)) obj[snakeToCamelLocal(k)] = v;
    return obj;
  });

  // Build set of brand app IDs to filter creator applications
  const brandAppIds = filterMonth ? new Set(brandApplications.map(a => String(a.id))) : null;

  // Creator applications — filter by brand app IDs
  let caRaw;
  if (brandAppIds && brandAppIds.size === 0) {
    caRaw = [];
  } else {
    let caQuery = db.client.from('creator_applications').select('*');
    if (brandAppIds) {
      caQuery = caQuery.in('brand_application_id', [...brandAppIds]);
    }
    const { data } = await caQuery;
    caRaw = data || [];
  }
  const creatorApplications = caRaw.map(row => {
    const obj = {};
    for (const [k, v] of Object.entries(row)) obj[snakeToCamelLocal(k)] = v;
    return obj;
  });

  return { sellers, affiliates, slots, bookings, brandApplications, creatorApplications, managedSellers, managedAffiliates, businessMappingValues };
}

function snakeToCamelLocal(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── Simple CRUD ──────────────────────────────────────────────────────────────

async function addSeller(data) {
  await db.insert('sellers', {
    id: data.id, name: data.name, createdAt: data.createdAt,
    siteAddress: data.siteAddress || '', sitePostalCode: data.sitePostalCode || '',
    pinSalt: '', pinHash: '',
  });
  return { success: true, data };
}

async function addAffiliate(data) {
  await db.insert('affiliates', {
    id: data.id, name: data.name, createdAt: data.createdAt,
    phone: data.phone || '', shippingAddress: '', shippingPostalCode: '',
    pinSalt: '', pinHash: '',
  });
  return { success: true, data };
}

async function addSlot(data) {
  await db.insert('slots', {
    id: data.id, sellerId: data.sellerId, sellerName: data.sellerName,
    date: data.date, startTime: data.startTime, endTime: data.endTime,
    description: data.description || '', createdAt: data.createdAt,
  });
  return { success: true, data };
}

async function addBooking(data) {
  await db.insert('bookings', {
    id: data.id, slotId: data.slotId, sellerId: data.sellerId, sellerName: data.sellerName,
    affiliateId: data.affiliateId, affiliateName: data.affiliateName,
    date: data.date, startTime: data.startTime, endTime: data.endTime, bookedAt: data.bookedAt,
  });
  return { success: true, data };
}

async function addBrandApplication(data) {
  await db.insert('brand_applications', data);
  return { success: true, data };
}

async function deleteSlot(id) {
  await db.deleteById('slots', id);
  return { success: true };
}

async function deleteBooking(id) {
  await db.deleteById('bookings', id);
  return { success: true };
}

// ─── addCreatorApplication ────────────────────────────────────────────────────

async function addCreatorApplication(data) {
  const timeslots = Array.isArray(data.timeslots) ? data.timeslots : [];

  // Fetch existing rows for this brand application to check conflicts
  const { data: existing } = await db.client
    .from('creator_applications')
    .select('stream_date, stream_time, stream_end_date, stream_end_time, status')
    .eq('brand_application_id', String(data.brandApplicationId))
    .not('status', 'in', '("rejected","cancelled")');

  const existingRows = (existing || []).map(r => ({
    streamDate: r.stream_date, streamTime: r.stream_time,
    streamEndDate: r.stream_end_date, streamEndTime: r.stream_end_time,
  }));

  for (const slot of timeslots) {
    for (const ex of existingRows) {
      if (timeslotsOverlap(slot, ex)) {
        return { error: 'One or more of your selected timeslots has just been taken by another creator. Please go back and pick an available slot.' };
      }
    }
  }

  const rows = timeslots.map(slot => ({
    id: slot.id || randomUUID(),
    creatorId: data.creatorId,
    creatorName: data.creatorName,
    brandApplicationId: data.brandApplicationId,
    brandName: data.brandName,
    shopName: data.shopName,
    streamDate: slot.date || '',
    streamTime: slot.startTime || '',
    streamEndDate: slot.endDate || slot.date || '',
    streamEndTime: slot.endTime || '',
    affiliateUsername: data.affiliateUsername,
    phone: data.phone,
    telegram: data.telegram,
    shippingAddress: data.shippingAddress,
    shippingPostalCode: data.shippingPostalCode || '',
    deliveryInstructions: data.deliveryInstructions || '',
    shippingRecipientName: data.shippingRecipientName || '',
    willingToTravel: data.willingToTravel,
    status: data.status,
    createdAt: data.createdAt,
    sampleSentAt: '', sampleReceivedAt: '', hasSamples: '',
    cancelReason: '', cancelledAt: '', courier: '', trackingId: '',
    rejectedAt: '', rejectionReason: '',
  }));

  await db.insertMany('creator_applications', rows);
  return { success: true, count: timeslots.length };
}

// ─── cancelBrandApplication ───────────────────────────────────────────────────

async function cancelBrandApplication(id, cancelReason) {
  const now = new Date().toISOString();

  const brandApp = await db.findById('brand_applications', id);
  if (!brandApp) return { success: false, error: 'Brand application not found.' };

  await db.updateById('brand_applications', id, { status: 'cancelled', cancelReason: cancelReason || '', cancelledAt: now });

  // Send cancellation email to seller
  sendCancellationEmail_BrandApp(brandApp, cancelReason || '').catch(console.error);

  // Cascade: cancel linked creator apps
  const { data: caRows } = await db.client
    .from('creator_applications')
    .select('*')
    .eq('brand_application_id', String(id))
    .not('status', 'in', '("rejected","cancelled")');

  let cancelledCount = 0;
  for (const rawRow of (caRows || [])) {
    const ca = snakeToCamelObj(rawRow);
    await db.updateById('creator_applications', ca.id, { status: 'cancelled', cancelReason: cancelReason || '', cancelledAt: now });
    sendCancellationEmail_CreatorApp(ca, brandApp, cancelReason || '').catch(console.error);
    cancelledCount++;
  }

  return { success: true, cancelledCreatorApps: cancelledCount };
}

// ─── updateBrandApplication ───────────────────────────────────────────────────

async function updateBrandApplication(id, data) {
  const currentApp = await db.findById('brand_applications', id);
  if (!currentApp) return { success: false, error: 'Application not found' };

  if (data.status) {
    const curr = String(currentApp.status);
    const next = String(data.status);
    if (curr === next) return { success: true };
    if (curr === 'approved' && next === 'rejected') return { success: false, error: 'This application has already been approved by another user. Please refresh.' };
    if (curr === 'rejected' && next === 'approved') return { success: false, error: 'This application has already been rejected by another user. Please refresh.' };
  }

  await db.updateById('brand_applications', id, data);

  const updatedApp = Object.assign({}, currentApp, data);
  if (String(data.status) === 'approved') {
    sendEmailToSeller_BrandAppApproved(updatedApp).catch(console.error);
  }
  if (String(data.status) === 'rejected' && String(currentApp.status) !== 'rejected') {
    sendRejectionEmailToBrandApp(updatedApp, data.rejectionReason || '').catch(console.error);
  }

  return { success: true };
}

// ─── toggleBrandPause ─────────────────────────────────────────────────────────

async function toggleBrandPause(id) {
  const app = await db.findById('brand_applications', id);
  if (!app) return { success: false, error: 'Application not found' };
  const newVal = String(app.isPaused) === 'true' ? 'false' : 'true';
  await db.updateById('brand_applications', id, { isPaused: newVal });
  return { success: true, isPaused: newVal };
}

// ─── updateCreatorApplication ─────────────────────────────────────────────────

async function updateCreatorApplication(id, data) {
  const currentRow = await db.findById('creator_applications', id);
  if (!currentRow) return { success: false, error: 'Application not found' };

  const byCreator = String(data.rejectedBy || '') === 'creator';
  if (data.status) {
    const curr = String(currentRow.status);
    const next = String(data.status);
    if (curr === next) return { success: true };
    if (curr === 'approved' && next === 'rejected' && !byCreator) return { success: false, error: 'This application has already been approved by another user. Please refresh.' };
    if (curr === 'rejected' && next === 'approved') return { success: false, error: 'This application has already been rejected by another user. Please refresh.' };
  }

  if (data.sampleSentAt === '') {
    if (currentRow.sampleReceivedAt) return { success: false, error: 'Cannot undo — the creator has already confirmed receipt of the samples.' };
  }
  if (data.sampleReceivedAt && currentRow.sampleReceivedAt) {
    return { success: false, error: 'Samples already marked as received.' };
  }
  if (data.sampleSentAt) {
    data.sampleReceivedAt = '';
  }

  await db.updateById('creator_applications', id, data);

  const row = Object.assign({}, currentRow, data);

  if (String(data.status) === 'approved' && String(currentRow.status) !== 'approved') {
    sendApprovalNotificationForRow(row).catch(console.error);
    sendEmailToSeller_CreatorConfirmed(row).catch(console.error);
  }
  if (String(data.status) === 'rejected' && String(currentRow.status) !== 'rejected' && !byCreator) {
    sendRejectionNotification_CreatorApp(row, data.rejectionReason || '').catch(console.error);
  }
  if (data.sampleSentAt) {
    sendSampleSentNotification(row).catch(console.error);
  }
  if (data.sampleSentAt === '') {
    sendSampleUndoNotification(row).catch(console.error);
  }
  if (String(data.status) === 'cancelled' && String(currentRow.status) !== 'cancelled') {
    const brandApp = await db.findById('brand_applications', row.brandApplicationId);
    sendCancellationEmail_CreatorApp(row, brandApp, data.cancelReason || '').catch(console.error);
    sendCancellationNotification_CreatorApp(row, data.cancelReason || '').catch(console.error);
  }

  // Sync Telegram sample button
  if ('sampleReceivedAt' in data) {
    const stored = await db.getProp('sampleMsg_' + id);
    if (stored) {
      const [tgChatId, tgMsgId] = stored.split(':');
      const markup = data.sampleReceivedAt
        ? JSON.stringify({ inline_keyboard: [] })
        : JSON.stringify({ inline_keyboard: [[{ text: "✅ I've Received the Samples", callback_data: 'sample_received_' + id }]] });
      telegramSend('editMessageReplyMarkup', {
        chat_id: tgChatId,
        message_id: parseInt(tgMsgId, 10),
        reply_markup: markup,
      }).catch(console.error);
    }
  }

  return { success: true };
}

// ─── rescheduleCreatorApplication ─────────────────────────────────────────────

async function rescheduleCreatorApplication(id, data) {
  const currentRow = await db.findById('creator_applications', id);
  if (!currentRow) return { success: false, error: 'Application not found.' };

  if (String(currentRow.status || '').trim().toLowerCase() !== 'approved') {
    return { success: false, error: 'Only approved slots can be rescheduled. (current status: ' + currentRow.status + ')' };
  }

  // 3-day rule
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const slotDate = new Date(String(currentRow.streamDate) + 'T00:00:00');
  if (Math.floor((slotDate - today) / 86400000) < 3) {
    return { success: false, error: 'This slot is too close to today and cannot be rescheduled. Slots must be at least 3 days away.' };
  }

  const brandApp = await db.findById('brand_applications', currentRow.brandApplicationId);
  const isSellerSite = brandApp && String(brandApp.sellerSiteRequired || '').trim().toLowerCase() === 'true';

  if (isSellerSite) {
    let predefinedSlots = [];
    try { predefinedSlots = JSON.parse(String(brandApp.sellerSiteTimeslots || '[]')); } catch (_) {}
    const matchesSlot = predefinedSlots.some(s => String(s.date) === String(data.newDate) && String(s.startTime) === String(data.newStartTime));
    if (!matchesSlot) return { success: false, error: 'The selected timeslot is not one of the predefined seller site timeslots.' };
    if (!data.newEndTime) {
      const matched = predefinedSlots.find(s => String(s.date) === String(data.newDate) && String(s.startTime) === String(data.newStartTime));
      if (matched) { data.newEndDate = matched.endDate || matched.date; data.newEndTime = matched.endTime || ''; }
    }
  } else {
    const currentMonth = String(currentRow.streamDate).substring(0, 7);
    if (String(data.newDate).substring(0, 7) !== currentMonth) {
      return { success: false, error: 'You can only reschedule within the same month.' };
    }
  }

  if (data.newDate === String(currentRow.streamDate) && data.newStartTime === String(currentRow.streamTime || '')) {
    return { success: false, error: 'The new date and time is the same as the current slot.' };
  }

  const newStart = new Date(data.newDate + 'T' + (data.newStartTime || '00:00'));
  const newEnd   = new Date((data.newEndDate || data.newDate) + 'T' + (data.newEndTime || '00:00'));
  if ((newEnd - newStart) < 2 * 60 * 60 * 1000) {
    return { success: false, error: 'Each stream must be at least 2 hours long.' };
  }

  // Conflict check: other creator apps for same shop, same date range
  const shopId = brandApp ? String(brandApp.shopId || brandApp.brandId || '') : '';
  let baIdsForShop = [String(currentRow.brandApplicationId)];
  if (shopId) {
    const { data: baRows } = await db.client.from('brand_applications').select('id').eq('shop_id', shopId);
    if (baRows && baRows.length) baIdsForShop = baRows.map(r => String(r.id));
  }

  const { data: conflictRows } = await db.client
    .from('creator_applications')
    .select('id, stream_date, stream_time, stream_end_date, stream_end_time, status')
    .in('brand_application_id', baIdsForShop)
    .not('status', 'in', '("rejected","cancelled")')
    .neq('id', id);

  const newSlot = { date: data.newDate, startTime: data.newStartTime, endDate: data.newEndDate || data.newDate, endTime: data.newEndTime || '' };
  for (const r of (conflictRows || [])) {
    if (timeslotsOverlap(newSlot, { date: r.stream_date, startTime: r.stream_time, endDate: r.stream_end_date, endTime: r.stream_end_time })) {
      return { success: false, error: 'This timeslot conflicts with another approved stream for this shop.' };
    }
  }

  const oldDate = currentRow.streamDate;
  const oldStartTime = currentRow.streamTime;
  const oldEndDate = currentRow.streamEndDate;
  const oldEndTime = currentRow.streamEndTime;

  const updates = {
    streamDate: data.newDate,
    streamTime: data.newStartTime || '',
    streamEndDate: data.newEndDate || data.newDate,
    streamEndTime: data.newEndTime || '',
  };
  await db.updateById('creator_applications', id, updates);

  const updatedRow = Object.assign({}, currentRow, updates);

  // Email + Telegram notifications
  sendEmailNotification_SlotRescheduled(updatedRow, oldDate, oldStartTime, oldEndDate, oldEndTime, brandApp).catch(console.error);
  const chatId = await getTelegramChatId(currentRow.telegram);
  if (chatId) {
    sendRescheduledApprovalNotification(updatedRow, chatId, oldDate, oldStartTime, oldEndDate, oldEndTime).catch(console.error);
  }

  return { success: true };
}

// ─── Auth / Login ─────────────────────────────────────────────────────────────

async function validateBrandLogin(shopId, shopName) {
  const sellers = await db.all('sellers');
  const byId = sellers.find(s => String(s.id) === String(shopId));
  if (byId) {
    if (String(byId.name).toLowerCase() === String(shopName).toLowerCase()) {
      return { success: true, exists: true, seller: byId, pinSet: !!byId.pinHash };
    }
    return { success: false, error: 'Shop Name does not match the registered Shop ID. Please check your credentials.' };
  }
  const byName = sellers.find(s => String(s.name).toLowerCase() === String(shopName).toLowerCase());
  if (byName) return { success: false, error: 'This Shop Name is already registered under a different Shop ID. Please check your credentials.' };
  return { success: true, exists: false };
}

async function validateCreatorLogin(affiliateId, affiliateUsername, phone) {
  // Gate check
  const { data: managedRows } = await db.client.from('managed_affiliates').select('affiliate_id').eq('affiliate_id', String(affiliateId).trim().toLowerCase());
  if (!managedRows || managedRows.length === 0) {
    return { success: false, error: 'Login Unavailable. Please contact Shopee Livestream Talent Management PIC - ' + (process.env.FALLBACK_PIC_NUMBER || '+65 9456 8465') + ' if you have any questions.' };
  }

  const affiliates = await db.all('affiliates');
  const byId    = affiliates.find(a => String(a.id).toLowerCase() === String(affiliateId).toLowerCase());
  const byName  = affiliates.find(a => String(a.name).toLowerCase() === String(affiliateUsername).toLowerCase());
  const byPhone = affiliates.find(a => String(a.phone) === String(phone));

  const matched = byId || byName || byPhone;
  if (matched) {
    if (
      String(matched.id).toLowerCase() !== String(affiliateId).toLowerCase() ||
      String(matched.name).toLowerCase() !== String(affiliateUsername).toLowerCase() ||
      String(matched.phone) !== String(phone)
    ) {
      if (byId && (String(byId.name).toLowerCase() !== String(affiliateUsername).toLowerCase() || String(byId.phone) !== String(phone)))
        return { success: false, error: 'Affiliate Username or Phone Number does not match the registered Affiliate ID.' };
      if (byName && (String(byName.id).toLowerCase() !== String(affiliateId).toLowerCase() || String(byName.phone) !== String(phone)))
        return { success: false, error: 'Affiliate ID or Phone Number does not match the registered Affiliate Username.' };
      return { success: false, error: 'One or more fields do not match the registered account. Please check your credentials.' };
    }
    return { success: true, exists: true, affiliate: matched, pinSet: !!matched.pinHash };
  }
  return { success: true, exists: false };
}

async function validateInternalLogin(password, email) {
  if (String(password) !== INTERNAL_PASSWORD) return { success: false, error: 'Incorrect password. Please try again.' };
  if (!email || !String(email).trim()) return { success: false, error: 'Please enter your email.' };
  const emailStr = String(email).trim().toLowerCase();
  const { data } = await db.client.from('internal_team').select('id, email').ilike('email', emailStr).maybeSingle();
  if (data) return { success: true, member: { id: data.id, email: emailStr } };
  return { success: false, error: 'Email not registered. Please contact an administrator.' };
}

// ─── PIN management ───────────────────────────────────────────────────────────

async function setPin(userId, userType, pin) {
  if (!/^\d{6}$/.test(String(pin))) return { success: false, error: 'PIN must be exactly 6 digits' };
  const table = userType === 'brand' ? 'sellers' : 'affiliates';
  const salt = randomUUID();
  const hash = hashPin(salt, String(pin));
  await db.updateById(table, userId, { pinSalt: salt, pinHash: hash });
  return { success: true };
}

async function validatePin(userId, userType, pin) {
  const table = userType === 'brand' ? 'sellers' : 'affiliates';
  const user = await db.findById(table, userId);
  if (!user) return { success: false, error: 'User not found' };
  if (!user.pinHash) return { success: false, error: 'No PIN set' };
  const hash = hashPin(String(user.pinSalt), String(pin));
  return { success: true, valid: hash === String(user.pinHash) };
}

async function changePin(userId, userType, currentPin, newPin) {
  if (!/^\d{6}$/.test(String(newPin))) return { success: false, error: 'New PIN must be exactly 6 digits' };
  const table = userType === 'brand' ? 'sellers' : 'affiliates';
  const user = await db.findById(table, userId);
  if (!user) return { success: false, error: 'User not found' };
  if (!user.pinHash) return { success: false, error: 'No PIN set for this account' };
  if (hashPin(String(user.pinSalt), String(currentPin)) !== String(user.pinHash)) return { success: false, error: 'Current PIN is incorrect' };
  const newSalt = randomUUID();
  await db.updateById(table, userId, { pinSalt: newSalt, pinHash: hashPin(newSalt, String(newPin)) });
  return { success: true };
}

async function adminResetPin(userId, userType) {
  const table = userType === 'brand' ? 'sellers' : 'affiliates';
  await db.updateById(table, userId, { pinSalt: '', pinHash: '' });
  return { success: true };
}

// ─── Profile updates ──────────────────────────────────────────────────────────

async function updateSellerProfile(shopId, data) {
  const updates = {};
  if (data.name)                     updates.name = data.name;
  if (data.siteAddress !== undefined) updates.siteAddress = data.siteAddress;
  if (data.sitePostalCode !== undefined) updates.sitePostalCode = data.sitePostalCode;

  const seller = await db.findById('sellers', shopId);
  if (!seller) return { success: false, error: 'Seller not found' };

  await db.updateById('sellers', shopId, updates);

  if (data.name) {
    // Cascade name to brand_applications
    await db.client
      .from('brand_applications')
      .update({ brand_name: data.name, shop_name: data.name })
      .eq('brand_id', String(shopId));

    // Cascade name to creator_applications via brand_application_id
    const { data: baRows } = await db.client.from('brand_applications').select('id').eq('brand_id', String(shopId));
    if (baRows && baRows.length) {
      const ids = baRows.map(r => r.id);
      await db.client.from('creator_applications').update({ brand_name: data.name, shop_name: data.name }).in('brand_application_id', ids);
    }
  }

  return { success: true };
}

async function updateAffiliateProfile(affiliateId, data) {
  const affiliates = await db.all('affiliates');
  const current = affiliates.find(a => String(a.id) === String(affiliateId));
  if (!current) return { success: false, error: 'Affiliate not found' };

  if (data.name && String(data.name).toLowerCase() !== String(current.name).toLowerCase()) {
    const dup = affiliates.find(a => String(a.id) !== String(affiliateId) && String(a.name).toLowerCase() === String(data.name).toLowerCase());
    if (dup) return { success: false, error: 'Another creator already uses this username. Please choose a different one.' };
  }
  if (data.id && String(data.id).toLowerCase() !== String(affiliateId).toLowerCase()) {
    const dupId = affiliates.find(a => String(a.id).toLowerCase() === String(data.id).toLowerCase());
    if (dupId) return { success: false, error: 'Another creator is already registered with this Affiliate ID.' };
  }

  const affUpdates = {};
  if (data.id !== undefined)                    affUpdates.id = data.id;
  if (data.name !== undefined)                  affUpdates.name = data.name;
  if (data.phone !== undefined)                 affUpdates.phone = data.phone;
  if (data.shippingAddress !== undefined)       affUpdates.shippingAddress = data.shippingAddress;
  if (data.shippingPostalCode !== undefined)    affUpdates.shippingPostalCode = data.shippingPostalCode;
  if (data.deliveryInstructions !== undefined)  affUpdates.deliveryInstructions = data.deliveryInstructions;
  if (data.shippingRecipientName !== undefined) affUpdates.shippingRecipientName = data.shippingRecipientName;

  await db.updateById('affiliates', affiliateId, affUpdates);

  // Cascade to creator_applications
  const caUpdates = {};
  if (data.id !== undefined)              caUpdates.creator_id = data.id;
  if (data.name !== undefined)            caUpdates.creator_name = data.name;
  if (data.phone !== undefined)           caUpdates.phone = data.phone;
  if (data.shippingAddress !== undefined) caUpdates.shipping_address = data.shippingAddress;
  if (data.shippingPostalCode !== undefined) caUpdates.shipping_postal_code = data.shippingPostalCode;
  if (Object.keys(caUpdates).length) {
    await db.client.from('creator_applications').update(caUpdates).eq('creator_id', String(affiliateId));
  }

  return { success: true };
}

// ─── File upload (Supabase Storage) ──────────────────────────────────────────

async function uploadBriefFile(fileName, base64Data, mimeType) {
  try {
    const { supabase } = require('./lib/db');
    const buffer = Buffer.from(base64Data, 'base64');
    const path = `briefs/${Date.now()}_${fileName}`;
    const { error } = await supabase.storage.from('briefs').upload(path, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false,
    });
    if (error) return { success: false, error: error.message };
    const { data } = supabase.storage.from('briefs').getPublicUrl(path);
    return { success: true, fileUrl: data.publicUrl };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Telegram webhook handler ─────────────────────────────────────────────────

async function handleTelegramUpdate(update) {
  if (update.callback_query) {
    await handleTelegramCallback(update.callback_query);
    return;
  }
  if (update.message && update.message.text) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const username = (msg.from.username || '').toLowerCase();

    if (text === '/start') {
      const existing = await getTelegramChatId(username);
      if (existing === String(chatId)) return;
      await saveTelegramUser(username, chatId);
      await telegramSend('sendMessage', {
        chat_id: String(chatId),
        text: '✅ Welcome to Shopee Live Creator Match!\n\nYour Telegram is now linked. You will receive notifications here when your applications are approved.\n\nNo further action needed — just keep this chat open.',
      });
      return;
    }
    await telegramSend('sendMessage', {
      chat_id: chatId,
      text: 'Hi! I only send notifications here. Please log in to the Shopee Live Creator Match app to manage your applications.',
    });
  }
}

async function handleTelegramCallback(callback) {
  const data = callback.data;
  const chatId = callback.message.chat.id;

  if (data && data.startsWith('confirm_')) {
    await telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'Your slot has already been confirmed by Shopee — no action needed!', show_alert: true });
  }
  if (data && data.startsWith('reject_')) {
    await telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'Rejection is no longer available. Please use the Shopee Live Creator Match app to reschedule if needed.', show_alert: true });
  }

  if (data && data.startsWith('sample_received_') && !data.startsWith('sample_received_undo_')) {
    await telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: '' });

    const rowId = data.substring(16);
    const row = await db.findById('creator_applications', rowId);
    if (!row) {
      await telegramSend('sendMessage', { chat_id: chatId, text: '⚠️ Record not found.' });
      return;
    }

    if (!row.sampleSentAt) {
      await telegramSend('editMessageReplyMarkup', { chat_id: chatId, message_id: callback.message.message_id, reply_markup: JSON.stringify({ inline_keyboard: [] }) });
      await telegramSend('sendMessage', { chat_id: chatId, text: '⚠️ This notification is outdated — the sample dispatch was cancelled. You will be notified again once samples are on the way.' });
      return;
    }

    if (row.sampleReceivedAt) {
      await telegramSend('sendMessage', { chat_id: chatId, text: 'ℹ️ You have already confirmed receipt of these samples.' });
      return;
    }

    const receivedAt = new Date().toISOString();
    const confirmedDateStr = new Date().toLocaleDateString('en-SG');

    await telegramSend('editMessageText', {
      chat_id: chatId,
      message_id: callback.message.message_id,
      text: callback.message.text + '\n\n✅ SAMPLES RECEIVED — ' + confirmedDateStr + '\n\nTo undo this, please log in to the app.',
      reply_markup: JSON.stringify({ inline_keyboard: [] }),
    });

    await db.updateById('creator_applications', rowId, { sampleReceivedAt: receivedAt });
  }
}

// ─── Email notification functions ─────────────────────────────────────────────

async function getInternalTeamEmails() {
  const { data } = await db.client.from('internal_team').select('email');
  return (data || []).map(r => r.email).filter(Boolean);
}

async function sendEmailToSeller_BrandAppApproved(app) {
  if (!app.sellerPicEmail) return;
  const subject = '[Shopee Live Creator Match] Your Application Has Been Approved!';
  const body = 'Great news! Your brand application has been approved.\n\n'
    + 'Shop Name: ' + (app.shopName || app.brandName) + '\n'
    + 'Stream Month: ' + (app.month || '') + '\n'
    + 'Streams Requested: ' + (app.streamCount || '') + '\n\n'
    + 'Creators can now apply for your livestream slots. You will be notified when a creator confirms a slot.\n\n'
    + 'Thank you for using Shopee Live Creator Match!';
  const rmEmail = await getRmEmail(app.shopId || app.brandId);
  await sendEmail(app.sellerPicEmail, subject, body, rmEmail ? { cc: rmEmail } : {});
}

async function sendRejectionEmailToBrandApp(app, reason) {
  if (!app.sellerPicEmail) return;
  const contactString = await getInternalPicContactString();
  const subject = '[Shopee Live Creator Match] Brand Application Rejected — ' + (app.shopName || app.brandName || '');
  const body = 'Your brand application has been rejected by Shopee.\n\n'
    + 'Shop: ' + (app.shopName || app.brandName || '') + '\n'
    + 'Month: ' + (app.month || '') + '\n'
    + (reason ? 'Reason: ' + reason + '\n' : '')
    + '\nIf you have any questions, please contact ' + contactString + '.\n\n'
    + 'Thank you for using Shopee Live Creator Match!';
  const rmEmail = await getRmEmail(app.shopId || app.brandId);
  await sendEmail(app.sellerPicEmail, subject, body, rmEmail ? { cc: rmEmail } : {});
}

async function sendCancellationEmail_BrandApp(app, reason) {
  if (!app.sellerPicEmail) return;
  const contactString = await getInternalPicContactString();
  const subject = '[Shopee Live Creator Match] Brand Application Cancelled — ' + (app.shopName || app.brandName || '');
  const body = 'Your brand application has been cancelled.\n\n'
    + 'Shop: ' + (app.shopName || app.brandName || '') + '\n'
    + 'Month: ' + (app.month || '') + '\n'
    + (reason ? 'Reason: ' + reason + '\n' : '')
    + '\nIf you have any questions, please contact ' + contactString + '.\n\n'
    + 'Thank you for using Shopee Live Creator Match!';
  const rmEmail = await getRmEmail(app.shopId || app.brandId);
  await sendEmail(app.sellerPicEmail, subject, body, rmEmail ? { cc: rmEmail } : {});
}

async function sendCancellationEmail_CreatorApp(creatorApp, brandApp, reason) {
  if (!brandApp || !brandApp.sellerPicEmail) return;
  const subject = '[Shopee Live Creator Match] Creator Stream Cancelled - ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '');
  const body = 'A creator has cancelled their livestream slot.\n\n'
    + 'Creator: ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '') + '\n'
    + 'Shop: ' + (creatorApp.brandName || creatorApp.shopName || '') + '\n'
    + 'Slot: ' + (creatorApp.streamDate || '') + (creatorApp.streamTime ? ' ' + creatorApp.streamTime : '') + '\n'
    + (reason ? 'Reason: ' + reason + '\n' : '')
    + '\nPlease update your livestream schedule accordingly.\n\nThank you for using Shopee Live Creator Match!';
  const rmEmail = await getRmEmail(brandApp.shopId || brandApp.brandId);
  await sendEmail(brandApp.sellerPicEmail, subject, body, rmEmail ? { cc: rmEmail } : {});
}

async function sendEmailToSeller_CreatorConfirmed(creatorApp) {
  const brandApp = await db.findById('brand_applications', creatorApp.brandApplicationId);
  if (!brandApp || !brandApp.sellerPicEmail) return;
  const slotText = (creatorApp.streamDate || '') + (creatorApp.streamTime ? ' ' + creatorApp.streamTime : '') + (creatorApp.streamEndTime ? ' – ' + creatorApp.streamEndTime : '');
  const subject = '[Shopee Live Creator Match] Creator Approved - ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '');
  const body = 'A creator has been approved and confirmed for a livestream slot.\n\n'
    + 'Affiliate Username: ' + (creatorApp.affiliateUsername || '') + '\n'
    + 'Telegram: ' + (creatorApp.telegram || '') + '\n'
    + 'Phone: ' + (creatorApp.phone || '') + '\n'
    + 'Slot: ' + slotText + '\n'
    + 'Shipping Address: ' + (creatorApp.shippingAddress || '') + (creatorApp.shippingPostalCode ? ', S' + creatorApp.shippingPostalCode : '') + '\n'
    + (creatorApp.deliveryInstructions ? 'Delivery Instructions: ' + creatorApp.deliveryInstructions + '\n' : '')
    + '\nPlease coordinate with the creator for product sample delivery.\n\nThank you for using Shopee Live Creator Match!';
  const rmEmail = await getRmEmail(brandApp.shopId || brandApp.brandId);
  await sendEmail(brandApp.sellerPicEmail, subject, body, rmEmail ? { cc: rmEmail } : {});
}

async function sendEmailNotification_SlotRescheduled(creatorApp, oldDate, oldStartTime, oldEndDate, oldEndTime, brandApp) {
  if (!brandApp || !brandApp.sellerPicEmail) return;
  const subject = '[Shopee Live Creator Match] Slot Rescheduled - ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '');
  const body = 'A creator has rescheduled their livestream slot.\n\n'
    + 'Creator: ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '') + '\n'
    + 'Old slot: ' + oldDate + (oldStartTime ? ' ' + oldStartTime : '') + (oldEndTime ? ' – ' + oldEndTime : '') + '\n'
    + 'New slot: ' + (creatorApp.streamDate || '') + (creatorApp.streamTime ? ' ' + creatorApp.streamTime : '') + (creatorApp.streamEndTime ? ' – ' + creatorApp.streamEndTime : '') + '\n\n'
    + 'Thank you for using Shopee Live Creator Match!';
  const rmEmail = await getRmEmail(brandApp.shopId || brandApp.brandId);
  await sendEmail(brandApp.sellerPicEmail, subject, body, rmEmail ? { cc: rmEmail } : {});
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function snakeToCamelObj(row) {
  const obj = {};
  for (const [k, v] of Object.entries(row || {})) {
    obj[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return obj;
}

module.exports = router;
