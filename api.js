'use strict';
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const { db, supabase } = require('./lib/db');
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
      case 'getInternalTeam':
        result = await getInternalTeam();
        break;
      case 'addInternalTeamMember':
        result = await addInternalTeamMember(JSON.parse(req.query.data));
        break;
      case 'updateInternalTeamMember':
        result = await updateInternalTeamMember(req.query.id, JSON.parse(req.query.data));
        break;
      case 'deleteInternalTeamMember':
        result = await deleteInternalTeamMember(req.query.id);
        break;
      case 'searchBrandAppsForBriefReupload':
        result = await searchBrandAppsForBriefReupload(req.query.query);
        break;
      case 'updateBriefLink':
        result = await updateBriefLink(req.query.appId, req.query.briefUrl);
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
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
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
  const [sellers, affiliates, managedSellers, managedAffiliates, businessMappingValues] =
    await Promise.all([
      db.all('sellers'),
      db.all('affiliates'),
      db.all('managed_sellers'),
      db.all('managed_affiliates'),
      db.all('business_mapping_values'),
    ]);

  // Fetch all rows for a table in parallel pages (get count first, then all pages simultaneously)
  const PAGE = 1000;
  async function fetchAllParallel(buildCountQ, buildPageQ) {
    const { count, error: countErr } = await buildCountQ();
    if (countErr) throw new Error(countErr.message);
    if (!count) return [];
    const numPages = Math.ceil(count / PAGE);
    const results = await Promise.all(
      Array.from({ length: numPages }, (_, i) => buildPageQ(i * PAGE, (i + 1) * PAGE - 1))
    );
    const rows = [];
    for (const { data, error } of results) {
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
    }
    return rows;
  }

  // Brand applications and creator applications fetched in parallel
  const [baRaw, caRaw] = await Promise.all([
    fetchAllParallel(
      () => {
        let q = db.client.from('brand_applications').select('*', { count: 'exact', head: true });
        if (filterMonth) q = q.gte('month', filterMonth);
        return q;
      },
      (from, to) => {
        let q = db.client.from('brand_applications').select('*').range(from, to);
        if (filterMonth) q = q.gte('month', filterMonth);
        return q;
      }
    ),
    fetchAllParallel(
      () => {
        let q = db.client.from('creator_applications').select('*', { count: 'exact', head: true });
        if (filterMonth) q = q.gte('stream_date', filterMonth + '-01');
        return q;
      },
      (from, to) => {
        let q = db.client.from('creator_applications').select('*').range(from, to);
        if (filterMonth) q = q.gte('stream_date', filterMonth + '-01');
        return q;
      }
    ),
  ]);

  const brandApplications = baRaw.map(row => {
    const obj = {};
    for (const [k, v] of Object.entries(row)) obj[snakeToCamelLocal(k)] = v;
    return obj;
  });
  const creatorApplications = caRaw.map(row => {
    const obj = {};
    for (const [k, v] of Object.entries(row)) obj[snakeToCamelLocal(k)] = v;
    return obj;
  });

  return { sellers, affiliates, slots: [], bookings: [], brandApplications, creatorApplications, managedSellers, managedAffiliates, businessMappingValues };
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

async function addBrandApplication(data) {
  await db.insert('brand_applications', data);
  return { success: true, data };
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
    console.log('[updateBrandApplication] Sending approval email to:', updatedApp.sellerPicEmail);
    sendEmailToSeller_BrandAppApproved(updatedApp).catch(console.error);
  }
  if (String(data.status) === 'rejected' && String(currentApp.status) !== 'rejected') {
    console.log('[updateBrandApplication] Sending rejection email to:', updatedApp.sellerPicEmail);
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
    const gasUrl = process.env.GAS_URL;
    if (!gasUrl) return { success: false, error: 'GAS_URL not configured' };
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'uploadBrief', fileName, fileData: base64Data, mimeType }),
      redirect: 'follow',
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { return { success: false, error: 'Non-JSON response from GAS: ' + text.substring(0, 200) }; }
    if (data && data.success) return { success: true, fileUrl: data.fileUrl };
    return { success: false, error: (data && data.error) || 'Upload failed' };
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
  const body = 'Hello, ' + (app.shopName || app.brandName) + '!\n\n'
    + 'Great news! Your brand\'s livestream application has been approved!\n\n'
    + 'Stream month: ' + (app.month || '') + '\n'
    + 'Streams Requested: ' + (app.streamCount || '') + '\n\n'
    + 'Creators can now apply to stream for your brand.\n'
    + 'Please note that this does not guarantee that all slots will be taken.\n\n'
    + 'Next steps:\n'
    + '1) You will be notified when a creator confirms a slot.\n'
    + '2) Once confirmed, please ensure that products are sent to the matched creators and AMS commissions have been set up!\n\n'
    + 'Thank you for using Shopee Live Creator Match!\n\n'
    + 'Best regards,\n'
    + 'Shopee Live Team\n\n'
    + '*This email was automatically generated. Please do not reply.';
  const rmEmail = await getRmEmail(app.shopId || app.brandId);
  await sendEmail(app.sellerPicEmail, subject, body, rmEmail ? { cc: rmEmail } : {});
}

async function sendRejectionEmailToBrandApp(app, reason) {
  if (!app.sellerPicEmail) return;
  const contactString = await getInternalPicContactString();
  const subject = '[Shopee Live Creator Match] Brand Application Rejected — ' + (app.shopName || app.brandName || '');
  const body = 'Hello, ' + (app.shopName || app.brandName || '') + '!\n\n'
    + 'Unfortunately, your brand\'s livestream application has been rejected by Shopee for the following reason:\n\n'
    + 'Stream month: ' + (app.month || '') + '\n'
    + 'Reason: ' + (reason || '') + '\n\n'
    + 'If the issue is able to be resolved, we encourage you to re-apply.\n\n'
    + 'We apologise for the inconvenience. If you have any questions, please contact ' + contactString + '\n\n'
    + 'Thank you for using Shopee Live Creator Match!\n\n'
    + 'Best regards,\n'
    + 'Shopee Live Team\n\n'
    + '*This email was automatically generated. Please do not reply.';
  const rmEmail = await getRmEmail(app.shopId || app.brandId);
  await sendEmail(app.sellerPicEmail, subject, body, rmEmail ? { cc: rmEmail } : {});
}

async function sendCancellationEmail_BrandApp(app, reason) {
  if (!app.sellerPicEmail) return;
  const contactString = await getInternalPicContactString();
  const subject = '[Shopee Live Creator Match] Brand Application Cancelled — ' + (app.shopName || app.brandName || '');
  const body = 'Hello, ' + (app.shopName || app.brandName || '') + '!\n\n'
    + 'Unfortunately, your brand\'s livestream application has been cancelled by Shopee for the following reason:\n\n'
    + 'Stream month: ' + (app.month || '') + '\n'
    + 'Reason: ' + (reason || '') + '\n\n'
    + 'We apologise for the inconvenience. If you have any questions, please contact ' + contactString + '\n\n'
    + 'Thank you for using Shopee Live Creator Match!\n\n'
    + 'Best regards,\n'
    + 'Shopee Live Team\n\n'
    + '*This email was automatically generated. Please do not reply.';
  const rmEmail = await getRmEmail(app.shopId || app.brandId);
  await sendEmail(app.sellerPicEmail, subject, body, rmEmail ? { cc: rmEmail } : {});
}

async function sendCancellationEmail_CreatorApp(creatorApp, brandApp, reason) {
  if (!brandApp || !brandApp.sellerPicEmail) return;
  const contactString = await getInternalPicContactString();
  const slotText = (creatorApp.streamDate || '') + (creatorApp.streamTime ? ' ' + creatorApp.streamTime : '') + (creatorApp.streamEndTime ? ' - ' + creatorApp.streamEndTime : '');
  const subject = '[Shopee Live Creator Match] Creator Stream Cancelled - ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '');
  const body = 'Hello, ' + (brandApp.shopName || brandApp.brandName || '') + '!\n\n'
    + 'Unfortunately, your brand\'s livestream has been cancelled by Shopee for the following reason:\n\n'
    + 'Creator: ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '') + '\n'
    + 'Slot: ' + slotText + '\n'
    + 'Reason: ' + (reason || '') + '\n\n'
    + 'We apologise for the inconvenience. If you have any questions, please contact ' + contactString + '\n\n'
    + 'Thank you for using Shopee Live Creator Match!\n\n'
    + 'Best regards,\n'
    + 'Shopee Live Team\n\n'
    + '*This email was automatically generated. Please do not reply.';
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
  const oldSlotText = oldDate + (oldStartTime ? ' ' + oldStartTime : '') + (oldEndTime ? ' - ' + oldEndTime : '');
  const newSlotText = (creatorApp.streamDate || '') + (creatorApp.streamTime ? ' ' + creatorApp.streamTime : '') + (creatorApp.streamEndTime ? ' - ' + creatorApp.streamEndTime : '');
  const subject = '[Shopee Live Creator Match] Slot Rescheduled - ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '');
  const body = 'Hello, ' + (brandApp.shopName || brandApp.brandName || '') + '!\n\n'
    + 'A creator has rescheduled their livestream slot for your brand.\n'
    + 'Please take note of the new date below and ensure product samples have been delivered and AMS commissions are set up accordingly.\n\n'
    + 'Creator: ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '') + '\n'
    + 'Old Slot: ' + oldSlotText + '\n'
    + 'New Slot: ' + newSlotText + '\n\n'
    + 'We apologise for the inconvenience.\n\n'
    + 'Thank you for using Shopee Live Creator Match!\n\n'
    + 'Best regards,\n'
    + 'Shopee Live Team\n\n'
    + '*This email was automatically generated. Please do not reply.';
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

// ─── Sync Managed Data from GAS ────────────────────────────────────────────────

async function syncManagedData() {
  try {
    const GAS_URL = process.env.GAS_URL;
    if (!GAS_URL) throw new Error('GAS_URL not configured');

    console.log('[syncManagedData] Fetching from GAS...');
    const url = `${GAS_URL}?action=getManagedData`;
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();

    // Sync managed_sellers
    const managedSellers = (data.managedSellers || []).map(s => ({
      shop_id: String(s.Shopid || s.shopId || s.shop_id || '').trim(),
      rm_email: String(s['RM email'] || s.rmEmail || s.rm_email || '').trim(),
      cluster: String(s.Cluster || s.cluster || '').trim(),
      category: String(s.Category || s.category || '').trim(),
      username: String(s.Username || s.username || '').trim(),
      shop_name: String(s['Shop Name'] || s.shopName || s.shop_name || '').trim(),
    })).filter(r => r.shop_id);

    // Sync managed_affiliates
    const managedAffiliates = (data.managedAffiliates || []).map(a => ({
      affiliate_id: String(a.affiliate_id || a.affiliateId || '').trim().toLowerCase(),
      affiliate_name: String(a.affiliate_name || a.affiliateName || '').trim(),
    })).filter(r => r.affiliate_id);

    let sellerCount = 0, affiliateCount = 0;

    if (managedSellers.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < managedSellers.length; i += BATCH) {
        const batch = managedSellers.slice(i, i + BATCH);
        const { error } = await supabase.from('managed_sellers').upsert(batch, { onConflict: 'shop_id' });
        if (error) throw new Error(`Upsert managed_sellers: ${error.message}`);
        sellerCount += batch.length;
      }
    }

    if (managedAffiliates.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < managedAffiliates.length; i += BATCH) {
        const batch = managedAffiliates.slice(i, i + BATCH);
        const { error } = await supabase.from('managed_affiliates').upsert(batch, { onConflict: 'affiliate_id' });
        if (error) throw new Error(`Upsert managed_affiliates: ${error.message}`);
        affiliateCount += batch.length;
      }
    }

    console.log(`[syncManagedData] Done. Sellers: ${sellerCount}, Affiliates: ${affiliateCount}`);
    return { success: true, sellerCount, affiliateCount };
  } catch (err) {
    console.error('[syncManagedData]', err.message);
    throw err;
  }
}

router.post('/syncManagedData', async (req, res) => {
  try {
    const result = await syncManagedData();
    res.json(result);
  } catch (err) {
    console.error('[POST /syncManagedData]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Business Mapping Values Config ────────────────────────────────────────────

router.get('/configTable', async (req, res) => {
  try {
    const { data, error } = await supabase.from('business_mapping_values').select('*');
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('[GET /configTable]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/configTable/add', async (req, res) => {
  try {
    const { type, code, description, active } = req.body;
    const { data, error } = await supabase
      .from('business_mapping_values')
      .insert([{ type, code, description, active }])
      .select();
    if (error) throw error;
    res.json({ success: true, data: data?.[0] });
  } catch (err) {
    console.error('[POST /configTable/add]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/configTable/update', async (req, res) => {
  try {
    const { id, type, code, description, active } = req.body;
    const { data, error } = await supabase
      .from('business_mapping_values')
      .update({ type, code, description, active })
      .eq('id', id)
      .select();
    if (error) throw error;
    res.json({ success: true, data: data?.[0] });
  } catch (err) {
    console.error('[POST /configTable/update]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/configTable/delete', async (req, res) => {
  try {
    const { id } = req.body;
    const { error } = await supabase
      .from('business_mapping_values')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /configTable/delete]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Sheets Sync ────────────────────────────────────────────────────

const SHEET_ID = '170ruk_B9l3sLvxYCtMDNgpM6ncxqCyPhyVyuvvmzSXI';
const CREDS_PATH = path.join(__dirname, 'docs/shopee-live-creator-match-db9d7b015207.json');

const getGoogleSheetsClient = async () => {
  const credentials = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
};

const syncToGoogleSheets = async () => {
  try {
    const sheets = await getGoogleSheetsClient();
    console.log('[syncToGoogleSheets] Starting sync...');

    // Fetch all data from Supabase (7 tables)
    const [brandApps, creatorApps, sellers, affiliates, businessMappings, internalTeam, telegramUsers] = await Promise.all([
      db.all('brand_applications'),
      db.all('creator_applications'),
      db.all('sellers'),
      db.all('affiliates'),
      db.all('business_mapping_values'),
      db.all('internal_team'),
      db.all('telegram_users')
    ]);

    // Convert data to CSV format (first row = headers)
    const toRows = (data, headers) => {
      if (!data || data.length === 0) return [headers];
      return [
        headers,
        ...data.map(row => headers.map(h => String(row[h] || '').replace(/"/g, '""')))
      ];
    };

    const updates = [
      { range: 'BrandApplications', values: toRows(brandApps, Object.keys(brandApps[0] || {})) },
      { range: 'CreatorApplications', values: toRows(creatorApps, Object.keys(creatorApps[0] || {})) },
      { range: 'Sellers', values: toRows(sellers, Object.keys(sellers[0] || {})) },
      { range: 'Affiliates', values: toRows(affiliates, Object.keys(affiliates[0] || {})) },
      { range: 'BusinessMappingValues', values: toRows(businessMappings, Object.keys(businessMappings[0] || {})) },
      { range: 'InternalTeam', values: toRows(internalTeam, Object.keys(internalTeam[0] || {})) },
      { range: 'TelegramUsers', values: toRows(telegramUsers, Object.keys(telegramUsers[0] || {})) }
    ];

    // Clear and update each sheet
    for (const update of updates) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SHEET_ID,
        range: update.range
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: update.range,
        valueInputOption: 'RAW',
        requestBody: { values: update.values }
      });
    }

    console.log('[syncToGoogleSheets] Sync complete');
    return { success: true, synced: updates.length };
  } catch (err) {
    console.error('[syncToGoogleSheets]', err.message);
    throw err;
  }
};

const archiveOldApplications = async () => {
  try {
    const sheets = await getGoogleSheetsClient();
    console.log('[archiveOldApplications] Starting archive...');

    // Calculate cutoff date (6 months ago)
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);
    const cutoffMonthStr = cutoffDate.getFullYear() + '-' + String(cutoffDate.getMonth() + 1).padStart(2, '0');

    // Find old brand applications (by month)
    const { data: oldBrandApps } = await supabase
      .from('brand_applications')
      .select('*')
      .lt('month', cutoffMonthStr);

    // Find old creator applications (by stream_date)
    const { data: oldCreatorApps } = await supabase
      .from('creator_applications')
      .select('*')
      .lt('stream_date', cutoffDate.toISOString().split('T')[0]);

    let archivedCount = 0;

    // Archive brand applications
    if (oldBrandApps && oldBrandApps.length > 0) {
      const brandHeaders = Object.keys(oldBrandApps[0]);
      const brandRows = oldBrandApps.map(row => brandHeaders.map(h => String(row[h] || '')));

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'archive_BrandApplications',
        valueInputOption: 'RAW',
        requestBody: { values: brandRows }
      });
      archivedCount += oldBrandApps.length;
    }

    // Archive creator applications
    if (oldCreatorApps && oldCreatorApps.length > 0) {
      const creatorHeaders = Object.keys(oldCreatorApps[0]);
      const creatorRows = oldCreatorApps.map(row => creatorHeaders.map(h => String(row[h] || '')));

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'archive_CreatorApplications',
        valueInputOption: 'RAW',
        requestBody: { values: creatorRows }
      });
      archivedCount += oldCreatorApps.length;
    }

    if (archivedCount === 0) {
      console.log('[archiveOldApplications] No old data to archive');
      return { success: true, archived: 0 };
    }

    // Delete old records from Supabase
    const oldBrandAppIds = (oldBrandApps || []).map(a => a.id);
    const oldCreatorAppIds = (oldCreatorApps || []).map(a => a.id);

    if (oldBrandAppIds.length > 0) {
      await supabase.from('brand_applications').delete().in('id', oldBrandAppIds);
    }
    if (oldCreatorAppIds.length > 0) {
      await supabase.from('creator_applications').delete().in('id', oldCreatorAppIds);
    }

    console.log(`[archiveOldApplications] Archived ${archivedCount} records`);
    return { success: true, archived: archivedCount };
  } catch (err) {
    console.error('[archiveOldApplications]', err.message);
    throw err;
  }
};

router.post('/sync-google-sheets', async (req, res) => {
  try {
    const result = await syncToGoogleSheets();
    res.json(result);
  } catch (err) {
    console.error('[POST /sync-google-sheets]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/archive-old-applications', async (req, res) => {
  try {
    const result = await archiveOldApplications();
    res.json(result);
  } catch (err) {
    console.error('[POST /archive-old-applications]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Internal Team Management ─────────────────────────────────────────────────

async function getInternalTeam() {
  try {
    const { data } = await supabase.from('internal_team').select('*').order('created_at', { ascending: false });
    return { success: true, data: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function addInternalTeamMember(memberData) {
  try {
    const { error } = await supabase.from('internal_team').insert({
      id: memberData.id,
      email: memberData.email,
      created_at: new Date().toISOString()
    });
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function updateInternalTeamMember(id, updates) {
  try {
    const { error } = await supabase.from('internal_team').update(updates).eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteInternalTeamMember(id) {
  try {
    const { error } = await supabase.from('internal_team').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Brief Re-upload ──────────────────────────────────────────────────────────

async function searchBrandAppsForBriefReupload(query) {
  try {
    const currentMonth = getCurrentMonthStr();
    console.log('[searchBrandAppsForBriefReupload] currentMonth:', currentMonth, 'query:', query);
    let q = supabase.from('brand_applications')
      .select('id, shop_name, brand_name, month, status, livestream_brief')
      .in('status', ['approved', 'pending'])
      .gte('month', currentMonth);

    if (query && query.trim()) {
      const cleanQuery = query.toLowerCase().trim();
      const { data, error } = await q;
      if (error) console.log('[searchBrandAppsForBriefReupload] query error:', error);
      console.log('[searchBrandAppsForBriefReupload] found', data?.length || 0, 'records before filter');
      const filtered = (data || []).filter(app =>
        (app.shop_name && app.shop_name.toLowerCase().includes(cleanQuery)) ||
        (app.brand_name && app.brand_name.toLowerCase().includes(cleanQuery)) ||
        (app.id && app.id.toLowerCase().includes(cleanQuery))
      );
      console.log('[searchBrandAppsForBriefReupload] filtered to', filtered.length, 'records');
      return { success: true, data: filtered };
    }

    const { data, error } = await q;
    if (error) console.log('[searchBrandAppsForBriefReupload] query error:', error);
    console.log('[searchBrandAppsForBriefReupload] returning', data?.length || 0, 'records');
    return { success: true, data: data || [] };
  } catch (err) {
    console.error('[searchBrandAppsForBriefReupload]', err.message);
    return { success: false, error: err.message };
  }
}

async function updateBriefLink(appId, briefUrl) {
  try {
    const { error } = await supabase.from('brand_applications')
      .update({ livestreamBrief: briefUrl })
      .eq('id', appId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = router;
