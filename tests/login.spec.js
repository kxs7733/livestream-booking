const { test, expect } = require('@playwright/test');
const { mockApi, baseAllData } = require('./helpers');

// ─── Shared setup ─────────────────────────────────────────────────────────────

async function goHome(page) {
  await page.goto('/');
}

// ─── Brand login ──────────────────────────────────────────────────────────────

test.describe('Brand login', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([]),
      validateBrandLogin: (params) => {
        if (params.get('shopId') === 'shop001' && params.get('shopName') === 'Test Shop') {
          return { success: true, exists: true, seller: { id: 'shop001', name: 'Test Shop', createdAt: '2026-01-01T00:00:00Z', siteAddress: '1 Test Road Singapore 123456' } };
        }
        return { success: false, error: 'Shop not found. Please check your credentials.' };
      },
    });
    await goHome(page);
    await page.getByText("I'm a Brand").click();
  });

  test('Successful login lands on brand dashboard', async ({ page }) => {
    await page.fill('#login-shop-id', 'shop001');
    await page.fill('#login-shop-name', 'Test Shop');
    await page.click('#login-btn');

    await expect(page.locator('.dashboard-title')).toBeVisible();
  });

  test('Wrong shop ID shows error notification', async ({ page }) => {
    await page.fill('#login-shop-id', 'wrong123');
    await page.fill('#login-shop-name', 'Test Shop');
    await page.click('#login-btn');

    await expect(page.locator('.notification.error')).toContainText('Shop not found');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Wrong shop name shows error notification', async ({ page }) => {
    await page.fill('#login-shop-id', 'shop001');
    await page.fill('#login-shop-name', 'Wrong Name');
    await page.click('#login-btn');

    await expect(page.locator('.notification.error')).toContainText('Shop not found');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Empty shop ID shows validation error', async ({ page }) => {
    await page.fill('#login-shop-name', 'Test Shop');
    // Leave shop ID empty
    await page.click('#login-btn');

    await expect(page.locator('.notification.error')).toContainText('Please enter both');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Empty shop name shows validation error', async ({ page }) => {
    await page.fill('#login-shop-id', 'shop001');
    // Leave shop name empty
    await page.click('#login-btn');

    await expect(page.locator('.notification.error')).toContainText('Please enter both');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Both fields empty shows validation error', async ({ page }) => {
    await page.click('#login-btn');

    await expect(page.locator('.notification.error')).toContainText('Please enter both');
  });
});

// ─── Creator login ────────────────────────────────────────────────────────────

test.describe('Creator login', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([]),
      validateCreatorLogin: (params) => {
        // Phone is sent with country code prepended (formatPhoneForStorage): '65' + '91234567' = '6591234567'
        if (params.get('affiliateUsername') === 'TestCreator' && params.get('phone') === '6591234567') {
          return { success: true, exists: true, affiliate: { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567', shippingAddress: '123 Test St, Singapore 123456' } };
        }
        return { success: false, error: 'Creator not found. Please check your credentials.' };
      },
    });
    await goHome(page);
    await page.getByText("I'm a Creator").click();
  });

  test('Successful login lands on creator dashboard', async ({ page }) => {
    await page.fill('#login-name', 'TestCreator');
    await page.fill('#login-phone', '91234567');
    await page.click('#login-btn');

    await expect(page.locator('.dashboard-title')).toBeVisible();
  });

  test('Wrong username shows error notification', async ({ page }) => {
    await page.fill('#login-name', 'NoSuchCreator');
    await page.fill('#login-phone', '91234567');
    await page.click('#login-btn');

    await expect(page.locator('.notification.error')).toContainText('Creator not found');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Wrong phone number shows error notification', async ({ page }) => {
    await page.fill('#login-name', 'TestCreator');
    await page.fill('#login-phone', '99999999');
    await page.click('#login-btn');

    await expect(page.locator('.notification.error')).toContainText('Creator not found');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Empty username shows validation error', async ({ page }) => {
    await page.fill('#login-phone', '91234567');
    await page.click('#login-btn');

    await expect(page.locator('.notification.error')).toContainText('Please enter both');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Empty phone shows error and blocks login', async ({ page }) => {
    await page.fill('#login-name', 'TestCreator');
    // Leave phone empty — country code '65' is still prepended, so API returns "not found"
    await page.click('#login-btn');

    await expect(page.locator('.notification.error')).toBeVisible();
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Both fields empty shows validation error', async ({ page }) => {
    await page.click('#login-btn');

    await expect(page.locator('.notification.error')).toContainText('Please enter both');
  });
});

// ─── Internal login ───────────────────────────────────────────────────────────

test.describe('Internal team login', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([]),
      validateInternalLogin: (params) => {
        if (params.get('password') === 'correctpass' && params.get('email') === 'internal@test.com') {
          return { success: true, member: { id: 'int001', name: 'Internal User', email: 'internal@test.com' } };
        }
        return { success: false, error: 'Invalid password or email.' };
      },
    });
    await goHome(page);
    await page.getByText('Internal Team Dashboard →').click();
  });

  test('Successful login lands on internal dashboard', async ({ page }) => {
    await page.fill('#internal-email', 'internal@test.com');
    await page.fill('#internal-password', 'correctpass');
    await page.click('#internal-login-btn');

    await expect(page.locator('.dashboard-title')).toBeVisible();
  });

  test('Wrong password shows error notification', async ({ page }) => {
    await page.fill('#internal-email', 'internal@test.com');
    await page.fill('#internal-password', 'wrongpass');
    await page.click('#internal-login-btn');

    await expect(page.locator('.notification.error')).toContainText('Invalid password or email');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Wrong email shows error notification', async ({ page }) => {
    await page.fill('#internal-email', 'wrong@test.com');
    await page.fill('#internal-password', 'correctpass');
    await page.click('#internal-login-btn');

    await expect(page.locator('.notification.error')).toContainText('Invalid password or email');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Empty password shows validation error', async ({ page }) => {
    await page.fill('#internal-email', 'internal@test.com');
    // Leave password empty
    await page.click('#internal-login-btn');

    await expect(page.locator('.notification.error')).toContainText('Please fill in all fields');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Empty email shows validation error', async ({ page }) => {
    await page.fill('#internal-password', 'correctpass');
    // Leave email empty
    await page.click('#internal-login-btn');

    await expect(page.locator('.notification.error')).toContainText('Please fill in all fields');
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });

  test('Both fields empty shows validation error', async ({ page }) => {
    await page.click('#internal-login-btn');

    await expect(page.locator('.notification.error')).toContainText('Please fill in all fields');
  });

  test('Internal login page shows email and password fields', async ({ page }) => {
    // Verify the login form is rendered (not the dashboard)
    await expect(page.locator('#internal-email')).toBeVisible();
    await expect(page.locator('#internal-password')).toBeVisible();
    await expect(page.locator('#internal-login-btn')).toBeVisible();
    await expect(page.locator('.dashboard-title')).not.toBeVisible();
  });
});
