const { test, expect } = require('@playwright/test');
const { mockApi, baseAllData, loginAsCreator, CA_ROW_APPROVED_1, CA_ROW_APPROVED_2 } = require('./helpers');

const CREATOR_MOCK = { success: true, exists: true, affiliate: { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567', shippingAddress: '123 Test St, Singapore 123456' } };

test.describe('Creator portal — timeslot-level display', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_APPROVED_1, CA_ROW_APPROVED_2]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
  });

  test('My Applications tab counts individual timeslot rows not groups', async ({ page }) => {
    // 2 approved rows → My Applications (2) not (1)
    await expect(page.getByText('My Applications (2)')).toBeVisible();
  });

  test('My Applications shows one card per timeslot row', async ({ page }) => {
    await page.getByText('My Applications (2)').click();
    const cards = page.locator('.app-card');
    await expect(cards).toHaveCount(2);
  });
});
