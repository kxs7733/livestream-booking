const { test, expect } = require('@playwright/test');
const {
  mockApi, baseAllData, loginAsCreator,
  CA_ROW_1, CA_ROW_SENT, CA_ROW_RECEIVED,
} = require('./helpers');

const CREATOR_MOCK = {
  success: true,
  exists: true,
  affiliate: { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567' },
};

// Helper: set up and navigate to the Confirmed Livestreams tab
async function goToConfirmedTab(page) {
  await page.getByText(/Confirmed Livestreams/).click();
}

test.describe('Creator portal — Confirmed Livestreams tab', () => {
  test('Tab shows correct count of confirmed rows', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_1, CA_ROW_SENT, CA_ROW_RECEIVED]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    // CA_ROW_1, CA_ROW_SENT, CA_ROW_RECEIVED all have creatorId=creator001 and status=confirmed
    await expect(page.getByText(/Confirmed Livestreams \(3\)/)).toBeVisible();
  });

  test('Tab shows orange badge when samples dispatched but not confirmed', async ({ page }) => {
    // CA_ROW_SENT has sampleSentAt but no sampleReceivedAt → pendingReceiptCount=1
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_1, CA_ROW_SENT]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await expect(page.locator('text=⚠️ 1')).toBeVisible();
  });

  test('No badge when no pending receipts', async ({ page }) => {
    // CA_ROW_1 has no sampleSentAt, CA_ROW_RECEIVED has sampleReceivedAt — neither is "dispatched+pending"
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_1, CA_ROW_RECEIVED]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await expect(page.locator('text=⚠️')).not.toBeVisible();
  });

  test('"Samples Dispatched" section appears when sampleSentAt set without receipt', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_SENT]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText('Samples Dispatched — Please Confirm Receipt')).toBeVisible();
  });

  test('"Samples Dispatched" section shows warning callout with correct count', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_SENT]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText(/1 slot.* awaiting your confirmation/)).toBeVisible();
  });

  test('"Waiting for Samples" section appears when no sampleSentAt', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_1]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText('Waiting for Samples', { exact: true })).toBeVisible();
  });

  test('"Sample Received ✓" section appears when sampleReceivedAt set', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_RECEIVED]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText('Sample Received ✓')).toBeVisible();
  });

  test('All three sections appear together with appropriate rows', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_1, CA_ROW_SENT, CA_ROW_RECEIVED]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText('Samples Dispatched — Please Confirm Receipt')).toBeVisible();
    await expect(page.getByText('Waiting for Samples', { exact: true })).toBeVisible();
    await expect(page.getByText('Sample Received ✓')).toBeVisible();
  });

  test('"I\'ve Received the Samples" button visible in dispatched section', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_SENT]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText("✅ I've Received the Samples")).toBeVisible();
  });

  test('"I\'ve Received the Samples" button calls updateCreatorApplication with sampleReceivedAt', async ({ page }) => {
    let capturedParams = null;
    await mockApi(page, {
      validateCreatorLogin: CREATOR_MOCK,
      getAllData: baseAllData([CA_ROW_SENT]),
      updateCreatorApplication: (params) => {
        capturedParams = {
          id: params.get('id'),
          data: JSON.parse(params.get('data')),
        };
        return { success: true };
      },
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await page.getByText("✅ I've Received the Samples").click();
    await page.waitForTimeout(500);
    expect(capturedParams).not.toBeNull();
    expect(capturedParams.id).toBe(CA_ROW_SENT.id);
    expect(capturedParams.data.sampleReceivedAt).toBeTruthy();
  });

  test('"Undo" button visible in received section', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_ROW_RECEIVED]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText('↩ Undo')).toBeVisible();
  });

  test('"Undo" calls updateCreatorApplication with empty sampleReceivedAt', async ({ page }) => {
    let capturedParams = null;
    await mockApi(page, {
      validateCreatorLogin: CREATOR_MOCK,
      getAllData: baseAllData([CA_ROW_RECEIVED]),
      updateCreatorApplication: (params) => {
        capturedParams = {
          id: params.get('id'),
          data: JSON.parse(params.get('data')),
        };
        return { success: true };
      },
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await page.getByText('↩ Undo').click();
    await page.waitForTimeout(500);
    expect(capturedParams).not.toBeNull();
    expect(capturedParams.id).toBe(CA_ROW_RECEIVED.id);
    expect(capturedParams.data.sampleReceivedAt).toBe('');
  });

  test('Empty state shown when no confirmed rows', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    // No confirmed slots → empty state or tab count 0
    await expect(page.getByText(/Confirmed Livestreams \(0\)/)).toBeVisible();
  });

  test('Duplicate receipt confirmation shows error notification', async ({ page }) => {
    // Backend returns error for duplicate confirmation
    await mockApi(page, {
      validateCreatorLogin: CREATOR_MOCK,
      getAllData: baseAllData([CA_ROW_SENT]),
      updateCreatorApplication: () => ({ success: false, error: 'Samples already marked as received.' }),
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await page.getByText("✅ I've Received the Samples").click();
    await expect(page.locator('.notification.error')).toBeVisible();
  });
});
