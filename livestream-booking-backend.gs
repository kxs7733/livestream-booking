/**
 * StreamMatch - Google Apps Script Backend
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet
 * 2. Create 6 sheets (tabs) named exactly: Sellers, Affiliates, Slots, Bookings, BrandApplications, CreatorApplications
 * 3. Add headers to each sheet:
 *    - Sellers: id | name | createdAt | siteAddress | sitePostalCode
 *    - Affiliates: id | name | createdAt | phone | shippingAddress | shippingPostalCode
 *    - Slots: id | sellerId | sellerName | date | startTime | endTime | description | createdAt
 *    - Bookings: id | slotId | sellerId | sellerName | affiliateId | affiliateName | date | startTime | endTime | bookedAt
 *    - BrandApplications: id | brandId | brandName | shopId | shopName | month | streamCount | sellerType | productNominationsConfirmed | numProductsSponsored | streamLocation | hasPackageActivation | preferredDate | sellerSiteRequired | amsCommission | bundleDealsAgreed | voucherTier | creatorAssignmentAgreed | sellerPicName | sellerPicMobile | sellerPicEmail | status | createdAt | livestreamBrief | sellerSiteAddress | cancelReason | cancelledAt | brandActivationType | rejectedAt | rejectionReason | sellerSiteTimeslots | sellerSitePostalCode | sellerPdpaConsentGiven | loanedProductReturnCostsAgreed
 *    - CreatorApplications: id | creatorId | creatorName | brandApplicationId | brandName | shopName | streamDate | streamTime | streamEndDate | streamEndTime | affiliateUsername | phone | telegram | shippingAddress | willingToTravel | status | createdAt | sampleSentAt | sampleReceivedAt | hasSamples | cancelReason | cancelledAt | courier | trackingId | rejectedAt | rejectionReason | deliveryInstructions | shippingPostalCode | shippingRecipientName
 *    - InternalTeam: id | email | createdAt
 * 4. Go to Extensions > Apps Script
 * 5. Paste this code and save
 * 6. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. Copy the deployment URL and update API_URL in the HTML file
 */

// Keep-warm no-op — triggered every 5 minutes to prevent cold starts
function keepWarm() {}

// Get the active spreadsheet
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// Get sheet by name
function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

// Convert sheet data to array of objects
function sheetToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Only headers or empty

  const headers = data[0];
  const objects = [];

  for (let i = 1; i < data.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    // Only include non-empty rows
    if (obj.id) {
      objects.push(obj);
    }
  }
  return objects;
}

// Find row index by ID (1-based, including header)
function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return i + 1; // Sheet rows are 1-based
    }
  }
  return -1;
}

// Update a row by ID with partial data (forces plain text to prevent date auto-formatting)
function updateRowById(sheet, id, updates) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rowIndex = findRowById(sheet, id);
  if (rowIndex < 0) return false;

  for (const key in updates) {
    const colIndex = headers.indexOf(key);
    if (colIndex >= 0) {
      const cell = sheet.getRange(rowIndex, colIndex + 1);
      cell.setNumberFormat('@');
      cell.setValue(updates[key] == null ? '' : String(updates[key]));
    }
  }
  return true;
}

// GET handler
function doGet(e) {
  const action = e.parameter.action;
  let result;

  try {
    switch (action) {
      case 'getAllData':
        result = getAllData(e.parameter.allMonths === 'true', e.parameter.pastMonths ? parseInt(e.parameter.pastMonths) : 0);
        break;
      case 'addSeller':
        result = addSeller(JSON.parse(e.parameter.data));
        break;
      case 'addAffiliate':
        result = addAffiliate(JSON.parse(e.parameter.data));
        break;
      case 'addSlot':
        result = addSlot(JSON.parse(e.parameter.data));
        break;
      case 'addBooking':
        result = addBooking(JSON.parse(e.parameter.data));
        break;
      case 'addBrandApplication':
        result = addBrandApplication(JSON.parse(e.parameter.data));
        break;
      case 'addCreatorApplication':
        result = addCreatorApplication(JSON.parse(e.parameter.data));
        break;
      case 'updateBrandApplication':
        result = updateBrandApplication(e.parameter.id, JSON.parse(e.parameter.data));
        break;
      case 'toggleBrandPause':
        result = toggleBrandPause(e.parameter.id);
        break;
      case 'cancelBrandApplication':
        result = cancelBrandApplication(e.parameter.id, e.parameter.cancelReason);
        break;
      case 'updateCreatorApplication':
        result = updateCreatorApplication(e.parameter.id, JSON.parse(e.parameter.data));
        break;
      case 'rescheduleCreatorApplication':
        result = rescheduleCreatorApplication(e.parameter.id, JSON.parse(e.parameter.data));
        break;
      case 'deleteSlot':
        result = deleteSlot(e.parameter.id);
        break;
      case 'deleteBooking':
        result = deleteBooking(e.parameter.id);
        break;
      case 'validateBrandLogin':
        result = validateBrandLogin(e.parameter.shopId, e.parameter.shopName);
        break;
      case 'validateCreatorLogin':
        result = validateCreatorLogin(e.parameter.affiliateId, e.parameter.affiliateUsername, e.parameter.phone);
        break;
      case 'updateSellerProfile':
        result = updateSellerProfile(e.parameter.shopId, JSON.parse(e.parameter.data));
        break;
      case 'updateAffiliateProfile':
        result = updateAffiliateProfile(e.parameter.affiliateId, JSON.parse(e.parameter.data));
        break;
      case 'validateInternalLogin':
        result = validateInternalLogin(e.parameter.password, e.parameter.email);
        break;
      case 'setPin':
        result = setPin(e.parameter.userId, e.parameter.userType, e.parameter.pin);
        break;
      case 'validatePin':
        result = validatePin(e.parameter.userId, e.parameter.userType, e.parameter.pin);
        break;
      case 'changePin':
        result = changePin(e.parameter.userId, e.parameter.userType, e.parameter.currentPin, e.parameter.newPin);
        break;
      case 'adminResetPin':
        result = adminResetPin(e.parameter.userId, e.parameter.userType);
        break;
      default:
        result = { error: 'Unknown action' };
    }
  } catch (error) {
    result = { error: error.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// POST handler — handles Telegram webhooks, file uploads, and falls through to doGet
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // Telegram webhook — incoming message or callback
    if (body.update_id !== undefined) {
      // Deduplicate: skip if we've already processed this update_id (Telegram retries on slow responses)
      var props = PropertiesService.getScriptProperties();
      var lastId = parseInt(props.getProperty('lastUpdateId') || '0', 10);
      if (body.update_id <= lastId) {
        return ContentService.createTextOutput('ok');
      }
      props.setProperty('lastUpdateId', String(body.update_id));
      handleTelegramUpdate(body);
      return ContentService.createTextOutput('ok');
    }

    // File upload
    if (body.action === 'uploadBrief') {
      var result = uploadBriefFile(body.fileName, body.fileData, body.mimeType);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    // Fall through to doGet for non-JSON POST requests
  }
  return doGet(e);
}

// Upload brief file to Google Drive and return the file URL
function uploadBriefFile(fileName, base64Data, mimeType) {
  var decoded, blob, folder, file;
  try { decoded = Utilities.base64Decode(base64Data); } catch(e) { return { success: false, error: 'base64Decode failed: ' + e.toString() }; }
  try { blob = Utilities.newBlob(decoded, mimeType || 'application/octet-stream', fileName); } catch(e) { return { success: false, error: 'newBlob failed: ' + e.toString() }; }
  try { folder = getBriefFolder(); } catch(e) { return { success: false, error: 'getFolderById failed: ' + e.toString() }; }
  try { file = folder.createFile(blob); } catch(e) { return { success: false, error: 'createFile failed: ' + e.toString() }; }
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) { Logger.log('setSharing failed (non-fatal): ' + e.toString()); }
  return { success: true, fileUrl: file.getUrl(), fileId: file.getId() };
}

// Get the briefs folder in Drive — replace the folder ID with your own
const BRIEF_FOLDER_ID = '1hAlgJfaTVhz7qtaWXwXCIySv-PlxHIfF';

// Telegram Bot Token — replace with your bot token from @BotFather
const TELEGRAM_BOT_TOKEN = '8527763047:AAG0pCj2YZurmmucqUC3z9r2p1Zt2NqQP6I';

// Internal team dashboard password
const INTERNAL_PASSWORD = 'shopeelive2025';

function getBriefFolder() {
  return DriveApp.getFolderById(BRIEF_FOLDER_ID);
}

// Returns the current month string in YYYY-MM format.
// Used to filter brand/creator data to current month onwards.
function getCurrentMonthStr() {
  var now = new Date();
  var m = String(now.getMonth() + 1);
  if (m.length < 2) m = '0' + m;
  return now.getFullYear() + '-' + m;
}

// Get all data — filtered to current month onwards by default, or past N months + current onwards if pastMonths is set, or all data if allMonths=true
function getAllData(allMonths, pastMonths) {
  var sellers = sheetToObjects(getSheet('Sellers'));
  var affiliates = sheetToObjects(getSheet('Affiliates'));
  var slots = sheetToObjects(getSheet('Slots'));
  var bookings = sheetToObjects(getSheet('Bookings'));
  var brandApplications = sheetToObjects(getSheet('BrandApplications'));
  var creatorApplications = sheetToObjects(getSheet('CreatorApplications'));
  var managedSellers = (function() {
    var sheet = getSheet('Managed Sellers');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    var headers = data[0];
    var result = [];
    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) { obj[headers[j]] = data[i][j]; }
      if (obj.Shopid) result.push(obj);
    }
    return result;
  })();

  var managedAffiliates = (function() {
    var sheet = getSheet('Managed Affiliates');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    var headers = data[0];
    var result = [];
    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) { obj[headers[j]] = data[i][j]; }
      if (obj.affiliate_id) result.push(obj);
    }
    return result;
  })();

  var businessMappingValues = (function() {
    var sheet = getSheet('BusinessMappingValues');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    var headers = data[0];
    var result = [];
    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) { obj[headers[j]] = data[i][j]; }
      if (obj.Type) result.push(obj);
    }
    return result;
  })();

  if (!allMonths) {
    var currentMonth = getCurrentMonthStr();
    var filterMonth = currentMonth;

    // If pastMonths is specified, calculate the cutoff month (past N months from current)
    if (pastMonths && pastMonths > 0) {
      var d = new Date();
      d.setMonth(d.getMonth() - pastMonths);
      filterMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }

    brandApplications = brandApplications.filter(function(a) {
      return String(a.month) >= filterMonth;
    });
    var brandAppIds = {};
    brandApplications.forEach(function(a) { brandAppIds[a.id] = true; });
    creatorApplications = creatorApplications.filter(function(ca) {
      return brandAppIds[String(ca.brandApplicationId)] === true;
    });
  }

  return {
    sellers: sellers,
    affiliates: affiliates,
    slots: slots,
    bookings: bookings,
    brandApplications: brandApplications,
    creatorApplications: creatorApplications,
    managedSellers: managedSellers,
    managedAffiliates: managedAffiliates,
    businessMappingValues: businessMappingValues
  };
}

// Append a row with all cells forced to plain text (prevents date auto-formatting)
function appendRowAsText(sheet, values) {
  const lastRow = sheet.getLastRow() + 1;
  const range = sheet.getRange(lastRow, 1, 1, values.length);
  range.setNumberFormat('@');
  range.setValues([values.map(v => v == null ? '' : String(v))]);
}

// Append a row by matching column header names — safe against sheet column reordering
function appendRowByHeaders(sheet, data) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(function(h) { return data.hasOwnProperty(h) ? (data[h] == null ? '' : String(data[h])) : ''; });
  const lastRow = sheet.getLastRow() + 1;
  const range = sheet.getRange(lastRow, 1, 1, row.length);
  range.setNumberFormat('@');
  range.setValues([row]);
}

// Add seller
function addSeller(data) {
  const sheet = getSheet('Sellers');
  appendRowAsText(sheet, [data.id, data.name, data.createdAt, data.siteAddress || '', data.sitePostalCode || '']);
  return { success: true, data: data };
}

// Add affiliate
function addAffiliate(data) {
  const sheet = getSheet('Affiliates');
  appendRowAsText(sheet, [data.id, data.name, data.createdAt, data.phone || '']);
  return { success: true, data: data };
}

// Add slot
function addSlot(data) {
  const sheet = getSheet('Slots');
  appendRowAsText(sheet, [
    data.id,
    data.sellerId,
    data.sellerName,
    data.date,
    data.startTime,
    data.endTime,
    data.description || '',
    data.createdAt
  ]);
  return { success: true, data: data };
}

// Add booking
function addBooking(data) {
  const sheet = getSheet('Bookings');
  appendRowAsText(sheet, [
    data.id,
    data.slotId,
    data.sellerId,
    data.sellerName,
    data.affiliateId,
    data.affiliateName,
    data.date,
    data.startTime,
    data.endTime,
    data.bookedAt
  ]);
  return { success: true, data: data };
}

// Add brand application
function addBrandApplication(data) {
  const sheet = getSheet('BrandApplications');
  appendRowByHeaders(sheet, data);

  // No longer sending submission emails to internal team

  return { success: true, data: data };
}

// Check if two timeslots overlap (date strings YYYY-MM-DD, time strings HH:MM)
function timeslotsOverlapGS(a, b) {
  var aStart = (a.date || '') + 'T' + (a.startTime || '00:00');
  var aEnd   = (a.endDate || a.date || '') + 'T' + (a.endTime || '00:00');
  var bStart = (b.streamDate || b.date || '') + 'T' + (b.streamTime || b.startTime || '00:00');
  var bEnd   = (b.streamEndDate || b.endDate || b.streamDate || b.date || '') + 'T' + (b.streamEndTime || b.endTime || '00:00');
  return aStart < bEnd && aEnd > bStart;
}

// Add creator application (supports both old single-slot and new multi-slot format)
function addCreatorApplication(data) {
  const sheet = getSheet('CreatorApplications');
  const timeslots = Array.isArray(data.timeslots) ? data.timeslots : [];

  // Conflict check: ensure none of the submitted timeslots are already taken for this brand app
  var existingRows = sheetToObjects(sheet).filter(function(r) {
    return String(r.brandApplicationId) === String(data.brandApplicationId)
      && r.status !== 'rejected' && r.status !== 'cancelled';
  });
  for (var i = 0; i < timeslots.length; i++) {
    for (var j = 0; j < existingRows.length; j++) {
      if (timeslotsOverlapGS(timeslots[i], existingRows[j])) {
        return { error: 'One or more of your selected timeslots has just been taken by another creator. Please go back and pick an available slot.' };
      }
    }
  }

  timeslots.forEach(function(slot) {
    const rowId = Math.random().toString(36).substr(2, 9);
    appendRowByHeaders(sheet, {
      id: rowId,
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
      sampleSentAt: data.sampleSentAt || '',
      sampleReceivedAt: data.sampleReceivedAt || '',
      hasSamples: data.hasSamples || false,
    });
  });

  // No longer sending submission emails to internal team

  return { success: true, count: timeslots.length };
}

// Update brand application
function cancelBrandApplication(id, cancelReason) {
  var now = new Date().toISOString();
  var baSheet = getSheet('BrandApplications');
  var caSheet = getSheet('CreatorApplications');

  // Get the brand application before cancelling
  var baRows = sheetToObjects(baSheet);
  var brandApp = null;
  for (var i = 0; i < baRows.length; i++) {
    if (String(baRows[i].id) === String(id)) { brandApp = baRows[i]; break; }
  }

  // Cancel the brand application
  var baSuccess = updateRowById(baSheet, id, { status: 'cancelled', cancelReason: cancelReason, cancelledAt: now });
  if (!baSuccess) return { success: false, error: 'Brand application not found.' };

  // Send cancellation email to seller + RM
  if (brandApp) {
    try { sendCancellationEmail_BrandApp(brandApp, cancelReason); } catch(e) { Logger.log('Email error on brand app cancellation: ' + e); }
  }

  // Cascade: cancel all linked creator applications that are not already rejected/cancelled
  var caRows = sheetToObjects(caSheet);
  var cancelledCount = 0;
  for (var i = 0; i < caRows.length; i++) {
    var ca = caRows[i];
    if (String(ca.brandApplicationId) === String(id) && ca.status !== 'rejected' && ca.status !== 'cancelled') {
      updateRowById(caSheet, ca.id, { status: 'cancelled', cancelReason: cancelReason, cancelledAt: now });
      // Send cancellation email/notification to creator
      try { sendCancellationEmail_CreatorApp(ca, brandApp, cancelReason); } catch(e) { Logger.log('Email error on creator app cancellation: ' + e); }
      cancelledCount++;
    }
  }

  return { success: true, cancelledCreatorApps: cancelledCount };
}

function updateBrandApplication(id, data) {
  const sheet = getSheet('BrandApplications');

  // Read current state before updating
  if (data.status) {
    var apps = sheetToObjects(sheet);
    var currentApp = null;
    for (var i = 0; i < apps.length; i++) {
      if (String(apps[i].id) === String(id)) { currentApp = apps[i]; break; }
    }

    if (currentApp) {
      var currentStatus = String(currentApp.status);
      var newStatus = String(data.status);

      // No-op if status hasn't changed
      if (currentStatus === newStatus) {
        return { success: true };
      }

      // Block conflicting status changes
      if (currentStatus === 'approved' && newStatus === 'rejected') {
        return { success: false, error: 'This application has already been approved by another user. Please refresh.' };
      }
      if (currentStatus === 'rejected' && newStatus === 'approved') {
        return { success: false, error: 'This application has already been rejected by another user. Please refresh.' };
      }
    }
  }

  const success = updateRowById(sheet, id, data);

  // Email seller + RM when brand application is approved
  if (success && String(data.status) === 'approved') {
    try {
      var updatedApp = Object.assign({}, currentApp, data);
      sendEmailToSeller_BrandAppApproved(updatedApp);
    } catch (e) { Logger.log('Email error on brand approval: ' + e); }
  }

  // Email seller + RM when brand application is rejected
  if (success && String(data.status) === 'rejected' && currentApp && String(currentApp.status) !== 'rejected') {
    try {
      var rejectedApp = Object.assign({}, currentApp, data);
      sendRejectionEmailToBrandApp(rejectedApp, data.rejectionReason || '');
    } catch (e) { Logger.log('Email error on brand rejection: ' + e); }
  }

  return { success: success };
}

// Toggle isPaused on a brand application
function toggleBrandPause(id) {
  var sheet = getSheet('BrandApplications');
  var apps = sheetToObjects(sheet);
  var app = null;
  for (var i = 0; i < apps.length; i++) {
    if (String(apps[i].id) === String(id)) { app = apps[i]; break; }
  }
  if (!app) return { success: false, error: 'Application not found' };
  var newVal = String(app.isPaused) === 'true' ? 'false' : 'true';
  var success = updateRowById(sheet, id, { isPaused: newVal });
  return success ? { success: true, isPaused: newVal } : { success: false, error: 'Failed to update' };
}

// Update a single creator application row by id
function updateCreatorApplication(id, data) {
  const sheet = getSheet('CreatorApplications');

  // Read sheet once — reused for undo check and all notifications
  var allRows = sheetToObjects(sheet);
  var currentRow = null;
  for (var i = 0; i < allRows.length; i++) {
    if (String(allRows[i].id) === String(id)) { currentRow = allRows[i]; break; }
  }

  // Guard against conflicting status changes
  if (data.status && currentRow) {
    var currentStatus = String(currentRow.status);
    var newStatus = String(data.status);
    var byCreator = String(data.rejectedBy || '') === 'creator';

    // No-op if status hasn't changed
    if (currentStatus === newStatus) {
      return { success: true };
    }

    // Block internal team conflict: approved ↔ rejected (but allow creator rejecting their own approved slot)
    if (currentStatus === 'approved' && newStatus === 'rejected' && !byCreator) {
      return { success: false, error: 'This application has already been approved by another user. Please refresh.' };
    }
    if (currentStatus === 'rejected' && newStatus === 'approved') {
      return { success: false, error: 'This application has already been rejected by another user. Please refresh.' };
    }
  }

  // Block undo of sample sent if creator has already confirmed receipt
  if (data.sampleSentAt === '') {
    if (currentRow && currentRow.sampleReceivedAt) {
      return { success: false, error: 'Cannot undo — the creator has already confirmed receipt of the samples.' };
    }
  }

  // Block duplicate sample receipt confirmation
  if (data.sampleReceivedAt && currentRow && currentRow.sampleReceivedAt) {
    return { success: false, error: 'Samples already marked as received.' };
  }

  // When marking as sent, reset sampleReceivedAt so receipt flow starts fresh
  if (data.sampleSentAt) {
    data.sampleReceivedAt = '';
  }

  const success = updateRowById(sheet, id, data);

  if (success && currentRow) {
    // Merge updated fields into the row object for notification context
    var row = Object.assign({}, currentRow, data);

    // Send Telegram approval notification for this timeslot (only on actual status change)
    if (String(data.status) === 'approved' && String(currentRow.status) !== 'approved') {
      try { sendApprovalNotificationForRow(row); } catch (err) { Logger.log('Telegram notification error: ' + err.toString()); }
    }

    // Telegram + email when internal team rejects a creator application
    if (String(data.status) === 'rejected' && String(currentRow.status) !== 'rejected' && !byCreator) {
      try { sendRejectionNotifications_CreatorApp(row, data.rejectionReason || ''); } catch (err) { Logger.log('Rejection notification error: ' + err.toString()); }
    }

    // Email seller when internal team approves a creator application (approval = confirmation)
    if (String(data.status) === 'approved' && String(currentRow.status) !== 'approved') {
      try { sendEmailToSeller_CreatorConfirmed(row); } catch (err) { Logger.log('Email notification error: ' + err.toString()); }
    }

    // Telegram notification to creator when seller marks sample as sent
    if (data.sampleSentAt) {
      try { sendSampleSentNotification(row); } catch (err) { Logger.log('Sample sent notification error: ' + err.toString()); }
    }

    // Telegram notification to creator when seller undoes sample sent
    if (data.sampleSentAt === '') {
      try { sendSampleUndoNotification(row); } catch (err) { Logger.log('Sample undo notification error: ' + err.toString()); }
    }

    // Email + Telegram notification when creator application is cancelled
    if (String(data.status) === 'cancelled' && String(currentRow.status) !== 'cancelled') {
      try {
        // Get the brand application for email context
        var baSheet = getSheet('BrandApplications');
        var brandApps = sheetToObjects(baSheet);
        var brandApp = null;
        for (var i = 0; i < brandApps.length; i++) {
          if (String(brandApps[i].id) === String(row.brandApplicationId)) { brandApp = brandApps[i]; break; }
        }
        sendCancellationEmail_CreatorApp(row, brandApp, data.cancelReason || '');
      } catch (err) { Logger.log('Cancellation notification error: ' + err.toString()); }
    }

    // Sync Telegram button with sampleReceivedAt state
    if (data.sampleReceivedAt || data.sampleReceivedAt === '') {
      try {
        var props = PropertiesService.getScriptProperties();
        var stored = props.getProperty('sampleMsg_' + id);
        if (stored) {
          var parts = stored.split(':');
          var tgChatId = parts[0];
          var tgMsgId = parseInt(parts[1], 10);
          if (data.sampleReceivedAt) {
            // Confirmed — remove button
            telegramSend('editMessageReplyMarkup', {
              chat_id: tgChatId,
              message_id: tgMsgId,
              reply_markup: JSON.stringify({ inline_keyboard: [] })
            });
          } else {
            // Undone — restore button
            telegramSend('editMessageReplyMarkup', {
              chat_id: tgChatId,
              message_id: tgMsgId,
              reply_markup: JSON.stringify({
                inline_keyboard: [
                  [{ text: '✅ I\'ve Received the Samples', callback_data: 'sample_received_' + id }]
                ]
              })
            });
          }
        }
      } catch (err) {
        Logger.log('Could not sync Telegram sample button: ' + err.toString());
      }
    }
  }

  return { success: success };
}


// Check if two timeslots overlap (used for reschedule conflict detection)
function timeslotsOverlapBackend(a, b) {
  if (!a.endTime || !b.endTime) {
    return a.date === b.date && a.startTime === b.startTime;
  }
  var aStart = new Date(a.date + 'T' + a.startTime);
  var aEnd   = new Date((a.endDate || a.date) + 'T' + a.endTime);
  var bStart = new Date(b.date + 'T' + b.startTime);
  var bEnd   = new Date((b.endDate || b.date) + 'T' + b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

// Reschedule a creator application to a new date/time
function rescheduleCreatorApplication(id, data) {
  var sheet = getSheet('CreatorApplications');
  var allRows = sheetToObjects(sheet);
  var currentRow = null;
  for (var i = 0; i < allRows.length; i++) {
    if (String(allRows[i].id) === String(id)) { currentRow = allRows[i]; break; }
  }

  if (!currentRow) return { success: false, error: 'Application not found.' };

  var status = String(currentRow.status || '').trim().toLowerCase();
  if (status !== 'approved') {
    return { success: false, error: 'Only approved slots can be rescheduled. (current status: ' + String(currentRow.status) + ')' };
  }

  // 3-day rule: current slot must be 3+ days from today
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var slotDate = new Date(String(currentRow.streamDate) + 'T00:00:00');
  var diffDays = Math.floor((slotDate - today) / 86400000);
  if (diffDays < 3) {
    return { success: false, error: 'This slot is too close to today and cannot be rescheduled. Slots must be at least 3 days away.' };
  }

  // Look up brand application and build shop-wide brand app ID list
  var baSheet = getSheet('BrandApplications');
  var brandApps = sheetToObjects(baSheet);
  var brandApp = null;
  for (var i = 0; i < brandApps.length; i++) {
    if (String(brandApps[i].id) === String(currentRow.brandApplicationId)) { brandApp = brandApps[i]; break; }
  }

  var isSellerSite = brandApp && String(brandApp.sellerSiteRequired || '').trim().toLowerCase() === 'true';

  if (isSellerSite) {
    // Seller-site: new slot must be one of the brand's predefined timeslots
    var predefinedSlots = [];
    try { predefinedSlots = JSON.parse(String(brandApp.sellerSiteTimeslots || '[]')); } catch(e) {}
    var matchesSlot = predefinedSlots.some(function(slot) {
      return String(slot.date) === String(data.newDate) && String(slot.startTime) === String(data.newStartTime);
    });
    if (!matchesSlot) {
      return { success: false, error: 'The selected timeslot is not one of the predefined seller site timeslots.' };
    }
    // For seller-site, use the predefined slot's end date/time if not provided
    if (!data.newEndTime) {
      var matchedSlot = predefinedSlots.find(function(slot) {
        return String(slot.date) === String(data.newDate) && String(slot.startTime) === String(data.newStartTime);
      });
      if (matchedSlot) {
        data.newEndDate = matchedSlot.endDate || matchedSlot.date;
        data.newEndTime = matchedSlot.endTime || '';
      }
    }
  } else {
    // Non-seller-site: must stay within the same month
    var currentMonth = String(currentRow.streamDate).substring(0, 7);
    var newMonth = String(data.newDate).substring(0, 7);
    if (newMonth !== currentMonth) {
      return { success: false, error: 'You can only reschedule within the same month.' };
    }
  }

  // Same slot check
  if (data.newDate === String(currentRow.streamDate) && data.newStartTime === String(currentRow.streamTime || '')) {
    return { success: false, error: 'The new date and time is the same as the current slot.' };
  }

  // Duration check: at least 2 hours
  var newStart = new Date(data.newDate + 'T' + (data.newStartTime || '00:00'));
  var newEnd   = new Date((data.newEndDate || data.newDate) + 'T' + (data.newEndTime || '00:00'));
  if ((newEnd - newStart) < 2 * 60 * 60 * 1000) {
    return { success: false, error: 'Each stream must be at least 2 hours long.' };
  }
  var shopId = brandApp ? String(brandApp.shopId || brandApp.brandId || '') : '';
  var shopBrandAppIds = [];
  for (var i = 0; i < brandApps.length; i++) {
    if (shopId && String(brandApps[i].shopId || brandApps[i].brandId || '') === shopId) {
      shopBrandAppIds.push(String(brandApps[i].id));
    }
  }
  if (shopBrandAppIds.length === 0) shopBrandAppIds = [String(currentRow.brandApplicationId)];

  // Conflict check: same shop (any creator) OR creator's own slots at other shops
  var newSlot = { date: data.newDate, startTime: data.newStartTime, endDate: data.newEndDate || data.newDate, endTime: data.newEndTime || '' };
  for (var i = 0; i < allRows.length; i++) {
    var r = allRows[i];
    if (String(r.id) === String(id)) continue;
    if (r.status === 'rejected' || r.status === 'cancelled') continue;
    var isSameShop = shopBrandAppIds.indexOf(String(r.brandApplicationId)) >= 0;
    var isOwnSlot  = String(r.creatorId) === String(currentRow.creatorId);
    if (!isSameShop && !isOwnSlot) continue;
    var existing = { date: String(r.streamDate), startTime: String(r.streamTime || ''), endDate: String(r.streamEndDate || r.streamDate), endTime: String(r.streamEndTime || '') };
    if (timeslotsOverlapBackend(newSlot, existing)) {
      return { success: false, error: isSameShop
        ? 'This timeslot overlaps with an existing booking for this shop. Please choose a different time.'
        : 'This timeslot overlaps with your existing stream. Please choose a different time.'
      };
    }
  }

  var oldDate      = String(currentRow.streamDate || '');
  var oldStartTime = String(currentRow.streamTime || '');
  var oldEndDate   = String(currentRow.streamEndDate || currentRow.streamDate || '');
  var oldEndTime   = String(currentRow.streamEndTime || '');

  var updateData = {
    streamDate:    data.newDate,
    streamTime:    data.newStartTime,
    streamEndDate: data.newEndDate || data.newDate,
    streamEndTime: data.newEndTime || ''
  };

  updateRowById(sheet, id, updateData);

  var rm = null;
  var managedSellersSheet = getSheet('Managed Sellers');
  if (managedSellersSheet && brandApp) {
    var managedData = managedSellersSheet.getDataRange().getValues();
    var managedHeaders = managedData[0];
    for (var i = 1; i < managedData.length; i++) {
      var managedRow = {};
      for (var j = 0; j < managedHeaders.length; j++) { managedRow[managedHeaders[j]] = managedData[i][j]; }
      if (managedRow.Shopid && String(managedRow.Shopid) === String(brandApp.shopId || brandApp.brandId)) { rm = managedRow; break; }
    }
  }

  try {
    sendEmailNotification_SlotRescheduled(
      Object.assign({}, currentRow, updateData),
      oldDate, oldStartTime, oldEndDate, oldEndTime,
      brandApp, rm
    );
  } catch(err) {
    Logger.log('Reschedule notification error: ' + err.toString());
  }

  // Send Telegram notification to creator about the rescheduled slot
  try {
    var chatId = getTelegramChatId(currentRow.telegram);
    if (chatId) {
      var updatedRow = Object.assign({}, currentRow, updateData);
      sendRescheduledApprovalNotification(updatedRow, chatId, oldDate, oldStartTime, oldEndDate, oldEndTime);
    }
  } catch(err) {
    Logger.log('Reschedule Telegram notification error: ' + err.toString());
  }

  return { success: true };
}

function sendEmailNotification_SlotRescheduled(creatorApp, oldDate, oldStartTime, oldEndDate, oldEndTime, brandApp, rm) {
  var oldSlot = oldDate + (oldStartTime ? ' ' + oldStartTime : '') + (oldEndTime ? ' \u2013 ' + oldEndTime : '');
  var newSlot = String(creatorApp.streamDate || '') + (creatorApp.streamTime ? ' ' + creatorApp.streamTime : '') + (creatorApp.streamEndTime ? ' \u2013 ' + creatorApp.streamEndTime : '');

  var subject = '[Shopee Live Creator Match] Slot Rescheduled - ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '');
  var body = 'A creator has rescheduled their livestream slot.\n\n'
    + 'Creator: ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '') + '\n'
    + 'Brand: ' + (creatorApp.brandName || creatorApp.shopName || '') + '\n\n'
    + 'Previous Slot: ' + oldSlot + '\n'
    + 'New Slot: ' + newSlot + '\n\n'
    + 'Thank you for using Shopee Live Creator Match!';

  // Seller PIC with RM CC'd
  if (brandApp && brandApp.sellerPicEmail) {
    var ccEmails = '';
    if (rm && rm['RM email']) {
      ccEmails = rm['RM email'];
    }
    var options = ccEmails ? { cc: ccEmails } : {};
    try { MailApp.sendEmail(brandApp.sellerPicEmail, subject, body, options); } catch(e) { Logger.log('Failed to email seller PIC: ' + e); }
  }
}

// Delete slot
function deleteSlot(id) {
  const sheet = getSheet('Slots');
  const rowIndex = findRowById(sheet, id);
  if (rowIndex > 0) {
    sheet.deleteRow(rowIndex);
    return { success: true };
  }
  return { success: false, error: 'Slot not found' };
}

// Delete booking
function deleteBooking(id) {
  const sheet = getSheet('Bookings');
  const rowIndex = findRowById(sheet, id);
  if (rowIndex > 0) {
    sheet.deleteRow(rowIndex);
    return { success: true };
  }
  return { success: false, error: 'Booking not found' };
}

// ============================================
// LOGIN VALIDATION
// ============================================

// Validate brand login: if shopId exists, check name matches; if new, check both are unique
function validateBrandLogin(shopId, shopName) {
  const sheet = getSheet('Sellers');
  const sellers = sheetToObjects(sheet);
  const existingById = sellers.find(s => String(s.id) === String(shopId));
  if (existingById) {
    if (String(existingById.name).toLowerCase() === String(shopName).toLowerCase()) {
      return { success: true, exists: true, seller: existingById, pinSet: !!existingById.pinHash };
    } else {
      return { success: false, error: 'Shop Name does not match the registered Shop ID. Please check your credentials.' };
    }
  }
  // New Shop ID — check that Shop Name isn't already used by another seller
  const existingByName = sellers.find(s => String(s.name).toLowerCase() === String(shopName).toLowerCase());
  if (existingByName) {
    return { success: false, error: 'This Shop Name is already registered under a different Shop ID. Please check your credentials.' };
  }
  return { success: true, exists: false };
}

// Validate creator login: all 3 fields (affiliateId, username, phone) must be consistent
function validateCreatorLogin(affiliateId, affiliateUsername, phone) {
  const sheet = getSheet('Affiliates');
  const affiliates = sheetToObjects(sheet);

  const byId = affiliates.find(a => String(a.id).toLowerCase() === String(affiliateId).toLowerCase());
  const byName = affiliates.find(a => String(a.name).toLowerCase() === String(affiliateUsername).toLowerCase());
  const byPhone = affiliates.find(a => String(a.phone) === String(phone));

  // If any field matches an existing record, all 3 must point to the same record
  const matched = byId || byName || byPhone;
  if (matched) {
    if (
      String(matched.id).toLowerCase() !== String(affiliateId).toLowerCase() ||
      String(matched.name).toLowerCase() !== String(affiliateUsername).toLowerCase() ||
      String(matched.phone) !== String(phone)
    ) {
      // Identify which field(s) caused the conflict for a clearer error
      if (byId && (String(byId.name).toLowerCase() !== String(affiliateUsername).toLowerCase() || String(byId.phone) !== String(phone))) {
        return { success: false, error: 'Affiliate Username or Phone Number does not match the registered Affiliate ID.' };
      }
      if (byName && (String(byName.id).toLowerCase() !== String(affiliateId).toLowerCase() || String(byName.phone) !== String(phone))) {
        return { success: false, error: 'Affiliate ID or Phone Number does not match the registered Affiliate Username.' };
      }
      return { success: false, error: 'One or more fields do not match the registered account. Please check your credentials.' };
    }
    return { success: true, exists: true, affiliate: matched, pinSet: !!matched.pinHash };
  }

  // All 3 are new — safe to create
  return { success: true, exists: false };
}

// ============================================
// PIN MANAGEMENT
// ============================================

function hashPin(salt, pin) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + pin,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function setPin(userId, userType, pin) {
  if (!/^\d{6}$/.test(String(pin))) {
    return { success: false, error: 'PIN must be exactly 6 digits' };
  }
  const sheetName = userType === 'brand' ? 'Sellers' : 'Affiliates';
  const sheet = getSheet(sheetName);
  const salt = Utilities.getUuid();
  const hash = hashPin(salt, String(pin));
  const updated = updateRowById(sheet, userId, { pinSalt: salt, pinHash: hash });
  if (!updated) return { success: false, error: 'User not found' };
  return { success: true };
}

function validatePin(userId, userType, pin) {
  const sheetName = userType === 'brand' ? 'Sellers' : 'Affiliates';
  const sheet = getSheet(sheetName);
  const users = sheetToObjects(sheet);
  const user = users.find(function(u) { return String(u.id) === String(userId); });
  if (!user) return { success: false, error: 'User not found' };
  if (!user.pinHash) return { success: false, error: 'No PIN set' };
  const hash = hashPin(String(user.pinSalt), String(pin));
  return { success: true, valid: hash === String(user.pinHash) };
}

function changePin(userId, userType, currentPin, newPin) {
  if (!/^\d{6}$/.test(String(newPin))) {
    return { success: false, error: 'New PIN must be exactly 6 digits' };
  }
  const sheetName = userType === 'brand' ? 'Sellers' : 'Affiliates';
  const sheet = getSheet(sheetName);
  const users = sheetToObjects(sheet);
  const user = users.find(function(u) { return String(u.id) === String(userId); });
  if (!user) return { success: false, error: 'User not found' };
  if (!user.pinHash) return { success: false, error: 'No PIN set for this account' };
  const currentHash = hashPin(String(user.pinSalt), String(currentPin));
  if (currentHash !== String(user.pinHash)) {
    return { success: false, error: 'Current PIN is incorrect' };
  }
  const newSalt = Utilities.getUuid();
  const newHash = hashPin(newSalt, String(newPin));
  updateRowById(sheet, userId, { pinSalt: newSalt, pinHash: newHash });
  return { success: true };
}

function adminResetPin(userId, userType) {
  const sheetName = userType === 'brand' ? 'Sellers' : 'Affiliates';
  const sheet = getSheet(sheetName);
  const updated = updateRowById(sheet, userId, { pinSalt: '', pinHash: '' });
  if (!updated) return { success: false, error: 'User not found' };
  return { success: true };
}

// ============================================
// CASCADING PROFILE UPDATES
// ============================================

// Update seller profile with cascading updates to BrandApplications and CreatorApplications
function updateSellerProfile(shopId, data) {
  var updatedCount = 0;

  // 1. Update Sellers row (name and/or siteAddress)
  var sellersSheet = getSheet('Sellers');
  var sellerUpdateFields = {};
  if (data.name) sellerUpdateFields.name = data.name;
  if (data.siteAddress !== undefined) sellerUpdateFields.siteAddress = data.siteAddress;
  if (data.sitePostalCode !== undefined) sellerUpdateFields.sitePostalCode = data.sitePostalCode;
  var updated = updateRowById(sellersSheet, shopId, sellerUpdateFields);
  if (!updated) return { success: false, error: 'Seller not found' };

  // 2. Batch-cascade name change to BrandApplications (siteAddress is per-application, not cascaded)
  if (data.name) {
    var baSheet = getSheet('BrandApplications');
    var baData = baSheet.getDataRange().getValues();
    var baHeaders = baData[0];
    var brandIdCol = baHeaders.indexOf('brandId');
    var brandNameCol = baHeaders.indexOf('brandName');
    var shopNameCol = baHeaders.indexOf('shopName');
    var baIdCol = baHeaders.indexOf('id');

    var brandAppIds = [];
    var baChanged = false;
    for (var i = 1; i < baData.length; i++) {
      if (String(baData[i][brandIdCol]) === String(shopId)) {
        if (brandNameCol >= 0) baData[i][brandNameCol] = String(data.name);
        if (shopNameCol >= 0) baData[i][shopNameCol] = String(data.name);
        brandAppIds.push(String(baData[i][baIdCol]));
        updatedCount++;
        baChanged = true;
      }
    }
    if (baChanged && baData.length > 1) {
      var baRange = baSheet.getRange(2, 1, baData.length - 1, baData[0].length);
      baRange.setNumberFormat('@');
      baRange.setValues(baData.slice(1));
    }

    // 3. Batch-cascade name change to CreatorApplications
    var caSheet = getSheet('CreatorApplications');
    var caData = caSheet.getDataRange().getValues();
    var caHeaders = caData[0];
    var caBrandNameCol = caHeaders.indexOf('brandName');
    var caShopNameCol = caHeaders.indexOf('shopName');
    var caBrandAppIdCol = caHeaders.indexOf('brandApplicationId');

    var caChanged = false;
    for (var k = 1; k < caData.length; k++) {
      if (brandAppIds.indexOf(String(caData[k][caBrandAppIdCol])) >= 0) {
        if (caBrandNameCol >= 0) caData[k][caBrandNameCol] = String(data.name);
        if (caShopNameCol >= 0) caData[k][caShopNameCol] = String(data.name);
        updatedCount++;
        caChanged = true;
      }
    }
    if (caChanged && caData.length > 1) {
      var caRange = caSheet.getRange(2, 1, caData.length - 1, caData[0].length);
      caRange.setNumberFormat('@');
      caRange.setValues(caData.slice(1));
    }
  }

  return { success: true, updatedCount: updatedCount };
}

// Update affiliate profile with cascading updates to CreatorApplications
function updateAffiliateProfile(affiliateId, data) {
  var updatedCount = 0;

  var affSheet = getSheet('Affiliates');
  var affiliates = sheetToObjects(affSheet);
  var current = affiliates.find(function(a) { return String(a.id) === String(affiliateId); });
  if (!current) return { success: false, error: 'Affiliate not found' };

  // Uniqueness check: if username changed, ensure no other affiliate has that name
  if (data.name && String(data.name).toLowerCase() !== String(current.name).toLowerCase()) {
    var dupName = affiliates.find(function(a) {
      return String(a.id) !== String(affiliateId) && String(a.name).toLowerCase() === String(data.name).toLowerCase();
    });
    if (dupName) {
      return { success: false, error: 'Another creator already uses this username. Please choose a different one.' };
    }
  }

  // Uniqueness check: if affiliate ID changed, ensure no other affiliate has that id
  if (data.id && String(data.id).toLowerCase() !== String(affiliateId).toLowerCase()) {
    var dupId = affiliates.find(function(a) {
      return String(a.id).toLowerCase() === String(data.id).toLowerCase();
    });
    if (dupId) {
      return { success: false, error: 'Another creator is already registered with this Affiliate ID.' };
    }
  }

  // 1. Update Affiliates row (including id if it changed)
  var affUpdates = {};
  if (data.id) affUpdates.id = data.id;
  if (data.name) affUpdates.name = data.name;
  if (data.phone !== undefined) affUpdates.phone = data.phone;
  if (data.shippingAddress !== undefined) affUpdates.shippingAddress = data.shippingAddress;
  if (data.shippingPostalCode !== undefined) affUpdates.shippingPostalCode = data.shippingPostalCode;
  var updated = updateRowById(affSheet, affiliateId, affUpdates);
  if (!updated) return { success: false, error: 'Affiliate not found' };

  // 2. Batch-update all CreatorApplications where creatorId matches
  var caSheet = getSheet('CreatorApplications');
  var caData = caSheet.getDataRange().getValues();
  var caHeaders = caData[0];
  var creatorIdCol = caHeaders.indexOf('creatorId');
  var creatorNameCol = caHeaders.indexOf('creatorName');
  var affUsernameCol = caHeaders.indexOf('affiliateUsername');
  var phoneCol = caHeaders.indexOf('phone');

  var caChanged = false;
  for (var i = 1; i < caData.length; i++) {
    if (String(caData[i][creatorIdCol]) === String(affiliateId)) {
      if (data.id && creatorIdCol >= 0) caData[i][creatorIdCol] = String(data.id);
      if (data.name && creatorNameCol >= 0) caData[i][creatorNameCol] = String(data.name);
      if (data.name && affUsernameCol >= 0) caData[i][affUsernameCol] = String(data.name);
      if (data.phone !== undefined && phoneCol >= 0) caData[i][phoneCol] = String(data.phone);
      updatedCount++;
      caChanged = true;
    }
  }

  if (caChanged && caData.length > 1) {
    var caRange = caSheet.getRange(2, 1, caData.length - 1, caData[0].length);
    caRange.setNumberFormat('@');
    caRange.setValues(caData.slice(1));
  }

  return { success: true, updatedCount: updatedCount };
}

// ============================================
// UTILITY FUNCTIONS FOR TESTING
// ============================================

// Test function - run this to verify setup
function testSetup() {
  const ss = getSpreadsheet();
  const requiredSheets = ['Sellers', 'Affiliates', 'Slots', 'Bookings', 'BrandApplications', 'CreatorApplications'];
  const missing = [];

  requiredSheets.forEach(name => {
    if (!ss.getSheetByName(name)) {
      missing.push(name);
    }
  });

  if (missing.length > 0) {
    Logger.log('Missing sheets: ' + missing.join(', '));
    Logger.log('Please create these sheets with the correct headers.');
  } else {
    Logger.log('All sheets found! Setup looks good.');
    Logger.log('Data counts:');
    Logger.log('- Sellers: ' + (sheetToObjects(getSheet('Sellers')).length));
    Logger.log('- Affiliates: ' + (sheetToObjects(getSheet('Affiliates')).length));
    Logger.log('- Slots: ' + (sheetToObjects(getSheet('Slots')).length));
    Logger.log('- Bookings: ' + (sheetToObjects(getSheet('Bookings')).length));
    Logger.log('- BrandApplications: ' + (sheetToObjects(getSheet('BrandApplications')).length));
    Logger.log('- CreatorApplications: ' + (sheetToObjects(getSheet('CreatorApplications')).length));
  }
}

// Create sheets with headers (run once)
function initializeSheets() {
  const ss = getSpreadsheet();

  // Sellers
  let sheet = ss.getSheetByName('Sellers');
  if (!sheet) {
    sheet = ss.insertSheet('Sellers');
    sheet.appendRow(['id', 'name', 'createdAt', 'siteAddress', 'sitePostalCode']);
  }

  // Affiliates
  sheet = ss.getSheetByName('Affiliates');
  if (!sheet) {
    sheet = ss.insertSheet('Affiliates');
    sheet.appendRow(['id', 'name', 'createdAt', 'phone', 'shippingAddress', 'shippingPostalCode']);
  }

  // Slots
  sheet = ss.getSheetByName('Slots');
  if (!sheet) {
    sheet = ss.insertSheet('Slots');
    sheet.appendRow(['id', 'sellerId', 'sellerName', 'date', 'startTime', 'endTime', 'description', 'createdAt']);
  }

  // Bookings
  sheet = ss.getSheetByName('Bookings');
  if (!sheet) {
    sheet = ss.insertSheet('Bookings');
    sheet.appendRow(['id', 'slotId', 'sellerId', 'sellerName', 'affiliateId', 'affiliateName', 'date', 'startTime', 'endTime', 'bookedAt']);
  }

  // BrandApplications
  sheet = ss.getSheetByName('BrandApplications');
  if (!sheet) {
    sheet = ss.insertSheet('BrandApplications');
    sheet.appendRow(['id', 'brandId', 'brandName', 'shopId', 'shopName', 'month', 'streamCount', 'sellerType', 'productNominationsConfirmed', 'numProductsSponsored', 'streamLocation', 'hasPackageActivation', 'preferredDate', 'sellerSiteRequired', 'amsCommission', 'bundleDealsAgreed', 'voucherTier', 'creatorAssignmentAgreed', 'sellerPicName', 'sellerPicMobile', 'sellerPicEmail', 'status', 'createdAt', 'livestreamBrief', 'sellerSiteAddress', 'cancelReason', 'cancelledAt', 'brandActivationType', 'sellerSiteTimeslots', 'sellerSitePostalCode']);
  }

  // CreatorApplications
  sheet = ss.getSheetByName('CreatorApplications');
  if (!sheet) {
    sheet = ss.insertSheet('CreatorApplications');
    sheet.appendRow(['id', 'creatorId', 'creatorName', 'brandApplicationId', 'brandName', 'shopName', 'streamDate', 'streamTime', 'streamEndDate', 'streamEndTime', 'affiliateUsername', 'phone', 'telegram', 'shippingAddress', 'willingToTravel', 'status', 'createdAt', 'sampleSentAt', 'sampleReceivedAt', 'hasSamples', 'cancelReason', 'cancelledAt', 'shippingPostalCode']);
  }

  // TelegramUsers
  sheet = ss.getSheetByName('TelegramUsers');
  if (!sheet) {
    sheet = ss.insertSheet('TelegramUsers');
    sheet.appendRow(['username', 'chatId', 'updatedAt']);
  }

  // InternalTeam
  sheet = ss.getSheetByName('InternalTeam');
  if (!sheet) {
    sheet = ss.insertSheet('InternalTeam');
    sheet.appendRow(['id', 'email', 'createdAt']);
  }

  Logger.log('Sheets initialized successfully!');
}

// ========================
// TELEGRAM BOT
// ========================

// Send a message via the Telegram Bot API
function telegramSend(method, payload) {
  var url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/' + method;
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  return UrlFetchApp.fetch(url, options);
}

// Handle incoming Telegram update (message or callback_query)
function handleTelegramUpdate(update) {
  try {
    // Handle callback queries (inline button clicks)
    if (update.callback_query) {
      handleTelegramCallback(update.callback_query);
      return;
    }

    // Handle regular messages
    if (update.message && update.message.text) {
      var msg = update.message;
      var chatId = msg.chat.id;
      var text = msg.text.trim();
      var username = (msg.from.username || '').toLowerCase();

      if (text === '/start') {
        // Check if already registered to avoid duplicate messages on Telegram retries
        var existingChatId = getTelegramChatId(username);
        if (existingChatId === String(chatId)) return;

        saveTelegramUser(username, chatId);
        telegramSend('sendMessage', {
          chat_id: String(chatId),
          text: '✅ Welcome to Shopee Live Creator Match!\n\nYour Telegram is now linked. You will receive notifications here when your applications are approved.\n\nNo further action needed — just keep this chat open.'
        });
        return;
      }

      telegramSend('sendMessage', {
        chat_id: chatId,
        text: 'Hi! I only send notifications here. Please log in to the Shopee Live Creator Match app to manage your applications.'
      });
    }
  } catch (err) {
    Logger.log('Telegram update error: ' + err.toString());
  }
}

// Handle inline button callback — callback data is "confirm_<id>" or "reject_<id>"
function handleTelegramCallback(callback) {
  var data = callback.data;
  var chatId = callback.message.chat.id;
  var sheet = getSheet('CreatorApplications');
  var allRows = sheetToObjects(sheet);

  // Helper: resolve id to a single row
  function resolveRows(id) {
    for (var i = 0; i < allRows.length; i++) {
      if (String(allRows[i].id) === String(id)) return [allRows[i]];
    }
    return [];
  }

  // confirm_ callback kept as no-op for backwards compatibility with old Telegram messages
  if (data && data.indexOf('confirm_') === 0) {
    telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'Your slot has already been confirmed by Shopee — no action needed!', show_alert: true });
  }

  // reject_ callback kept as no-op for backwards compatibility with old Telegram messages
  if (data && data.indexOf('reject_') === 0) {
    telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'Rejection is no longer available. Please use the Shopee Live Creator Match app to reschedule if needed.', show_alert: true });
  }

  if (data && data.indexOf('sample_received_') === 0 && data.indexOf('sample_received_undo_') !== 0) {
    // Answer immediately to dismiss Telegram's loading spinner (prevents user from double-tapping)
    telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: '' });

    var rowId = data.substring(16);
    var row = null;
    for (var i = 0; i < allRows.length; i++) {
      if (String(allRows[i].id) === String(rowId)) { row = allRows[i]; break; }
    }

    if (!row) {
      telegramSend('sendMessage', { chat_id: chatId, text: '⚠️ Record not found.' });
      return;
    }

    // Block if seller has since undone the sample dispatch
    if (!row.sampleSentAt) {
      telegramSend('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: callback.message.message_id,
        reply_markup: JSON.stringify({ inline_keyboard: [] })
      });
      telegramSend('sendMessage', { chat_id: chatId, text: '⚠️ This notification is outdated — the sample dispatch was cancelled. You will be notified again once samples are on the way.' });
      return;
    }

    // Use a lock to prevent duplicate writes from spam clicks
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
    } catch (e) {
      telegramSend('sendMessage', { chat_id: chatId, text: '⚠️ Please wait a moment and try again.' });
      return;
    }

    // Re-fetch the row inside the lock to get the latest state
    var freshRows = sheetToObjects(sheet);
    var freshRow = null;
    for (var j = 0; j < freshRows.length; j++) {
      if (String(freshRows[j].id) === String(rowId)) { freshRow = freshRows[j]; break; }
    }

    if (freshRow && freshRow.sampleReceivedAt) {
      lock.releaseLock();
      telegramSend('sendMessage', { chat_id: chatId, text: 'ℹ️ You have already confirmed receipt of these samples.' });
      return;
    }
    var receivedAt = new Date().toISOString();
    var confirmedDateStr = new Date().toLocaleDateString('en-SG');
    telegramSend('editMessageText', {
      chat_id: chatId,
      message_id: callback.message.message_id,
      text: callback.message.text + '\n\n✅ SAMPLES RECEIVED — ' + confirmedDateStr + '\n\nTo undo this, please log in to the app.',
      reply_markup: JSON.stringify({ inline_keyboard: [] })
    });

    updateRowById(sheet, row.id, { sampleReceivedAt: receivedAt });
    lock.releaseLock();
  }
}

// Save telegram username → chatId mapping
function saveTelegramUser(username, chatId) {
  if (!username) return;
  var sheet = getSheet('TelegramUsers');
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var now = new Date().toISOString();

  // Check if username already exists
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === username.toLowerCase()) {
      // Update existing row
      sheet.getRange(i + 1, 2).setValue(String(chatId));
      sheet.getRange(i + 1, 3).setValue(now);
      return;
    }
  }

  // New user
  appendRowAsText(sheet, [username.toLowerCase(), String(chatId), now]);
}

// Look up chatId by telegram username
function getTelegramChatId(telegramUsername) {
  if (!telegramUsername) return null;
  var clean = String(telegramUsername).replace('@', '').toLowerCase();
  var sheet = getSheet('TelegramUsers');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === clean) {
      return String(data[i][1]);
    }
  }
  return null;
}

// Format a YYYY-MM-DD date string as DD MMM YYYY
function formatDateDDMMMYYYY(dateStr) {
  if (!dateStr) return '';
  var parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var day = parts[2];
  var month = months[parseInt(parts[1], 10) - 1] || parts[1];
  var year = parts[0];
  return day + ' ' + month + ' ' + year;
}

// Send approval notification for a single timeslot row (per-row approval flow)
function sendApprovalNotificationForRow(row) {
  var chatId = getTelegramChatId(row.telegram);
  if (!chatId) {
    Logger.log('No Telegram chatId found for: ' + row.telegram);
    return false;
  }

  var time = row.streamTime || '';
  if (row.streamEndTime) time += ' – ' + row.streamEndTime;
  var slotText = '📅 ' + formatDateDDMMMYYYY(row.streamDate) + (time ? ' ' + time : '');

  var contactString = getInternalPicContactString();

  var message = '🎉 <b>Your livestream slot has been confirmed by Shopee!</b>\n\n'
    + '🏪 <b>Shop:</b> ' + (row.brandName || row.shopName) + '\n'
    + slotText + '\n'
    + '📦 <b>Shipping Address:</b> ' + (row.shippingAddress || 'N/A') + (row.shippingPostalCode ? ', S' +row.shippingPostalCode : '') + '\n\n'
    + 'No action needed — your slot is confirmed.\n\n'
    + 'If you would like to reschedule, you can do so on the Shopee Live Creator Match app.\n\n'
    + 'If you have any questions, please contact ' + contactString + '.';

  telegramSend('sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  });

  return true;
}

// Send rescheduled slot notification to creator via Telegram
function sendRescheduledApprovalNotification(row, chatId, oldDate, oldStartTime, oldEndDate, oldEndTime) {
  var oldSlot = formatDateDDMMMYYYY(oldDate) + (oldStartTime ? ' ' + oldStartTime : '') + (oldEndTime ? ' \u2013 ' + oldEndTime : '');
  var newTime = row.streamTime || '';
  if (row.streamEndTime) newTime += ' \u2013 ' + row.streamEndTime;
  var newSlot = formatDateDDMMMYYYY(row.streamDate) + (newTime ? ' ' + newTime : '');
  var contactString = getInternalPicContactString();

  var message = '🔄 <b>Your livestream slot has been rescheduled.</b>\n\n'
    + '🏪 <b>Shop:</b> ' + (row.brandName || row.shopName) + '\n'
    + '📅 <b>Previous slot:</b> ' + oldSlot + '\n'
    + '📅 <b>New slot:</b> ' + newSlot + '\n\n'
    + 'If you would like to reschedule again, you can do so on the Shopee Live Creator Match app.\n\n'
    + 'If you have any questions, please contact ' + contactString + '.';

  telegramSend('sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
  });
}

// Send sample-sent notification to creator via Telegram
function sendSampleSentNotification(row) {
  var chatId = getTelegramChatId(row.telegram);
  if (!chatId) {
    Logger.log('No Telegram chatId found for: ' + row.telegram);
    return false;
  }

  var shopName = row.brandName || row.shopName || 'The brand';
  var time = row.streamTime || '';
  if (row.streamEndTime) time += ' – ' + row.streamEndTime;
  var slotText = formatDateDDMMMYYYY(row.streamDate) + (time ? ' ' + time : '');

  var message = '📦 <b>Samples have been dispatched!</b>\n\n'
    + '<b>' + shopName + '</b> has sent out the samples for the livestream on <b>' + slotText + '</b>.\n\n'
    + 'Kindly confirm that you have received the samples once they have arrived by clicking the button below, or log in to the app.';

  var resp = telegramSend('sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: '✅ I\'ve Received the Samples', callback_data: 'sample_received_' + row.id }]
      ]
    })
  });

  // Store message_id so we can remove the button if the brand undoes the dispatch
  try {
    var respData = JSON.parse(resp.getContentText());
    if (respData.ok && respData.result && respData.result.message_id) {
      PropertiesService.getScriptProperties().setProperty(
        'sampleMsg_' + row.id,
        chatId + ':' + respData.result.message_id
      );
    }
  } catch (err) {
    Logger.log('Could not store sample message_id: ' + err.toString());
  }

  return true;
}

// Send sample undo notification to creator via Telegram
function sendSampleUndoNotification(row) {
  var chatId = getTelegramChatId(row.telegram);
  if (!chatId) {
    Logger.log('No Telegram chatId found for: ' + row.telegram);
    return false;
  }

  // Remove the button from the original sample-sent message
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty('sampleMsg_' + row.id);
  if (stored) {
    var parts = stored.split(':');
    var storedChatId = parts[0];
    var storedMsgId = parts[1];
    try {
      telegramSend('editMessageReplyMarkup', {
        chat_id: storedChatId,
        message_id: parseInt(storedMsgId, 10),
        reply_markup: JSON.stringify({ inline_keyboard: [] })
      });
    } catch (err) {
      Logger.log('Could not remove sample button: ' + err.toString());
    }
    props.deleteProperty('sampleMsg_' + row.id);
  }

  var shopName = row.brandName || row.shopName || 'The brand';
  var time = row.streamTime || '';
  if (row.streamEndTime) time += ' – ' + row.streamEndTime;
  var slotText = formatDateDDMMMYYYY(row.streamDate) + (time ? ' ' + time : '');

  var message = 'ℹ️ <b>Sample dispatch update</b>\n\n'
    + 'Hi, there was an update — please disregard the previous sample dispatch notification for <b>' + shopName + '\'s</b> livestream on <b>' + slotText + '</b>.\n\n'
    + 'We\'ll notify you again once the samples are on the way.';

  telegramSend('sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  });

  return true;
}

// ── Internal PIC fallback defaults — update these if contacts change ──
var FALLBACK_INTERNAL_PIC = 'Kayla Ang';
var FALLBACK_INTERNAL_PIC_NUMBER = '+65 90000000';

// Returns a contact string like "Kayla Ang - +65 90000000 / Jane Doe - +65 91111111"
function getInternalPicContactString() {
  try {
    var sheet = getSheet('BusinessMappingValues');
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      if (data.length > 1) {
        var headers = data[0];
        var bmv = [];
        for (var i = 1; i < data.length; i++) {
          var obj = {};
          for (var j = 0; j < headers.length; j++) { obj[headers[j]] = data[i][j]; }
          if (obj.Type) bmv.push(obj);
        }
        var pics = bmv.filter(function(v) { return v.Type === 'InternalPIC' && v.Active === 'ACTIVE'; });
        var numbers = bmv.filter(function(v) { return v.Type === 'InternalPICNumber' && v.Active === 'ACTIVE'; });
        if (pics.length > 0) {
          return pics.map(function(p, i) {
            var num = numbers[i] ? numbers[i].Description : FALLBACK_INTERNAL_PIC_NUMBER;
            return p.Description + ' - ' + num;
          }).join(' / ');
        }
      }
    }
  } catch(e) {
    Logger.log('getInternalPicContactString error: ' + e);
  }
  return FALLBACK_INTERNAL_PIC + ' - ' + FALLBACK_INTERNAL_PIC_NUMBER;
}


// ========================
// INTERNAL TEAM AUTH
// ========================

function validateInternalLogin(password, email) {
  if (String(password) !== INTERNAL_PASSWORD) {
    return { success: false, error: 'Incorrect password. Please try again.' };
  }

  if (!email || !String(email).trim()) {
    return { success: false, error: 'Please enter your email.' };
  }

  var emailStr = String(email).trim().toLowerCase();

  var sheet = getSheet('InternalTeam');
  if (!sheet) return { success: false, error: 'InternalTeam sheet not found. Please run initializeSheets().' };

  var members = sheetToObjects(sheet);
  var existing = null;
  for (var i = 0; i < members.length; i++) {
    if (String(members[i].email).toLowerCase() === emailStr) {
      existing = members[i];
      break;
    }
  }

  if (existing) {
    return { success: true, member: { id: existing.id, email: emailStr } };
  }

  return { success: false, error: 'Email not registered. Please contact an administrator.' };
}

// ========================
// EMAIL NOTIFICATIONS
// ========================

function getInternalTeamEmails() {
  var sheet = getSheet('InternalTeam');
  if (!sheet) return [];
  var members = sheetToObjects(sheet);
  var emails = [];
  for (var i = 0; i < members.length; i++) {
    if (members[i].email && String(members[i].email).trim()) {
      emails.push(String(members[i].email).trim());
    }
  }
  return emails;
}

function sendEmailToInternalTeam_BrandAppSubmitted(app) {
  var emails = getInternalTeamEmails();
  if (emails.length === 0) return;

  var subject = '[Shopee Live Creator Match] New Brand Application - ' + (app.shopName || app.brandName);
  var body = 'A new brand application has been submitted.\n\n'
    + 'Shop Name: ' + (app.shopName || app.brandName) + '\n'
    + 'Shop ID: ' + (app.shopId || '') + '\n'
    + 'Category: ' + (app.sellerType || '') + '\n'
    + 'Stream Month: ' + (app.month || '') + '\n'
    + 'Streams Requested: ' + (app.streamCount || '') + '\n'
    + 'AMS Commission: ' + (app.amsCommission || '') + '%\n'
    + 'Seller PIC: ' + (app.sellerPicName || '') + ' (' + (app.sellerPicMobile || '') + ')\n'
    + 'Seller Email: ' + (app.sellerPicEmail || '') + '\n\n'
    + 'Please log in to the Internal Dashboard to review and approve/reject this application.';

  for (var i = 0; i < emails.length; i++) {
    try { MailApp.sendEmail(emails[i], subject, body); } catch(e) { Logger.log('Failed to email ' + emails[i] + ': ' + e); }
  }
}

function sendEmailToSeller_BrandAppApproved(app) {
  var subject = '[Shopee Live Creator Match] Your Application Has Been Approved!';
  var body = 'Great news! Your brand application has been approved.\n\n'
    + 'Shop Name: ' + (app.shopName || app.brandName) + '\n'
    + 'Stream Month: ' + (app.month || '') + '\n'
    + 'Streams Requested: ' + (app.streamCount || '') + '\n\n'
    + 'Creators can now apply for your livestream slots. You will be notified when a creator confirms a slot.\n\n'
    + 'Thank you for using Shopee Live Creator Match!';

  // Get RM email if assigned
  var rmEmail = '';
  var managedSellersSheet = getSheet('Managed Sellers');
  if (managedSellersSheet) {
    var managedData = managedSellersSheet.getDataRange().getValues();
    var managedHeaders = managedData[0];
    for (var i = 1; i < managedData.length; i++) {
      var managedRow = {};
      for (var j = 0; j < managedHeaders.length; j++) { managedRow[managedHeaders[j]] = managedData[i][j]; }
      if (managedRow.Shopid && String(managedRow.Shopid) === String(app.shopId || app.brandId)) {
        if (managedRow['RM email']) {
          rmEmail = managedRow['RM email'];
        }
        break;
      }
    }
  }

  // Send to seller with RM CC'd
  if (app.sellerPicEmail) {
    var options = rmEmail ? { cc: rmEmail } : {};
    try { MailApp.sendEmail(app.sellerPicEmail, subject, body, options); } catch(e) { Logger.log('Failed to email seller (brand approval): ' + e); }
  }
}

function sendEmailToInternalTeam_CreatorAppSubmitted(app) {
  var emails = getInternalTeamEmails();
  if (emails.length === 0) return;

  var subject = '[Shopee Live Creator Match] New Creator Application - ' + (app.affiliateUsername || app.creatorName);
  var body = 'A new creator application has been submitted.\n\n'
    + 'Affiliate Username: ' + (app.affiliateUsername || '') + '\n'
    + 'Brand: ' + (app.brandName || app.shopName || '') + '\n'
    + 'Telegram: ' + (app.telegram || '') + '\n'
    + 'Phone: ' + (app.phone || '') + '\n\n'
    + 'Please log in to the Internal Dashboard to review and approve/reject this application.';

  for (var i = 0; i < emails.length; i++) {
    try { MailApp.sendEmail(emails[i], subject, body); } catch(e) { Logger.log('Failed to email ' + emails[i] + ': ' + e); }
  }
}

function sendEmailToSeller_CreatorConfirmed(creatorApp) {
  // Find the brand application to get seller email
  var baSheet = getSheet('BrandApplications');
  var brandApps = sheetToObjects(baSheet);
  var brandApp = null;
  for (var i = 0; i < brandApps.length; i++) {
    if (String(brandApps[i].id) === String(creatorApp.brandApplicationId)) { brandApp = brandApps[i]; break; }
  }
  if (!brandApp) { Logger.log('sendEmailToSeller_CreatorConfirmed: brandApp not found for id ' + creatorApp.brandApplicationId); return; }

  // Build slot display — each row has flat streamDate/streamTime/streamEndTime fields
  var slotsText = String(creatorApp.streamDate || '');
  if (creatorApp.streamTime) slotsText += ' ' + creatorApp.streamTime;
  if (creatorApp.streamEndTime) slotsText += ' – ' + creatorApp.streamEndTime;

  var subject = '[Shopee Live Creator Match] Creator Approved - ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '');
  var body = 'A creator has been approved and confirmed for a livestream slot.\n\n'
    + 'Affiliate Username: ' + (creatorApp.affiliateUsername || '') + '\n'
    + 'Telegram: ' + (creatorApp.telegram || '') + '\n'
    + 'Phone: ' + (creatorApp.phone || '') + '\n'
    + 'Slot: ' + slotsText + '\n'
    + 'Shipping Address: ' + (creatorApp.shippingAddress || '') + (creatorApp.shippingPostalCode ? ', S' +creatorApp.shippingPostalCode : '') + '\n'
    + (creatorApp.deliveryInstructions ? 'Delivery Instructions: ' + creatorApp.deliveryInstructions + '\n' : '')
    + '\nPlease coordinate with the creator for product sample delivery.\n\n'
    + 'Thank you for using Shopee Live Creator Match!';

  // Get RM email if assigned
  var rmEmail = '';
  var managedSellersSheet = getSheet('Managed Sellers');
  if (managedSellersSheet) {
    var shopId = String(brandApp.shopId || brandApp.brandId || '');
    var managedData = managedSellersSheet.getDataRange().getValues();
    var managedHeaders = managedData[0];
    for (var i = 1; i < managedData.length; i++) {
      var managedRow = {};
      for (var j = 0; j < managedHeaders.length; j++) { managedRow[managedHeaders[j]] = managedData[i][j]; }
      if (managedRow.Shopid && String(managedRow.Shopid) === shopId) {
        if (managedRow['RM email']) {
          rmEmail = managedRow['RM email'];
        }
        break;
      }
    }
  }

  // Send to seller with RM CC'd
  if (brandApp.sellerPicEmail) {
    var options = rmEmail ? { cc: rmEmail } : {};
    try { MailApp.sendEmail(brandApp.sellerPicEmail, subject, body, options); } catch(e) { Logger.log('Failed to email seller (creator confirmed): ' + e); }
  }

}

// Send rejection email to seller PIC + RM when a brand application is rejected
function sendRejectionEmailToBrandApp(app, reason) {
  var contactString = getInternalPicContactString();
  var subject = '[Shopee Live Creator Match] Brand Application Rejected — ' + (app.shopName || app.brandName || '');
  var body = 'Your brand application has been rejected by Shopee.\n\n'
    + 'Shop: ' + (app.shopName || app.brandName || '') + '\n'
    + 'Month: ' + (app.month || '') + '\n'
    + (reason ? 'Reason: ' + reason + '\n' : '')
    + '\nIf you have any questions, please contact ' + contactString + '.\n\n'
    + 'Thank you for using Shopee Live Creator Match!';

  // Get RM email if assigned
  var rmEmail = '';
  var managedSellersSheet = getSheet('Managed Sellers');
  if (managedSellersSheet) {
    var managedData = managedSellersSheet.getDataRange().getValues();
    var managedHeaders = managedData[0];
    for (var i = 1; i < managedData.length; i++) {
      var managedRow = {};
      for (var j = 0; j < managedHeaders.length; j++) { managedRow[managedHeaders[j]] = managedData[i][j]; }
      if (managedRow.Shopid && String(managedRow.Shopid) === String(app.shopId || app.brandId)) {
        if (managedRow['RM email']) {
          rmEmail = managedRow['RM email'];
        }
        break;
      }
    }
  }

  // Send to seller with RM CC'd
  if (app.sellerPicEmail) {
    var options = rmEmail ? { cc: rmEmail } : {};
    try { MailApp.sendEmail(app.sellerPicEmail, subject, body, options); } catch(e) { Logger.log('Failed to email seller PIC (brand rejection): ' + e); }
  }
}

// Send cancellation email when brand application is cancelled
function sendCancellationEmail_BrandApp(app, reason) {
  var contactString = getInternalPicContactString();
  var subject = '[Shopee Live Creator Match] Brand Application Cancelled — ' + (app.shopName || app.brandName || '');
  var body = 'Your brand application has been cancelled.\n\n'
    + 'Shop: ' + (app.shopName || app.brandName || '') + '\n'
    + 'Month: ' + (app.month || '') + '\n'
    + (reason ? 'Reason: ' + reason + '\n' : '')
    + '\nIf you have any questions, please contact ' + contactString + '.\n\n'
    + 'Thank you for using Shopee Live Creator Match!';

  // Get RM email if assigned
  var rmEmail = '';
  var managedSellersSheet = getSheet('Managed Sellers');
  if (managedSellersSheet) {
    var managedData = managedSellersSheet.getDataRange().getValues();
    var managedHeaders = managedData[0];
    for (var i = 1; i < managedData.length; i++) {
      var managedRow = {};
      for (var j = 0; j < managedHeaders.length; j++) { managedRow[managedHeaders[j]] = managedData[i][j]; }
      if (managedRow.Shopid && String(managedRow.Shopid) === String(app.shopId || app.brandId)) {
        if (managedRow['RM email']) {
          rmEmail = managedRow['RM email'];
        }
        break;
      }
    }
  }

  // Send to seller with RM CC'd
  if (app.sellerPicEmail) {
    var options = rmEmail ? { cc: rmEmail } : {};
    try { MailApp.sendEmail(app.sellerPicEmail, subject, body, options); } catch(e) { Logger.log('Failed to email seller (brand cancellation): ' + e); }
  }
}

// Send cancellation email/notification when creator application is cancelled
function sendCancellationEmail_CreatorApp(creatorApp, brandApp, reason) {
  var contactString = getInternalPicContactString();
  var subject = '[Shopee Live Creator Match] Stream Cancelled - ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '');

  // Email to seller + RM
  var sellerSubject = '[Shopee Live Creator Match] Creator Stream Cancelled - ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '');
  var sellerBody = 'A creator has cancelled their livestream slot.\n\n'
    + 'Creator: ' + (creatorApp.affiliateUsername || creatorApp.creatorName || '') + '\n'
    + 'Shop: ' + (creatorApp.brandName || creatorApp.shopName || '') + '\n'
    + 'Slot: ' + (creatorApp.streamDate || '') + (creatorApp.streamTime ? ' ' + creatorApp.streamTime : '') + '\n'
    + (reason ? 'Reason: ' + reason + '\n' : '')
    + '\nPlease update your livestream schedule accordingly.\n\n'
    + 'Thank you for using Shopee Live Creator Match!';

  // Get RM email if assigned
  var rmEmail = '';
  if (brandApp) {
    var managedSellersSheet = getSheet('Managed Sellers');
    if (managedSellersSheet) {
      var managedData = managedSellersSheet.getDataRange().getValues();
      var managedHeaders = managedData[0];
      for (var i = 1; i < managedData.length; i++) {
        var managedRow = {};
        for (var j = 0; j < managedHeaders.length; j++) { managedRow[managedHeaders[j]] = managedData[i][j]; }
        if (managedRow.Shopid && String(managedRow.Shopid) === String(brandApp.shopId || brandApp.brandId)) {
          if (managedRow['RM email']) {
            rmEmail = managedRow['RM email'];
          }
          break;
        }
      }
    }
  }

  // Send to seller with RM CC'd
  if (brandApp && brandApp.sellerPicEmail) {
    var options = rmEmail ? { cc: rmEmail } : {};
    try { MailApp.sendEmail(brandApp.sellerPicEmail, sellerSubject, sellerBody, options); } catch(e) { Logger.log('Failed to email seller (creator cancellation): ' + e); }
  }

  // Telegram notification to creator
  var creatorTelegramBody = '❌ <b>Your livestream slot has been cancelled.</b>\n\n'
    + '🏪 <b>Shop:</b> ' + (creatorApp.brandName || creatorApp.shopName || '') + '\n'
    + '📅 <b>Date & Time:</b> ' + formatDateDDMMMYYYY(creatorApp.streamDate) + (creatorApp.streamTime ? ' ' + creatorApp.streamTime : '') + '\n'
    + (reason ? '<b>Reason:</b> ' + reason + '\n' : '')
    + '\nIf you have any questions, please contact ' + contactString + '.';

  try {
    var chatId = getTelegramChatId(creatorApp.telegram);
    if (chatId) {
      telegramSend('sendMessage', {
        chat_id: chatId,
        text: creatorTelegramBody,
        parse_mode: 'HTML',
      });
    }
  } catch(e) { Logger.log('Failed to send Telegram notification (creator cancellation): ' + e); }
}

// Send Telegram to creator when a creator application is rejected by internal team
function sendRejectionNotifications_CreatorApp(creatorApp, reason) {
  var chatId = getTelegramChatId(creatorApp.telegram);
  if (!chatId) {
    Logger.log('sendRejectionNotifications_CreatorApp: No Telegram chatId for ' + creatorApp.telegram);
    return;
  }
  var time = creatorApp.streamTime || '';
  if (creatorApp.streamEndTime) time += ' – ' + creatorApp.streamEndTime;
  var slotText = '📅 ' + formatDateDDMMMYYYY(creatorApp.streamDate) + (time ? ' ' + time : '');
  var contactString = getInternalPicContactString();
  var message = '❌ <b>Your livestream application has been rejected.</b>\n\n'
    + '🏪 <b>Shop:</b> ' + (creatorApp.brandName || creatorApp.shopName || '') + '\n'
    + slotText + '\n'
    + (reason ? '\n<b>Reason:</b> ' + reason + '\n' : '')
    + '\nIf you have any questions, please contact ' + contactString + '.';
  try {
    telegramSend('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML' });
  } catch(e) { Logger.log('Failed to send Telegram rejection to creator: ' + e); }
}

// ========================
// DAILY TELEGRAM REMINDERS
// ========================

// Runs daily at 11am SGT (set up via Apps Script Triggers).
// Sends a 1-day-before reminder to creators with approved streams tomorrow.
function runDailyTelegramReminders() {
  var tz = 'Asia/Singapore';

  // Calculate tomorrow's date in SGT
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var tomorrowStr = Utilities.formatDate(tomorrow, tz, 'yyyy-MM-dd');

  // Read CreatorApplications sheet once
  var caSheet = getSheet('CreatorApplications');
  if (!caSheet) return;
  var caData = caSheet.getDataRange().getValues();
  if (caData.length <= 1) return;

  var headers = caData[0];
  var statusCol = headers.indexOf('status');
  var streamDateCol = headers.indexOf('streamDate');
  var telegramCol = headers.indexOf('telegram');
  var shopNameCol = headers.indexOf('shopName');
  var streamTimeCol = headers.indexOf('streamTime');
  var streamEndTimeCol = headers.indexOf('streamEndTime');
  var reminderCol = headers.indexOf('reminder1dTelegramSentAt');

  if (reminderCol < 0) {
    Logger.log('runDailyTelegramReminders: reminder1dTelegramSentAt column not found in sheet');
    return;
  }

  // Collect qualifying rows and look up chatIds
  var toNotify = [];
  for (var i = 1; i < caData.length; i++) {
    var row = caData[i];
    if (!row[0]) continue; // skip empty rows
    var status = String(row[statusCol] || '').trim().toLowerCase();
    var streamDate = String(row[streamDateCol] || '').trim();
    var alreadySent = String(row[reminderCol] || '').trim() !== '';

    if (status !== 'approved' || streamDate !== tomorrowStr || alreadySent) continue;

    var chatId = getTelegramChatId(String(row[telegramCol] || ''));
    if (!chatId) continue; // skip silently — no Telegram linked

    var shopName = String(row[shopNameCol] || '');
    var streamTime = String(row[streamTimeCol] || '');
    var streamEndTime = String(row[streamEndTimeCol] || '');
    var timeStr = streamTime + (streamEndTime ? ' \u2013 ' + streamEndTime : '');

    var message = '🎬 <b>Your livestream is tomorrow!</b>\n\n'
      + '🏪 <b>Shop:</b> ' + shopName + '\n'
      + '📅 <b>Date:</b> ' + formatDateDDMMMYYYY(streamDate) + '\n'
      + '⏰ <b>Time:</b> ' + timeStr + '\n\n'
      + 'Make sure your setup is ready and samples have been received. See you live! \uD83D\uDED2';

    toNotify.push({
      rowIndex: i + 1, // 1-based sheet row
      request: {
        url: 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage',
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ chat_id: String(chatId), text: message, parse_mode: 'HTML' }),
        muteHttpExceptions: true
      }
    });
  }

  if (toNotify.length === 0) {
    Logger.log('runDailyTelegramReminders: no qualifying rows for ' + tomorrowStr);
    return;
  }

  Logger.log('runDailyTelegramReminders: sending ' + toNotify.length + ' reminder(s) for ' + tomorrowStr);

  // Fire all Telegram requests in parallel
  var responses = UrlFetchApp.fetchAll(toNotify.map(function(item) { return item.request; }));

  // Write back reminder timestamps for successful sends (direct cell write — no full sheet re-read)
  var now = new Date().toISOString();
  for (var k = 0; k < responses.length; k++) {
    try {
      var result = JSON.parse(responses[k].getContentText());
      if (result.ok) {
        var cell = caSheet.getRange(toNotify[k].rowIndex, reminderCol + 1);
        cell.setNumberFormat('@');
        cell.setValue(now);
      } else {
        Logger.log('runDailyTelegramReminders: Telegram API error row ' + toNotify[k].rowIndex + ': ' + responses[k].getContentText());
      }
    } catch(e) {
      Logger.log('runDailyTelegramReminders: response parse error row ' + toNotify[k].rowIndex + ': ' + e);
    }
  }
}

// TEST: Run this in the Apps Script editor to verify MailApp can send emails
function testMailApp() {
  var testEmail = 'YOUR_EMAIL_HERE'; // Replace with your actual email
  try {
    MailApp.sendEmail(testEmail, '[StreamMatch] MailApp test', 'If you receive this, MailApp is working correctly.');
    Logger.log('Test email sent to: ' + testEmail);
  } catch(e) {
    Logger.log('MailApp test FAILED: ' + e);
  }
}

// TEST: Run this in the Apps Script editor to verify the bot can send messages
function testTelegramBot() {
  var sheet = getSheet('TelegramUsers');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('No users in TelegramUsers sheet. Send /start to the bot first.');
    return;
  }
  var chatId = String(data[1][1]);
  Logger.log('Sending test message to chatId: ' + chatId);
  var response = telegramSend('sendMessage', {
    chat_id: chatId,
    text: 'Test message from Shopee Live Creator Match bot!'
  });
  Logger.log('Response: ' + response.getContentText());
}
