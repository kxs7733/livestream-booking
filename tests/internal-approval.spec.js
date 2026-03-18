const { test, expect } = require('@playwright/test');
const {
  mockApi, baseAllData, loginAsInternal,
  BRAND_APP, CA_ROW_1, CA_ROW_2, CA_ROW_APPROVED_1,
} = require('./helpers');

const INTERNAL_MOCK = {
  success: true,
  member: { id: 'int001', name: 'Internal User', email: 'internal@test.com' },
};

const BRAND_APP_PENDING = { ...BRAND_APP, id: 'bapp_pend', status: 'pending' };

// ─── Brand application approval / rejection ────────────────────────────────

test.describe('Internal — brand application approval flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: { ...baseAllData([]), brandApplications: [BRAND_APP_PENDING] },
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Brand Applications Pending Approval' }).click();
  });

  test('Pending brand app appears in brand-apps tab', async ({ page }) => {
    await expect(page.getByText('🏪 Test Shop')).toBeVisible();
  });

  test('Brand-apps stat card shows correct pending count', async ({ page }) => {
    const statCard = page.locator('.stat-card').filter({ hasText: 'Brand Applications Pending Approval' });
    await expect(statCard.locator('.stat-value')).toHaveText('1');
  });

  test('Approve button calls updateBrandApplication with status=approved', async ({ page }) => {
    let captured = null;
    // Add a new route handler on top — Playwright LIFO means this runs first
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      if (action === 'updateBrandApplication') {
        captured = { id: url.searchParams.get('id'), data: JSON.parse(url.searchParams.get('data')) };
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.btn-approve').first().click();
    await page.waitForTimeout(500);
    expect(captured).not.toBeNull();
    expect(captured.id).toBe(BRAND_APP_PENDING.id);
    expect(captured.data.status).toBe('approved');
  });

  test('Reject button calls updateBrandApplication with status=rejected', async ({ page }) => {
    let captured = null;
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      if (action === 'updateBrandApplication') {
        captured = { id: url.searchParams.get('id'), data: JSON.parse(url.searchParams.get('data')) };
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.btn-reject').first().click();
    await page.waitForTimeout(500);
    expect(captured).not.toBeNull();
    expect(captured.id).toBe(BRAND_APP_PENDING.id);
    expect(captured.data.status).toBe('rejected');
  });

  test('Approve shows success notification', async ({ page }) => {
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      if (action === 'updateBrandApplication') {
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.btn-approve').first().click();
    await expect(page.locator('.notification')).toBeVisible();
  });

  test('Status filter pills show correct counts', async ({ page }) => {
    // Pending (1), Approved (0), Rejected (0), All (1) should be visible
    await expect(page.getByText(/Pending \(1\)/)).toBeVisible();
    await expect(page.getByText(/Approved \(0\)/)).toBeVisible();
  });

  test('No brand apps shows empty state message', async ({ page }) => {
    await mockApi(page, {
      getAllData: { ...baseAllData([]), brandApplications: [] },
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Brand Applications Pending Approval' }).click();
    await expect(page.getByText('No brand applications yet')).toBeVisible();
  });
});

// ─── Creator application approval / rejection ──────────────────────────────

test.describe('Internal — creator application approval flow', () => {
  const PENDING_ROW = { ...CA_ROW_1, id: 'ca_pend', status: 'pending' };

  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([PENDING_ROW]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Creator Applications Pending Approval' }).click();
  });

  test('Pending creator app shows in creator-apps tab', async ({ page }) => {
    await expect(page.locator('.app-card.creator-app')).toHaveCount(1);
  });

  test('Approve button calls updateCreatorApplication with status=approved', async ({ page }) => {
    let captured = null;
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      if (action === 'updateCreatorApplication') {
        captured = { id: url.searchParams.get('id'), data: JSON.parse(url.searchParams.get('data')) };
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.btn-approve').first().click();
    await page.waitForTimeout(500);
    expect(captured).not.toBeNull();
    expect(captured.id).toBe(PENDING_ROW.id);
    expect(captured.data.status).toBe('approved');
  });

  test('Reject button calls updateCreatorApplication with status=rejected', async ({ page }) => {
    let captured = null;
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      if (action === 'updateCreatorApplication') {
        captured = { id: url.searchParams.get('id'), data: JSON.parse(url.searchParams.get('data')) };
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.btn-reject').first().click();
    await page.waitForTimeout(500);
    expect(captured).not.toBeNull();
    expect(captured.id).toBe(PENDING_ROW.id);
    expect(captured.data.status).toBe('rejected');
  });

  test('Approve shows success notification', async ({ page }) => {
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      if (action === 'updateCreatorApplication') {
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.btn-approve').first().click();
    await expect(page.locator('.notification')).toBeVisible();
  });

  test('Reject shows success notification', async ({ page }) => {
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      if (action === 'updateCreatorApplication') {
        await route.fulfill({ json: { success: true } });
      } else {
        await route.fallback();
      }
    });
    await page.locator('.btn-reject').first().click();
    await expect(page.locator('.notification')).toBeVisible();
  });
});

// ─── Internal confirmed slots — sample badge display ──────────────────────

test.describe('Internal — confirmed slots sample badges', () => {
  test('Sample not yet sent shows grey badge', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_1]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Confirmed Slots' }).click();
    await expect(page.getByText('⏳ Sample Not Yet Sent')).toBeVisible();
  });

  test('Sample sent shows amber badge', async ({ page }) => {
    const sentRow = { ...CA_ROW_1, sampleSentAt: '2026-03-10T10:00:00Z' };
    await mockApi(page, {
      getAllData: baseAllData([sentRow]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Confirmed Slots' }).click();
    await expect(page.getByText(/📦 Sample Sent/)).toBeVisible();
  });

  test('Sample received shows blue badge', async ({ page }) => {
    const receivedRow = {
      ...CA_ROW_1,
      sampleSentAt: '2026-03-10T10:00:00Z',
      sampleReceivedAt: '2026-03-12T10:00:00Z',
    };
    await mockApi(page, {
      getAllData: baseAllData([receivedRow]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Confirmed Slots' }).click();
    await expect(page.getByText(/📬 Sample Received/)).toBeVisible();
  });

  test('Confirmed slots count shown correctly', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_1, CA_ROW_2]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Confirmed Slots' }).click();
    await expect(page.getByText('2 slots found')).toBeVisible();
  });
});

// ─── Pending confirmations tab ─────────────────────────────────────────────

test.describe('Internal — pending confirmations tab', () => {
  test('Shows correct count in stat card after creator app approved', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_APPROVED_1]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    const statCard = page.locator('.stat-card').filter({ hasText: 'Pending Creator Confirmation' });
    await expect(statCard.locator('.stat-value')).toHaveText('1');
  });

  test('Pending confirmations tab shows approved row card', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_APPROVED_1]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Pending Creator Confirmation' }).click();
    await expect(page.locator('.app-card.creator-app')).toHaveCount(1);
  });
});
