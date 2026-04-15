const { test, expect } = require('@playwright/test');
const { mockApi, baseAllData, loginAsInternal, CA_ROW_1, CA_ROW_2, CA_ROW_APPROVED_1, CA_ROW_APPROVED_2 } = require('./helpers');

const INTERNAL_MOCK = {
  success: true,
  member: { id: 'int001', name: 'Internal User', email: 'internal@test.com' }
};

test.describe('Internal dashboard — counts and approval', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_APPROVED_1, CA_ROW_APPROVED_2]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
  });

  test('Creator applications stat card counts individual timeslot rows', async ({ page }) => {
    // 2 rows with status=pending → but CA_ROW_APPROVED_1/2 are approved not pending
    // use pending rows for this test
    await mockApi(page, {
      getAllData: baseAllData([
        { ...CA_ROW_APPROVED_1, status: 'pending' },
        { ...CA_ROW_APPROVED_2, status: 'pending' },
      ]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
  });

  test('Confirmed slots stat card counts individual timeslot rows', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_1, CA_ROW_2]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    const statCard = page.locator('.stat-card').filter({ hasText: 'Confirmed Slots' });
    await expect(statCard.locator('.stat-value')).toHaveText('2');
  });

  test('Creator apps view shows one card per timeslot row', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([
        { ...CA_ROW_APPROVED_1, status: 'pending' },
        { ...CA_ROW_APPROVED_2, status: 'pending' },
      ]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Creator Applications Pending Approval' }).click();
    const cards = page.locator('.app-card.creator-app');
    await expect(cards).toHaveCount(2);
  });

  test('Each creator app card shows exactly one timeslot', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([
        { ...CA_ROW_APPROVED_1, status: 'pending' },
        { ...CA_ROW_APPROVED_2, status: 'pending' },
      ]),
      validateInternalLogin: INTERNAL_MOCK,
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Creator Applications Pending Approval' }).click();
    // Each card should have exactly one date badge (not multiple timeslots bundled)
    const firstCard = page.locator('.app-card.creator-app').first();
    const dateBadges = firstCard.locator('span').filter({ hasText: '📅' });
    await expect(dateBadges).toHaveCount(1);
  });

  test('Approve button calls updateCreatorApplication with row id', async ({ page }) => {
    let capturedId = null;
    await mockApi(page, {
      getAllData: baseAllData([
        { ...CA_ROW_APPROVED_1, status: 'pending' },
        { ...CA_ROW_APPROVED_2, status: 'pending' },
      ]),
      validateInternalLogin: INTERNAL_MOCK,
      updateCreatorApplication: (params) => {
        capturedId = params.get('id');
        return { success: true };
      },
    });
    await page.goto('/');
    await loginAsInternal(page);
    await page.locator('.stat-card').filter({ hasText: 'Creator Applications Pending Approval' }).click();
    await page.locator('.btn-approve').first().click();
    await page.waitForTimeout(500);
    expect(capturedId).toBe(CA_ROW_APPROVED_1.id);
  });

  test('Confirmed slots view shows one card per timeslot', async ({ page }) => {
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
