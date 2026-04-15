const { test, expect } = require('@playwright/test');
const { mockApi, baseAllData, loginAsBrand, CA_ROW_1, CA_ROW_2, CA_ROW_3 } = require('./helpers');

test.describe('Brand portal — sample tracking', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_1, CA_ROW_2, CA_ROW_3]),
      validateBrandLogin: { success: true, exists: true, seller: { id: 'shop001', name: 'Test Shop', createdAt: '2026-01-01T00:00:00Z', siteAddress: '1 Test Road Singapore 123456' } },
    });
    await page.goto('/');
    await loginAsBrand(page);
  });

  test('Confirmed Livestreams tab shows pending badge with correct count', async ({ page }) => {
    // 2 rows have no sampleSentAt (CA_ROW_1, CA_ROW_2), 1 is sent (CA_ROW_3)
    await expect(page.getByText('⚠️ 2 pending action')).toBeVisible();
  });

  test('Clicking Confirmed Livestreams tab shows alert banner', async ({ page }) => {
    await page.getByText(/Confirmed Livestreams/).click();
    await expect(page.getByText(/2 confirmed streams awaiting sample dispatch/)).toBeVisible();
  });

  test('ACTION REQUIRED section shows unsent timeslots', async ({ page }) => {
    await page.getByText(/Confirmed Livestreams/).click();
    await expect(page.getByText('Action Required')).toBeVisible();
    // Both unsent rows should be present
    const markBtns = page.getByText('📦 Mark Sample as Sent');
    await expect(markBtns).toHaveCount(2);
  });

  test('SAMPLE SENT section shows sent timeslot', async ({ page }) => {
    await page.getByText(/Confirmed Livestreams/).click();
    await expect(page.getByText('Sample Sent', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('✓ Sample Sent')).toBeVisible();
  });

  test('Marking sample as sent calls updateCreatorApplication with sampleSentAt', async ({ page }) => {
    let capturedParams = null;
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      if (action === 'updateCreatorApplication') {
        capturedParams = { id: url.searchParams.get('id'), data: JSON.parse(url.searchParams.get('data')) };
        await route.fulfill({ json: { success: true } });
      } else if (action === 'getAllData') {
        // Return updated state with sampleSentAt set on ca001
        const updated = { ...CA_ROW_1, sampleSentAt: new Date().toISOString() };
        await route.fulfill({ json: baseAllData([updated, CA_ROW_2, CA_ROW_3]) });
      } else {
        await route.fulfill({ json: { success: true } });
      }
    });

    await page.getByText(/Confirmed Livestreams/).click();
    await page.getByText('📦 Mark Sample as Sent').first().click();

    // Wait for reload
    await page.waitForTimeout(500);

    expect(capturedParams).not.toBeNull();
    expect(capturedParams.id).toBe('ca001');
    expect(capturedParams.data.sampleSentAt).toBeTruthy();
  });

  test('No alert banner or pending badge when all samples sent', async ({ page }) => {
    // Override to have all rows with sampleSentAt set
    await mockApi(page, {
      getAllData: baseAllData([
        { ...CA_ROW_1, sampleSentAt: '2026-03-10T00:00:00Z' },
        { ...CA_ROW_2, sampleSentAt: '2026-03-10T00:00:00Z' },
        CA_ROW_3,
      ]),
      validateBrandLogin: { success: true, exists: true, seller: { id: 'shop001', name: 'Test Shop', createdAt: '2026-01-01T00:00:00Z', siteAddress: '1 Test Road Singapore 123456' } },
    });
    await page.goto('/');
    await loginAsBrand(page);

    await expect(page.getByText('🟠')).not.toBeVisible();
    await page.getByText(/Confirmed Livestreams/).click();
    await expect(page.getByText(/awaiting sample dispatch/)).not.toBeVisible();
    await expect(page.getByText('Action Required')).not.toBeVisible();
  });
});
