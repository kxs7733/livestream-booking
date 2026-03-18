/**
 * StreamMatch - Google Apps Script Backend
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet
 * 2. Create 6 sheets (tabs) named exactly: Sellers, Affiliates, Slots, Bookings, BrandApplications, CreatorApplications
 * 3. Add headers to each sheet:
 *    - Sellers: id | name | createdAt
 *    - Affiliates: id | name | createdAt | phone
 *    - Slots: id | sellerId | sellerName | date | startTime | endTime | description | createdAt
 *    - Bookings: id | slotId | sellerId | sellerName | affiliateId | affiliateName | date | startTime | endTime | bookedAt
 *    - BrandApplications: id | brandId | brandName | shopId | shopName | month | streamCount | sellerType | productNominationsConfirmed | numProductsSponsored | streamLocation | hasPackageActivation | preferredDate | sellerSiteRequired | amsCommission | bundleDealsAgreed | voucherTier | creatorAssignmentAgreed | sellerPicName | sellerPicMobile | sellerPicEmail | status | createdAt | livestreamBrief | sellerSiteAddress
 *    - CreatorApplications: id | creatorId | creatorName | brandApplicationId | brandName | shopName | streamDate | streamTime | affiliateUsername | phone | telegram | shippingAddress | willingToTravel | status | createdAt | sampleSentAt
 *    - InternalTeam: id | email | createdAt
 * 4. Go to Extensions > Apps Script
 * 5. Paste this code and save
 * 6. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. Copy the deployment URL and update API_URL in the HTML file
 */

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
        result = getAllData(e.parameter.allMonths === 'true');
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
      case 'updateCreatorApplication':
        result = updateCreatorApplication(e.parameter.id, JSON.parse(e.parameter.data));
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
        result = validateCreatorLogin(e.parameter.affiliateUsername, e.parameter.phone);
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
  try {
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType || 'application/octet-stream', fileName);
    var folder = getBriefFolder();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { success: true, fileUrl: file.getUrl(), fileId: file.getId() };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// Get the briefs folder in Drive — replace the folder ID with your own
const BRIEF_FOLDER_ID = '11ab4D7G4Lx2m84NmQslTNxIWM_XhN9Eb';

// Telegram Bot Token — replace with your bot token from @BotFather
const TELEGRAM_BOT_TOKEN = '8527763047:AAG0pCj2YZurmmucqUC3z9r2p1Zt2NqQP6I';

// Internal team dashboard password
const INTERNAL_PASSWORD = 'shopeelive2025';

function getBriefFolder() {
  return DriveApp.getFolderById(BRIEF_FOLDER_ID);
}

// Get display months (current + next 2)
function getDisplayMonths() {
  var now = new Date();
  var months = [];
  for (var i = 0; i < 3; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() + i);
    var m = String(d.getMonth() + 1);
    if (m.length < 2) m = '0' + m;
    months.push(d.getFullYear() + '-' + m);
  }
  return months;
}

// Get all data — filtered to 3-month window by default, or all data if allMonths=true
function getAllData(allMonths) {
  var sellers = sheetToObjects(getSheet('Sellers'));
  var affiliates = sheetToObjects(getSheet('Affiliates'));
  var slots = sheetToObjects(getSheet('Slots'));
  var bookings = sheetToObjects(getSheet('Bookings'));
  var brandApplications = sheetToObjects(getSheet('BrandApplications'));
  var creatorApplications = sheetToObjects(getSheet('CreatorApplications'));
  var rms = (function() {
    var sheet = getSheet('RMs');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    var headers = data[0];
    var result = [];
    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) { obj[headers[j]] = data[i][j]; }
      if (obj.shopid) result.push(obj);
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
    var months = getDisplayMonths();
    brandApplications = brandApplications.filter(function(a) {
      return months.indexOf(String(a.month)) >= 0;
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
    rms: rms,
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

// Add seller
function addSeller(data) {
  const sheet = getSheet('Sellers');
  appendRowAsText(sheet, [data.id, data.name, data.createdAt, data.siteAddress || '']);
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
  appendRowAsText(sheet, [
    data.id,
    data.brandId,
    data.brandName,
    data.shopId,
    data.shopName,
    data.month,
    data.streamCount,
    data.sellerType,
    data.productNominationsConfirmed,
    data.numProductsSponsored,
    data.streamLocation,
    data.hasPackageActivation,
    data.preferredDate || '',
    data.sellerSiteRequired,
    data.amsCommission,
    data.bundleDealsAgreed,
    data.voucherTier,
    data.creatorAssignmentAgreed,
    data.sellerPicName,
    data.sellerPicMobile,
    data.sellerPicEmail || '',
    data.status,
    data.createdAt,
    data.livestreamBrief || '',
    data.sellerSiteAddress || ''
  ]);

  // Email notification to internal team
  try { sendEmailToInternalTeam_BrandAppSubmitted(data); } catch(e) { Logger.log('Email error: ' + e); }

  return { success: true, data: data };
}

// Add creator application (supports both old single-slot and new multi-slot format)
function addCreatorApplication(data) {
  const sheet = getSheet('CreatorApplications');
  // New format: timeslots array stored as JSON in the streamDate column
  var timeslotsStr = '';
  if (data.timeslots) {
    timeslotsStr = Array.isArray(data.timeslots) ? JSON.stringify(data.timeslots) : String(data.timeslots);
  } else if (data.streamDate) {
    timeslotsStr = String(data.streamDate);
  }
  appendRowAsText(sheet, [
    data.id,
    data.creatorId,
    data.creatorName,
    data.brandApplicationId,
    data.brandName,
    data.shopName,
    timeslotsStr,
    data.streamTime || '',
    data.affiliateUsername,
    data.phone,
    data.telegram,
    data.shippingAddress,
    data.willingToTravel,
    data.status,
    data.createdAt
  ]);

  // Email notification to internal team
  try { sendEmailToInternalTeam_CreatorAppSubmitted(data); } catch(e) { Logger.log('Email error: ' + e); }

  return { success: true, data: data };
}

// Update brand application
function updateBrandApplication(id, data) {
  const sheet = getSheet('BrandApplications');
  const success = updateRowById(sheet, id, data);

  // Email seller when brand application is approved
  if (success && String(data.status) === 'approved') {
    try {
      var apps = sheetToObjects(sheet);
      var app = null;
      for (var i = 0; i < apps.length; i++) {
        if (String(apps[i].id) === String(id)) { app = apps[i]; break; }
      }
      if (app && app.sellerPicEmail) {
        sendEmailToSeller_BrandAppApproved(app);
      }
    } catch (e) { Logger.log('Email error: ' + e); }
  }

  return { success: success };
}

// Update creator application
function updateCreatorApplication(id, data) {
  const sheet = getSheet('CreatorApplications');
  const success = updateRowById(sheet, id, data);

  // Send Telegram notification when application is approved
  if (success && String(data.status) === 'approved') {
    try {
      var apps = sheetToObjects(sheet);
      var app = null;
      for (var i = 0; i < apps.length; i++) {
        if (String(apps[i].id) === String(id)) { app = apps[i]; break; }
      }
      if (app) {
        sendApprovalNotification(app);
      }
    } catch (err) {
      Logger.log('Telegram notification error: ' + err.toString());
    }
  }

  // Email seller when creator confirms slot
  if (success && String(data.status) === 'confirmed') {
    try {
      var allApps = sheetToObjects(sheet);
      var confirmedApp = null;
      for (var j = 0; j < allApps.length; j++) {
        if (String(allApps[j].id) === String(id)) { confirmedApp = allApps[j]; break; }
      }
      if (confirmedApp) {
        sendEmailToSeller_CreatorConfirmed(confirmedApp);
      }
    } catch (err) {
      Logger.log('Email notification error: ' + err.toString());
    }
  }

  return { success: success };
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
      return { success: true, exists: true, seller: existingById };
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

// Validate creator login: if username exists, check phone matches; if new, check both are unique
function validateCreatorLogin(affiliateUsername, phone) {
  const sheet = getSheet('Affiliates');
  const affiliates = sheetToObjects(sheet);
  const existing = affiliates.find(a => String(a.name).toLowerCase() === String(affiliateUsername).toLowerCase());
  if (existing) {
    if (String(existing.phone) === String(phone)) {
      return { success: true, exists: true, affiliate: existing };
    } else {
      return { success: false, error: 'Phone number does not match the registered Affiliate Username. Please check your credentials.' };
    }
  }
  // New username — check that phone isn't already used by another creator
  const existingByPhone = affiliates.find(a => String(a.phone) === String(phone));
  if (existingByPhone) {
    return { success: false, error: 'This phone number is already registered under a different Affiliate Username. Please check your credentials.' };
  }
  return { success: true, exists: false };
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
  var updated = updateRowById(sellersSheet, shopId, sellerUpdateFields);
  if (!updated) return { success: false, error: 'Seller not found' };

  // 2. Cascade name change to BrandApplications (siteAddress is per-application, not cascaded)
  if (data.name) {
    var baSheet = getSheet('BrandApplications');
    var baData = baSheet.getDataRange().getValues();
    var baHeaders = baData[0];
    var brandIdCol = baHeaders.indexOf('brandId');
    var brandNameCol = baHeaders.indexOf('brandName');
    var shopNameCol = baHeaders.indexOf('shopName');

    for (var i = 1; i < baData.length; i++) {
      if (String(baData[i][brandIdCol]) === String(shopId)) {
        if (brandNameCol >= 0) {
          var cell = baSheet.getRange(i + 1, brandNameCol + 1);
          cell.setNumberFormat('@');
          cell.setValue(String(data.name));
        }
        if (shopNameCol >= 0) {
          var cell2 = baSheet.getRange(i + 1, shopNameCol + 1);
          cell2.setNumberFormat('@');
          cell2.setValue(String(data.name));
        }
        updatedCount++;
      }
    }

    // 3. Cascade name change to CreatorApplications
    var caSheet = getSheet('CreatorApplications');
    var caData = caSheet.getDataRange().getValues();
    var caHeaders = caData[0];
    var caBrandNameCol = caHeaders.indexOf('brandName');
    var caShopNameCol = caHeaders.indexOf('shopName');
    var caBrandAppIdCol = caHeaders.indexOf('brandApplicationId');

    var brandAppIds = [];
    for (var j = 1; j < baData.length; j++) {
      if (String(baData[j][brandIdCol]) === String(shopId)) {
        brandAppIds.push(String(baData[j][baHeaders.indexOf('id')]));
      }
    }

    for (var k = 1; k < caData.length; k++) {
      if (brandAppIds.indexOf(String(caData[k][caBrandAppIdCol])) >= 0) {
        if (caBrandNameCol >= 0) {
          var cell3 = caSheet.getRange(k + 1, caBrandNameCol + 1);
          cell3.setNumberFormat('@');
          cell3.setValue(String(data.name));
        }
        if (caShopNameCol >= 0) {
          var cell4 = caSheet.getRange(k + 1, caShopNameCol + 1);
          cell4.setNumberFormat('@');
          cell4.setValue(String(data.name));
        }
        updatedCount++;
      }
    }
  }

  return { success: true, updatedCount: updatedCount };
}

// Update affiliate profile with cascading updates to CreatorApplications
function updateAffiliateProfile(affiliateId, data) {
  var updatedCount = 0;

  // Uniqueness check: if username changed, ensure no other affiliate has that name
  var affSheet = getSheet('Affiliates');
  var affiliates = sheetToObjects(affSheet);
  var current = affiliates.find(function(a) { return String(a.id) === String(affiliateId); });
  if (!current) return { success: false, error: 'Affiliate not found' };

  if (data.name && String(data.name).toLowerCase() !== String(current.name).toLowerCase()) {
    var duplicate = affiliates.find(function(a) {
      return String(a.id) !== String(affiliateId) && String(a.name).toLowerCase() === String(data.name).toLowerCase();
    });
    if (duplicate) {
      return { success: false, error: 'Another creator already uses this username. Please choose a different one.' };
    }
  }

  // 1. Update Affiliates row
  var affUpdates = {};
  if (data.name) affUpdates.name = data.name;
  if (data.phone !== undefined) affUpdates.phone = data.phone;
  var updated = updateRowById(affSheet, affiliateId, affUpdates);
  if (!updated) return { success: false, error: 'Affiliate not found' };

  // 2. Update all CreatorApplications where creatorId matches
  var caSheet = getSheet('CreatorApplications');
  var caData = caSheet.getDataRange().getValues();
  var caHeaders = caData[0];
  var creatorIdCol = caHeaders.indexOf('creatorId');
  var creatorNameCol = caHeaders.indexOf('creatorName');
  var affUsernameCol = caHeaders.indexOf('affiliateUsername');
  var phoneCol = caHeaders.indexOf('phone');

  for (var i = 1; i < caData.length; i++) {
    if (String(caData[i][creatorIdCol]) === String(affiliateId)) {
      if (data.name && creatorNameCol >= 0) {
        var cell = caSheet.getRange(i + 1, creatorNameCol + 1);
        cell.setNumberFormat('@');
        cell.setValue(String(data.name));
      }
      if (data.name && affUsernameCol >= 0) {
        var cell2 = caSheet.getRange(i + 1, affUsernameCol + 1);
        cell2.setNumberFormat('@');
        cell2.setValue(String(data.name));
      }
      if (data.phone !== undefined && phoneCol >= 0) {
        var cell3 = caSheet.getRange(i + 1, phoneCol + 1);
        cell3.setNumberFormat('@');
        cell3.setValue(String(data.phone));
      }
      updatedCount++;
    }
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
    sheet.appendRow(['id', 'name', 'createdAt', 'siteAddress']);
  }

  // Affiliates
  sheet = ss.getSheetByName('Affiliates');
  if (!sheet) {
    sheet = ss.insertSheet('Affiliates');
    sheet.appendRow(['id', 'name', 'createdAt', 'phone']);
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
    sheet.appendRow(['id', 'brandId', 'brandName', 'shopId', 'shopName', 'month', 'streamCount', 'sellerType', 'productNominationsConfirmed', 'numProductsSponsored', 'streamLocation', 'hasPackageActivation', 'preferredDate', 'sellerSiteRequired', 'amsCommission', 'bundleDealsAgreed', 'voucherTier', 'creatorAssignmentAgreed', 'sellerPicName', 'sellerPicMobile', 'sellerPicEmail', 'status', 'createdAt', 'livestreamBrief', 'sellerSiteAddress']);
  }

  // CreatorApplications
  sheet = ss.getSheetByName('CreatorApplications');
  if (!sheet) {
    sheet = ss.insertSheet('CreatorApplications');
    sheet.appendRow(['id', 'creatorId', 'creatorName', 'brandApplicationId', 'brandName', 'shopName', 'streamDate', 'streamTime', 'affiliateUsername', 'phone', 'telegram', 'shippingAddress', 'willingToTravel', 'status', 'createdAt']);
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

      // Handle text "confirmed" replies (check if they have a pending approval)
      if (text.toLowerCase() === 'confirmed' || text.toLowerCase() === 'confirm') {
        handleTelegramTextConfirm(chatId, username);
        return;
      }

      if (text.toLowerCase() === 'reject' || text.toLowerCase() === 'decline') {
        handleTelegramTextReject(chatId, username);
        return;
      }

      telegramSend('sendMessage', {
        chat_id: chatId,
        text: 'Hi! I only send notifications when your livestream applications are approved. If you have a pending slot to confirm or reject, use the buttons in the notification message, or type "Confirm" or "Reject".'
      });
    }
  } catch (err) {
    Logger.log('Telegram update error: ' + err.toString());
  }
}

// Handle inline button callback (Confirm Slot)
function handleTelegramCallback(callback) {
  var data = callback.data; // e.g. "confirm_abc123xyz"
  var chatId = callback.message.chat.id;

  if (data && data.indexOf('confirm_') === 0) {
    var appId = data.substring(8);

    // Verify the application exists and is in 'approved' status
    var sheet = getSheet('CreatorApplications');
    var apps = sheetToObjects(sheet);
    var app = null;
    for (var i = 0; i < apps.length; i++) {
      if (String(apps[i].id) === String(appId)) { app = apps[i]; break; }
    }

    if (!app) {
      telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'Application not found.', show_alert: true });
      return;
    }

    if (String(app.status) === 'confirmed') {
      telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'This slot is already confirmed!', show_alert: true });
      // Update the message to show confirmed
      telegramSend('editMessageText', {
        chat_id: chatId,
        message_id: callback.message.message_id,
        text: callback.message.text + '\n\n✅ CONFIRMED',
        parse_mode: 'HTML'
      });
      return;
    }

    if (String(app.status) !== 'approved') {
      telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'This application is no longer pending confirmation.', show_alert: true });
      return;
    }

    // Confirm the slot
    var confirmedAt = new Date().toISOString();
    updateRowById(sheet, appId, { status: 'confirmed', confirmedAt: confirmedAt });

    telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: '✅ Slot confirmed!', show_alert: false });

    // Update the message to show confirmed
    telegramSend('editMessageText', {
      chat_id: chatId,
      message_id: callback.message.message_id,
      text: callback.message.text + '\n\n✅ SLOT CONFIRMED — ' + new Date().toLocaleDateString('en-SG'),
      parse_mode: 'HTML'
    });
  }

  if (data && data.indexOf('reject_') === 0) {
    var appId = data.substring(7);

    // Verify the application exists and is in 'approved' status
    var sheet = getSheet('CreatorApplications');
    var apps = sheetToObjects(sheet);
    var app = null;
    for (var i = 0; i < apps.length; i++) {
      if (String(apps[i].id) === String(appId)) { app = apps[i]; break; }
    }

    if (!app) {
      telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'Application not found.', show_alert: true });
      return;
    }

    if (String(app.status) === 'rejected') {
      telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'This slot is already rejected.', show_alert: true });
      telegramSend('editMessageText', {
        chat_id: chatId,
        message_id: callback.message.message_id,
        text: callback.message.text + '\n\n❌ REJECTED',
        parse_mode: 'HTML'
      });
      return;
    }

    if (String(app.status) === 'confirmed') {
      telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'This slot is already confirmed and cannot be rejected.', show_alert: true });
      return;
    }

    if (String(app.status) !== 'approved') {
      telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: 'This application is no longer pending confirmation.', show_alert: true });
      return;
    }

    // Reject the slot
    var rejectedAt = new Date().toISOString();
    updateRowById(sheet, appId, { status: 'rejected', rejectedAt: rejectedAt, rejectedBy: 'creator' });

    telegramSend('answerCallbackQuery', { callback_query_id: callback.id, text: '❌ Slot rejected.', show_alert: false });

    // Update the message to show rejected
    telegramSend('editMessageText', {
      chat_id: chatId,
      message_id: callback.message.message_id,
      text: callback.message.text + '\n\n❌ SLOT REJECTED — ' + new Date().toLocaleDateString('en-SG'),
      parse_mode: 'HTML'
    });
  }
}

// Handle text "Confirm" reply — confirm the most recent pending approval for this user
function handleTelegramTextConfirm(chatId, username) {
  var sheet = getSheet('CreatorApplications');
  var apps = sheetToObjects(sheet);

  // Find approved apps for this creator (by telegram username)
  var pending = [];
  for (var i = 0; i < apps.length; i++) {
    var appTelegram = String(apps[i].telegram || '').replace('@', '').toLowerCase();
    if (appTelegram === username && String(apps[i].status) === 'approved') {
      pending.push(apps[i]);
    }
  }

  if (pending.length === 0) {
    telegramSend('sendMessage', {
      chat_id: chatId,
      text: 'You don\'t have any slots pending confirmation right now.'
    });
    return;
  }

  if (pending.length === 1) {
    // Confirm the single pending app
    var confirmedAt = new Date().toISOString();
    updateRowById(sheet, pending[0].id, { status: 'confirmed', confirmedAt: confirmedAt });
    telegramSend('sendMessage', {
      chat_id: chatId,
      text: '✅ Slot confirmed for ' + (pending[0].brandName || pending[0].shopName) + '!\n\nThank you!'
    });
    return;
  }

  // Multiple pending — ask them to use the buttons
  telegramSend('sendMessage', {
    chat_id: chatId,
    text: 'You have ' + pending.length + ' slots pending confirmation. Please use the "Confirm Slot" buttons in the notification messages above, or log in to the app to confirm individually.'
  });
}

// Handle text "Reject" reply — reject the most recent pending approval for this user
function handleTelegramTextReject(chatId, username) {
  var sheet = getSheet('CreatorApplications');
  var apps = sheetToObjects(sheet);

  // Find approved apps for this creator (by telegram username)
  var pending = [];
  for (var i = 0; i < apps.length; i++) {
    var appTelegram = String(apps[i].telegram || '').replace('@', '').toLowerCase();
    if (appTelegram === username && String(apps[i].status) === 'approved') {
      pending.push(apps[i]);
    }
  }

  if (pending.length === 0) {
    telegramSend('sendMessage', {
      chat_id: chatId,
      text: 'You don\'t have any slots pending confirmation right now.'
    });
    return;
  }

  if (pending.length === 1) {
    // Reject the single pending app
    var rejectedAt = new Date().toISOString();
    updateRowById(sheet, pending[0].id, { status: 'rejected', rejectedAt: rejectedAt, rejectedBy: 'creator' });
    telegramSend('sendMessage', {
      chat_id: chatId,
      text: '❌ Slot rejected for ' + (pending[0].brandName || pending[0].shopName) + '.\n\nThe slot is now available for other creators.'
    });
    return;
  }

  // Multiple pending — ask them to use the buttons
  telegramSend('sendMessage', {
    chat_id: chatId,
    text: 'You have ' + pending.length + ' slots pending confirmation. Please use the buttons in the notification messages above, or log in to the app to confirm or reject individually.'
  });
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

// Send approval notification to creator via Telegram
function sendApprovalNotification(creatorApp) {
  var telegramUsername = creatorApp.telegram;
  var chatId = getTelegramChatId(telegramUsername);
  if (!chatId) {
    Logger.log('No Telegram chatId found for: ' + telegramUsername);
    return false;
  }

  // Parse timeslots for display
  var slotsText = '';
  try {
    var slots = JSON.parse(creatorApp.streamDate);
    if (Array.isArray(slots)) {
      slotsText = slots.map(function(s) {
        var time = s.startTime || '';
        if (s.endTime) time += ' – ' + s.endTime;
        return '📅 ' + s.date + ' ' + time;
      }).join('\n');
    }
  } catch (e) {
    slotsText = '📅 ' + String(creatorApp.streamDate || '') + ' ' + String(creatorApp.streamTime || '');
  }

  var message = '🎬 <b>Your application has been approved!</b>\n\n'
    + '🏪 <b>Shop:</b> ' + (creatorApp.brandName || creatorApp.shopName) + '\n'
    + slotsText + '\n'
    + '📦 <b>Shipping Address:</b> ' + (creatorApp.shippingAddress || 'N/A') + '\n\n'
    + 'Please confirm your slot by clicking the button below, or log in to the app.';

  telegramSend('sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: '✅ Confirm Slot', callback_data: 'confirm_' + creatorApp.id }],
        [{ text: '❌ Reject Slot', callback_data: 'reject_' + creatorApp.id }]
      ]
    })
  });

  return true;
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
  var email = app.sellerPicEmail;
  if (!email) return;

  var subject = '[Shopee Live Creator Match] Your Application Has Been Approved!';
  var body = 'Great news! Your brand application has been approved.\n\n'
    + 'Shop Name: ' + (app.shopName || app.brandName) + '\n'
    + 'Stream Month: ' + (app.month || '') + '\n'
    + 'Streams Requested: ' + (app.streamCount || '') + '\n\n'
    + 'Creators can now apply for your livestream slots. You will be notified when a creator confirms a slot.\n\n'
    + 'Thank you for using Shopee Live Creator Match!';

  try { MailApp.sendEmail(email, subject, body); } catch(e) { Logger.log('Failed to email seller: ' + e); }
}

function sendEmailToInternalTeam_CreatorAppSubmitted(app) {
  var emails = getInternalTeamEmails();
  if (emails.length === 0) return;

  var subject = '[Shopee Live Creator Match] New Creator Application - ' + (app.creatorName || app.affiliateUsername);
  var body = 'A new creator application has been submitted.\n\n'
    + 'Creator: ' + (app.creatorName || '') + '\n'
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
  if (!brandApp || !brandApp.sellerPicEmail) return;

  // Parse timeslots for display
  var slotsText = '';
  try {
    var slots = JSON.parse(creatorApp.streamDate);
    if (Array.isArray(slots)) {
      slotsText = slots.map(function(s) {
        return s.date + ' ' + (s.startTime || '') + (s.endTime ? ' - ' + s.endTime : '');
      }).join('\n');
    }
  } catch(e) {
    slotsText = String(creatorApp.streamDate || '') + ' ' + String(creatorApp.streamTime || '');
  }

  var subject = '[Shopee Live Creator Match] Creator Confirmed - ' + (creatorApp.creatorName || '');
  var body = 'A creator has confirmed their livestream slot.\n\n'
    + 'Creator: ' + (creatorApp.creatorName || '') + '\n'
    + 'Affiliate Username: ' + (creatorApp.affiliateUsername || '') + '\n'
    + 'Telegram: ' + (creatorApp.telegram || '') + '\n'
    + 'Phone: ' + (creatorApp.phone || '') + '\n'
    + 'Timeslots:\n' + slotsText + '\n'
    + 'Shipping Address: ' + (creatorApp.shippingAddress || '') + '\n\n'
    + 'Please coordinate with the creator for product sample delivery.\n\n'
    + 'Thank you for using Shopee Live Creator Match!';

  try { MailApp.sendEmail(brandApp.sellerPicEmail, subject, body); } catch(e) { Logger.log('Failed to email seller: ' + e); }
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
