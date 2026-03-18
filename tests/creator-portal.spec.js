const { test, expect } = require('@playwright/test');
const { mockApi, baseAllData, loginAsCreator, CA_ROW_APPROVED_1, CA_ROW_APPROVED_2 } = require('./helpers');

const CREATOR_MOCK = { success: true, exists: true, affiliate: { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567' } };

test.describe('Creator portal — timeslot-level display', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_APPROVED_1, CA_ROW_APPROVED_2]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
  });

  test('Pending confirmation tab counts individual timeslot rows not groups', async ({ page }) => {
    // 2 rows with status=approved → should show (2) not (1)
    await expect(page.getByText('Pending My Confirmation (2)')).toBeVisible();
  });

  test('Pending confirmation shows one card per timeslot row', async ({ page }) => {
    await page.getByText('Pending My Confirmation (2)').click();
    const cards = page.locator('.app-card.creator-app');
    await expect(cards).toHaveCount(2);
  });

  test('Each pending confirmation card shows exactly one timeslot date badge', async ({ page }) => {
    await page.getByText('Pending My Confirmation (2)').click();
    const firstCard = page.locator('.app-card.creator-app').first();
    const dateBadges = firstCard.locator('span').filter({ hasText: '📅' });
    await expect(dateBadges).toHaveCount(1);
  });

  test('Confirm slot calls updateCreatorApplication with individual row id', async ({ page }) => {
    let capturedId = null;
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_APPROVED_1, CA_ROW_APPROVED_2]),
      validateCreatorLogin: CREATOR_MOCK,
      updateCreatorApplication: (params) => {
        capturedId = params.get('id');
        return { success: true };
      },
    });
    await page.goto('/');
    await loginAsCreator(page);
    await page.getByText('Pending My Confirmation (2)').click();
    await page.getByText('Confirm Slot').first().click();
    await page.waitForTimeout(500);
    expect(capturedId).toBe(CA_ROW_APPROVED_1.id);
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
