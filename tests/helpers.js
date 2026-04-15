// Shared mock data and utilities for Playwright tests

// Dates within the 3-month display window (relative to test run)
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const monthStr = (offset = 1) => {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const dateStr = (offset = 14) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ─── Mock data fixtures ───────────────────────────────────────────────────────

const SELLER = { id: 'shop001', name: 'Test Shop', createdAt: '2026-01-01T00:00:00Z', siteAddress: '1 Test Road Singapore 123456' };
const CREATOR = { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567', shippingAddress: '123 Test St, Singapore 123456' };

const BRAND_APP = {
  id: 'bapp001',
  brandId: 'shop001',
  brandName: 'Test Shop',
  shopId: 'shop001',
  shopName: 'Test Shop',
  month: monthStr(1),
  streamCount: 2,
  sellerType: 'Electronics',
  productNominationsConfirmed: 'true',
  numProductsSponsored: '5',
  streamLocation: 'Home',
  hasPackageActivation: 'false',
  preferredDate: '',
  sellerSiteRequired: 'false',
  amsCommission: '10',
  bundleDealsAgreed: 'true',
  voucherTier: 'tier1',
  creatorAssignmentAgreed: 'true',
  sellerPicName: 'Alice',
  sellerPicMobile: '6591234567',
  sellerPicEmail: 'alice@test.com',
  status: 'approved',
  createdAt: '2026-03-01T00:00:00Z',
  livestreamBrief: '',
  sellerSiteAddress: '',
};

// Two approved timeslots (unsent samples)
const CA_ROW_1 = {
  id: 'ca001',
  creatorId: 'creator001',
  creatorName: 'TestCreator',
  brandApplicationId: 'bapp001',
  brandName: 'Test Shop',
  shopName: 'Test Shop',
  streamDate: dateStr(14),
  streamTime: '14:00',
  streamEndDate: dateStr(14),
  streamEndTime: '15:30',
  affiliateUsername: 'testcreator',
  phone: '6591234567',
  telegram: '@testcreator',
  shippingAddress: '123 Test St, Singapore 123456',
  willingToTravel: 'false',
  status: 'approved',
  createdAt: '2026-03-05T00:00:00Z',
  sampleSentAt: '',
};

const CA_ROW_2 = {
  ...CA_ROW_1,
  id: 'ca002',
  streamDate: dateStr(21),
  streamEndDate: dateStr(21),
  sampleSentAt: '',
};

// Third timeslot — sample already sent
const CA_ROW_3 = {
  ...CA_ROW_1,
  id: 'ca003',
  creatorName: 'AnotherCreator',
  creatorId: 'creator002',
  affiliateUsername: 'anothercreator',
  streamDate: dateStr(28),
  streamEndDate: dateStr(28),
  sampleSentAt: '2026-03-10T10:00:00Z',
};

// Two pending rows, status=pending (for creator apply tests)
const CA_ROW_PENDING_1 = {
  ...CA_ROW_1,
  id: 'ca010',
  status: 'pending',
  sampleSentAt: '',
};
const CA_ROW_PENDING_2 = {
  ...CA_ROW_PENDING_1,
  id: 'ca011',
  streamDate: dateStr(21),
  streamEndDate: dateStr(21),
};

// Two approved rows (awaiting creator confirmation)
const CA_ROW_APPROVED_1 = { ...CA_ROW_PENDING_1, id: 'ca020', status: 'approved' };
const CA_ROW_APPROVED_2 = { ...CA_ROW_PENDING_2, id: 'ca021', status: 'approved' };

// Approved row — sample sent, awaiting creator receipt
const CA_ROW_SENT = {
  ...CA_ROW_1,
  id: 'ca005',
  streamDate: dateStr(28),
  streamEndDate: dateStr(28),
  sampleSentAt: '2026-03-10T10:00:00Z',
  sampleReceivedAt: '',
};

// Approved row — sample sent and received
const CA_ROW_RECEIVED = {
  ...CA_ROW_1,
  id: 'ca006',
  streamDate: dateStr(35),
  streamEndDate: dateStr(35),
  sampleSentAt: '2026-03-10T10:00:00Z',
  sampleReceivedAt: '2026-03-12T10:00:00Z',
};

// ─── Base getAllData response ─────────────────────────────────────────────────

const baseAllData = (caRows = []) => ({
  sellers: [SELLER],
  affiliates: [CREATOR],
  slots: [],
  bookings: [],
  brandApplications: [BRAND_APP],
  creatorApplications: caRows,
  rms: [{ shopid: 'shop001', shopname: 'Test Shop', RM: 'RM Alice' }],
  businessMappingValues: [
    { Type: 'VoucherTier', Code: 'tier1', Description: 'Tier 1 (10%)', Active: 'ACTIVE' },
    { Type: 'AvailableMonth', Code: BRAND_APP.month, Description: 'Test Month', Active: 'ACTIVE' },
  ],
  internalTeam: [],
});

// ─── API mock interceptor ─────────────────────────────────────────────────────

/**
 * Intercepts all Apps Script API calls. Pass per-action handlers or static responses.
 * Unhandled actions return { success: true } by default.
 */
async function mockApi(page, handlers = {}) {
  await page.route('**/macros/**', async (route) => {
    const url = new URL(route.request().url());
    let action = url.searchParams.get('action');

    // For POST requests (e.g. uploadBrief), action is in the body
    if (!action && route.request().method() === 'POST') {
      try {
        const body = JSON.parse(route.request().postData() || '{}');
        action = body.action;
      } catch (e) {}
    }

    const handler = handlers[action];
    let response;
    if (handler !== undefined) {
      response = typeof handler === 'function' ? await handler(url.searchParams) : handler;
    } else {
      response = { success: true };
    }
    await route.fulfill({ json: response });
  });
}

// ─── Login helpers ────────────────────────────────────────────────────────────

async function loginAsBrand(page, shopId = 'shop001', shopName = 'Test Shop') {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/');
  await page.getByText("I'm a Brand").click();
  await page.fill('#login-shop-id', shopId);
  await page.fill('#login-shop-name', shopName);
  await page.click('#login-btn');
  await page.waitForSelector('.dashboard-title');
}

async function loginAsCreator(page, username = 'TestCreator', phone = '91234567') {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/');
  await page.getByText("I'm a Creator").click();
  await page.fill('#login-name', username);
  await page.fill('#login-phone', phone);
  await page.click('#login-btn');
  await page.waitForSelector('.dashboard-title');
}

async function loginAsInternal(page, password = 'testpass', email = 'internal@test.com') {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/');
  await page.getByText('Internal Team Dashboard →').click();
  await page.fill('#internal-email', email);
  await page.fill('#internal-password', password);
  await page.click('#internal-login-btn');
  await page.waitForSelector('.dashboard-title');
}

module.exports = {
  mockApi,
  baseAllData,
  loginAsBrand,
  loginAsCreator,
  loginAsInternal,
  SELLER,
  CREATOR,
  BRAND_APP,
  CA_ROW_1,
  CA_ROW_2,
  CA_ROW_3,
  CA_ROW_SENT,
  CA_ROW_RECEIVED,
  CA_ROW_PENDING_1,
  CA_ROW_PENDING_2,
  CA_ROW_APPROVED_1,
  CA_ROW_APPROVED_2,
  dateStr,
};
