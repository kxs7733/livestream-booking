const { test, expect } = require('@playwright/test');
const { mockApi, baseAllData, loginAsBrand } = require('./helpers');

const BRAND_LOGIN_MOCK = {
  success: true,
  exists: true,
  seller: { id: 'shop001', name: 'Test Shop', createdAt: '2026-01-01T00:00:00Z', siteAddress: '1 Test Road Singapore 123456' },
};

// Fills every required field in the brand application form
async function fillBrandForm(page, brandApp) {
  await page.selectOption('#f-month', brandApp.month);
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
  // Upload a dummy brief file
  await page.setInputFiles('#f-brief-file', {
    name: 'brief.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('dummy file content'),
  });
}

test.describe('Brand application form', () => {
  let capturedApplication = null;

  test.beforeEach(async ({ page }) => {
    capturedApplication = null;
    await mockApi(page, {
      getAllData: baseAllData([]),
      validateBrandLogin: BRAND_LOGIN_MOCK,
      uploadBrief: { success: true, fileUrl: 'https://drive.google.com/mock-brief-url' },
      addBrandApplication: (params) => {
        capturedApplication = JSON.parse(params.get('data'));
        return { success: true };
      },
    });
    await page.goto('/');
    await loginAsBrand(page);
    await page.getByText('+ Apply for Livestream Slots').click();
    await page.waitForSelector('#brand-app-form');
  });

  test('Successfully submits brand application with correct data', async ({ page }) => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthVal = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

    await fillBrandForm(page, { month: monthVal });
    await page.getByText('Submit Application').click();
    await page.waitForTimeout(1000);

    expect(capturedApplication).not.toBeNull();
    expect(capturedApplication.shopId).toBe('shop001');
    expect(capturedApplication.month).toBe(monthVal);
    expect(capturedApplication.streamCount).toBe(2);
    expect(capturedApplication.sellerType).toBe('Electronics');
    expect(capturedApplication.amsCommission).toBe(10);
    expect(capturedApplication.status).toBe('pending');
    expect(capturedApplication.livestreamBrief).toBe('https://drive.google.com/mock-brief-url');
  });

  test('Blocks submit when category not selected', async ({ page }) => {
    // Skip sellerType — leave it blank
    await page.fill('#f-stream-count', '2');
    await page.check('#f-prod-nom');
    await page.fill('#f-num-products', '5');
    await page.fill('#f-ams', '10');
    await page.check('#f-bundle-deals');
    await page.check('#f-creator-assignment');
    await page.fill('#f-pic-name', 'Alice');
    await page.fill('#f-pic-mobile', '91234567');
    await page.fill('#f-pic-email', 'alice@test.com');
    await page.getByText('Submit Application').click();

    await expect(page.getByText('Please select a category')).toBeVisible();
    expect(capturedApplication).toBeNull();
  });

  test('Blocks submit when AMS commission is zero', async ({ page }) => {
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

    await expect(page.getByText('Please enter AMS commission percentage')).toBeVisible();
    expect(capturedApplication).toBeNull();
  });

  test('Blocks submit when no brief file uploaded', async ({ page }) => {
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

    await expect(page.getByText('Please upload a Livestream Brief')).toBeVisible();
    expect(capturedApplication).toBeNull();
  });

  test('Does not submit preferredDate when package activation unchecked before submit', async ({ page }) => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthVal = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    const dateVal = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-15`;

    await fillBrandForm(page, { month: monthVal });

    // Check package activation and fill a date
    await page.check('#f-package-activation');
    await page.fill('#f-preferred-date', dateVal);

    // Then uncheck — preferredDate should be ignored on submit
    await page.uncheck('#f-package-activation');

    await page.getByText('Submit Application').click();
    await page.waitForTimeout(1000);

    expect(capturedApplication).not.toBeNull();
    expect(capturedApplication.preferredDate).toBeFalsy();
    expect(capturedApplication.hasPackageActivation).toBe(false);
  });

  test('Error notification is replaced after a successful resubmission', async ({ page }) => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthVal = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

    await fillBrandForm(page, { month: monthVal });

    // Overwrite AMS to 0 to trigger a validation error
    await page.fill('#f-ams', '0');
    await page.getByText('Submit Application').click();

    // Error notification should be visible
    await expect(page.locator('.notification.error')).toBeVisible();
    expect(capturedApplication).toBeNull();

    // Fix AMS and resubmit
    await page.fill('#f-ams', '10');
    await page.getByText('Submit Application').click();
    await page.waitForTimeout(1000);

    // The error notification must no longer be shown
    await expect(page.locator('.notification.error')).not.toBeVisible();
    expect(capturedApplication).not.toBeNull();
  });
});
