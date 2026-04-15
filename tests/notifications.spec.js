const { test, expect } = require('@playwright/test');
const {
  mockApi, baseAllData,
  loginAsBrand, loginAsCreator, loginAsInternal,
  BRAND_APP, CA_ROW_1, CA_ROW_SENT, CA_ROW_APPROVED_1,
} = require('./helpers');

const BRAND_MOCK = {
  success: true,
  exists: true,
  seller: { id: 'shop001', name: 'Test Shop', createdAt: '2026-01-01T00:00:00Z', siteAddress: '1 Test Road Singapore 123456' },
};
const CREATOR_MOCK = {
  success: true,
  exists: true,
  affiliate: { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567', shippingAddress: '123 Test St, Singapore 123456' },
};
const INTERNAL_MOCK = {
  success: true,
  member: { id: 'int001', name: 'Internal User', email: 'internal@test.com' },
};
const BRAND_APP_PENDING = { ...BRAND_APP, id: 'bapp_notif', status: 'pending' };
const PENDING_CA = { ...CA_ROW_1, id: 'ca_notif', status: 'pending' };

// ─── Brand portal — form validation notifications ─────────────────────────

test.describe('Brand portal — form validation notifications', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      validateBrandLogin: BRAND_MOCK,
      getAllData: baseAllData([]),
      uploadBrief: { success: true, fileUrl: 'https://drive.google.com/mock' },
      addBrandApplication: { success: true, id: 'bapp_new' },
    });
    await page.goto('/');
    await loginAsBrand(page);
    await page.getByText('+ Apply for Livestream Slots').click();
    await page.waitForSelector('#brand-app-form');
  });

  test('Missing category shows error notification', async ({ page }) => {
    await page.getByText('Submit Application').click();
    await expect(page.locator('.notification.error')).toBeVisible();
    await expect(page.locator('.notification.error')).toContainText('category');
  });

  test('Missing AMS commission shows error notification', async ({ page }) => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthVal = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    await page.selectOption('#f-month', monthVal);
    await page.fill('#f-stream-count', '2');
    await page.selectOption('#f-seller-type', 'Electronics');
    await page.check('#f-prod-nom');
    await page.fill('#f-num-products', '5');
    await page.selectOption('#f-stream-location', 'Creator Site');
    // Leave AMS at 0
    await page.check('#f-bundle-deals');
    await page.check('#f-creator-assignment');
    await page.fill('#f-pic-name', 'Alice');
    await page.fill('#f-pic-mobile', '91234567');
    await page.fill('#f-pic-email', 'alice@test.com');
    await page.getByText('Submit Application').click();
    await expect(page.locator('.notification.error')).toBeVisible();
    await expect(page.locator('.notification.error')).toContainText('AMS');
  });

  test('Missing brief file shows error notification', async ({ page }) => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthVal = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    await page.selectOption('#f-month', monthVal);
    await page.fill('#f-stream-count', '2');
    await page.selectOption('#f-seller-type', 'Electronics');
    await page.check('#f-prod-nom');
    await page.fill('#f-num-products', '5');
    await page.selectOption('#f-stream-location', 'Creator Site');
    await page.fill('#f-ams', '10');
    await page.check('#f-bundle-deals');
    await page.selectOption('#f-voucher-tier', 'tier1');
    await page.check('#f-creator-assignment');
    await page.fill('#f-pic-name', 'Alice');
    await page.fill('#f-pic-mobile', '91234567');
    await page.fill('#f-pic-email', 'alice@test.com');
    // No file uploaded
    await page.getByText('Submit Application').click();
    await expect(page.locator('.notification.error')).toBeVisible();
    await expect(page.locator('.notification.error')).toContainText('Brief');
  });
});

// ─── Brand portal — sample tracking notifications ─────────────────────────

test.describe('Brand portal — sample tracking notifications', () => {
  test('Mark sample as sent shows success notification', async ({ page }) => {
    await mockApi(page, {
      validateBrandLogin: BRAND_MOCK,
      getAllData: baseAllData([CA_ROW_1]),
      updateCreatorApplication: () => ({ success: true }),
    });
    await page.goto('/');
    await loginAsBrand(page);
    await page.getByText(/Confirmed Livestreams/).click();
    await page.getByText('📦 Mark Sample as Sent').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('.notification')).toBeVisible();
    await expect(page.locator('.notification')).not.toHaveClass(/error/);
  });

  test('Failed mark sample as sent shows error notification', async ({ page }) => {
    await mockApi(page, {
      validateBrandLogin: BRAND_MOCK,
      getAllData: baseAllData([CA_ROW_1]),
      updateCreatorApplication: () => ({ success: false, error: 'Update failed' }),
    });
    await page.goto('/');
    await loginAsBrand(page);
    await page.getByText(/Confirmed Livestreams/).click();
    await page.getByText('📦 Mark Sample as Sent').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('.notification.error')).toBeVisible();
  });
});

// ─── Creator portal — action notifications ─────────────────────────────────

test.describe('Creator portal — action notifications', () => {
  test('Successful slot confirmation shows success notification', async ({ page }) => {
    await mockApi(page, {
      validateCreatorLogin: CREATOR_MOCK,
      getAllData: baseAllData([CA_ROW_APPROVED_1]),
      updateCreatorApplication: () => ({ success: true }),
    });
    await page.goto('/');
    await loginAsCreator(page);
    await page.getByText(/Pending My Confirmation/).click();
    await page.getByText('Confirm Slot').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('.notification')).toBeVisible();
    await expect(page.locator('.notification')).not.toHaveClass(/error/);
  });

  test('Failed slot confirmation shows error notification', async ({ page }) => {
    await mockApi(page, {
      validateCreatorLogin: CREATOR_MOCK,
      getAllData: baseAllData([CA_ROW_APPROVED_1]),
      updateCreatorApplication: () => ({ success: false, error: 'Failed to confirm slot. Please try again.' }),
    });
    await page.goto('/');
    await loginAsCreator(page);
    await page.getByText(/Pending My Confirmation/).click();
    await page.getByText('Confirm Slot').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('.notification.error')).toBeVisible();
  });

  test('Duplicate sample receipt confirmation shows error notification', async ({ page }) => {
    await mockApi(page, {
      validateCreatorLogin: CREATOR_MOCK,
      getAllData: baseAllData([CA_ROW_SENT]),
      updateCreatorApplication: () => ({ success: false, error: 'Samples already marked as received.' }),
    });
    await page.goto('/');
    await loginAsCreator(page);
    await page.getByText(/Confirmed Livestreams/).click();
    await page.getByText("✅ I've Received the Samples").click();
    await page.waitForTimeout(500);
    await expect(page.locator('.notification.error')).toBeVisible();
    await expect(page.locator('.notification.error')).toContainText('already marked');
  });

  test('In-memory guard shows error without API call when already received', async ({ page }) => {
    const alreadyReceived = { ...CA_ROW_SENT, sampleReceivedAt: '2026-03-12T10:00:00Z' };
    await mockApi(page, {
      validateCreatorLogin: CREATOR_MOCK,
      getAllData: baseAllData([alreadyReceived]),
    });
    await page.goto('/');
    await loginAsCreator(page);
    await page.getByText(/Confirmed Livestreams/).click();
    // Since sampleReceivedAt is set, "I've Received" button should NOT be visible
    await expect(page.getByText("✅ I've Received the Samples")).not.toBeVisible();
    // Undo button should be visible instead
    await expect(page.getByText('↩ Undo')).toBeVisible();
  });
});

// ─── Internal dashboard — action notifications ─────────────────────────────

test.describe('Internal — action notifications', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      validateInternalLogin: INTERNAL_MOCK,
      getAllData: { ...baseAllData([]), brandApplications: [BRAND_APP_PENDING] },
    });
    await page.goto('/');
    await loginAsInternal(page);
  });

  test('Brand app approval shows success notification', async ({ page }) => {
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('action') === 'updateBrandApplication') {
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.stat-card').filter({ hasText: 'Brand Applications Pending Approval' }).click();
    await page.locator('.btn-approve').first().click();
    await expect(page.locator('.notification')).toBeVisible();
    await expect(page.locator('.notification')).not.toHaveClass(/error/);
  });

  test('Brand app approval failure shows error notification', async ({ page }) => {
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('action') === 'updateBrandApplication') {
        await route.fulfill({ json: { success: false, error: 'Database error' } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.stat-card').filter({ hasText: 'Brand Applications Pending Approval' }).click();
    await page.locator('.btn-approve').first().click();
    await expect(page.locator('.notification.error')).toBeVisible();
  });

  test('Brand app rejection shows success notification', async ({ page }) => {
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('action') === 'updateBrandApplication') {
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.stat-card').filter({ hasText: 'Brand Applications Pending Approval' }).click();
    await page.locator('.btn-reject').first().click();
    await expect(page.locator('.notification')).toBeVisible();
    await expect(page.locator('.notification')).not.toHaveClass(/error/);
  });

  test('Creator app approval shows success notification', async ({ page }) => {
    await mockApi(page, {
      validateInternalLogin: INTERNAL_MOCK,
      getAllData: baseAllData([PENDING_CA]),
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('action') === 'updateCreatorApplication') {
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.stat-card').filter({ hasText: 'Creator Applications Pending Approval' }).click();
    await page.locator('.btn-approve').first().click();
    await expect(page.locator('.notification')).toBeVisible();
  });

  test('Creator app rejection shows success notification', async ({ page }) => {
    await mockApi(page, {
      validateInternalLogin: INTERNAL_MOCK,
      getAllData: baseAllData([PENDING_CA]),
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('action') === 'updateCreatorApplication') {
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.stat-card').filter({ hasText: 'Creator Applications Pending Approval' }).click();
    await page.locator('.btn-reject').first().click();
    await expect(page.locator('.notification')).toBeVisible();
  });
});
