const { test, expect } = require('@playwright/test');
const { mockApi, baseAllData, loginAsCreator, BRAND_APP, CA_ROW_1 } = require('./helpers');

const CREATOR_LOGIN_MOCK = {
  success: true,
  exists: true,
  affiliate: { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567', shippingAddress: '123 Test St, Singapore 123456' },
};

// Brand month e.g. "2026-04" — dates must fall within it
const BRAND_MONTH = BRAND_APP.month; // "YYYY-MM"
const slot1Start = `${BRAND_MONTH}-05T14:00`;
const slot1End   = `${BRAND_MONTH}-05T16:00`;
const slot2Start = `${BRAND_MONTH}-12T14:00`;
const slot2End   = `${BRAND_MONTH}-12T16:00`;

// A date in the month AFTER the brand's month (future wrong-month — avoids the "tomorrow or later" check)
const [y, m] = BRAND_MONTH.split('-').map(Number);
const nextYear = m === 12 ? y + 1 : y;
const nextMonth = m === 12 ? 1 : m + 1;
const wrongMonthSlot = `${nextYear}-${String(nextMonth).padStart(2, '0')}-15T14:00`;

// Helper: navigate to the creator apply form for BRAND_APP
async function openApplyForm(page) {
  // Brand should appear in "Available Brands" tab (default)
  await page.getByText('Apply for This Brand').click();
  await page.waitForSelector('#creator-app-form');
}

// Helper: fill creator contact details
async function fillCreatorDetails(page) {
  await page.fill('#f-telegram', 'testcreator');
  await page.fill('#f-address', '123 Test St, Singapore 123456');
}

// Helper: add one timeslot via the form
// start/end format: 'YYYY-MM-DDTHH:MM'
async function addTimeslot(page, start, end) {
  const [sDate, sTime] = start.split('T');
  const [sHour, sMin] = sTime.split(':');
  const [eDate, eTime] = end.split('T');
  const [eHour, eMin] = eTime.split(':');
  await page.fill('#f-start-date', sDate);
  await page.selectOption('#f-start-hour', sHour);
  await page.selectOption('#f-start-min', sMin);
  await page.fill('#f-end-date', eDate);
  await page.selectOption('#f-end-hour', eHour);
  await page.selectOption('#f-end-min', eMin);
  await page.getByRole('button', { name: '+ Add Timeslot' }).click();
}

// ─── Notification helper ─────────────────────────────────────────────────────
async function getNotification(page) {
  const notif = page.locator('.notification');
  await notif.waitFor({ state: 'visible', timeout: 3000 });
  return notif.textContent();
}

test.describe('Creator application — multiple timeslots', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([]),
      validateCreatorLogin: CREATOR_LOGIN_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
  });

  test('Successfully submits application with 2 timeslots', async ({ page }) => {
    let capturedData = null;
    await page.route('**/macros/**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      if (action === 'addCreatorApplication') {
        capturedData = JSON.parse(url.searchParams.get('data'));
        await route.fulfill({ json: { success: true, groupId: capturedData.id, count: 2 } });
      } else if (action === 'getAllData') {
        await route.fulfill({ json: baseAllData([]) });
      } else {
        await route.fulfill({ json: { success: true } });
      }
    });

    await openApplyForm(page);
    await addTimeslot(page, slot1Start, slot1End);
    await addTimeslot(page, slot2Start, slot2End);
    await fillCreatorDetails(page);
    await page.getByText('Submit Application').click();
    await page.waitForTimeout(1000);

    expect(capturedData).not.toBeNull();
    expect(capturedData.timeslots).toHaveLength(2);
    expect(capturedData.timeslots[0].date).toBe(`${BRAND_MONTH}-05`);
    expect(capturedData.timeslots[0].startTime).toBe('14:00');
    expect(capturedData.timeslots[1].date).toBe(`${BRAND_MONTH}-12`);
    expect(capturedData.brandApplicationId).toBe(BRAND_APP.id);
    expect(capturedData.status).toBe('pending');
  });

  test('Shows added timeslots in the selected list', async ({ page }) => {
    await openApplyForm(page);
    await addTimeslot(page, slot1Start, slot1End);

    await expect(page.getByText('Selected Timeslots (1)')).toBeVisible();

    await addTimeslot(page, slot2Start, slot2End);
    await expect(page.getByText('Selected Timeslots (2)')).toBeVisible();
  });

  test('Blocks submit with fewer than 2 timeslots', async ({ page }) => {
    await openApplyForm(page);
    await addTimeslot(page, slot1Start, slot1End);
    await fillCreatorDetails(page);
    await page.getByText('Submit Application').click();

    await expect(page.locator('.notification')).toContainText(/at least 2 timeslots/);
  });

  test('Blocks submit when required contact fields are empty', async ({ page }) => {
    await openApplyForm(page);
    await addTimeslot(page, slot1Start, slot1End);
    await addTimeslot(page, slot2Start, slot2End);
    // No telegram or address filled
    await page.getByText('Submit Application').click();

    await expect(page.getByText('Please fill in all required fields')).toBeVisible();
  });
});

test.describe('Creator timeslot validation', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([]),
      validateCreatorLogin: CREATOR_LOGIN_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await openApplyForm(page);
  });

  test('Rejects stream shorter than 1.5 hours', async ({ page }) => {
    // Only 1 hour duration
    await addTimeslot(page, `${BRAND_MONTH}-05T14:00`, `${BRAND_MONTH}-05T15:00`);
    await expect(page.locator('.notification')).toContainText(/at least 2 hours/);
    await expect(page.getByText('Selected Timeslots')).not.toBeVisible();
  });

  test('Rejects end time before start time', async ({ page }) => {
    await addTimeslot(page, `${BRAND_MONTH}-05T16:00`, `${BRAND_MONTH}-05T14:00`);
    await expect(page.getByText(/end must be after start/)).toBeVisible();
  });

  test('Rejects date outside brand month', async ({ page }) => {
    // Use evaluate to bypass the min/max HTML constraint on the date input
    await page.evaluate((dateVal) => {
      document.getElementById('f-start-date').value = dateVal;
      document.getElementById('f-end-date').value = dateVal;
    }, wrongMonthSlot.split('T')[0]);
    await page.selectOption('#f-start-hour', '14');
    await page.selectOption('#f-start-min', '00');
    await page.selectOption('#f-end-hour', '16');
    await page.selectOption('#f-end-min', '00');
    await page.getByRole('button', { name: '+ Add Timeslot' }).click();

    await expect(page.getByText(/Stream must start within/)).toBeVisible();
  });

  // Helper: set up state with another creator's slot at a given status, then open apply form
  async function setupOtherCreatorSlot(page, status) {
    await mockApi(page, {
      getAllData: baseAllData([{
        ...CA_ROW_1,
        id: 'taken001',
        groupId: 'grptaken',
        creatorId: 'other_creator',
        streamDate: `${BRAND_MONTH}-05`,
        streamTime: '13:00',
        streamEndDate: `${BRAND_MONTH}-05`,
        streamEndTime: '15:30',
        status,
        sampleSentAt: '',
      }]),
      validateCreatorLogin: CREATOR_LOGIN_MOCK,
    });
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/');
    await loginAsCreator(page);
    await openApplyForm(page);
  }

  // Helper: set up state with creator's own slot at another brand at a given status, then open apply form
  async function setupOwnSlotAtOtherBrand(page, status) {
    const BRAND_APP_2 = { ...require('./helpers').BRAND_APP, id: 'bapp002', shopId: 'shop002', shopName: 'Other Shop', brandId: 'shop002' };
    await mockApi(page, {
      getAllData: {
        ...baseAllData([{
          ...CA_ROW_1,
          id: 'myslot001',
          groupId: 'grpmyslot',
          creatorId: 'creator001',
          brandApplicationId: 'bapp002',
          streamDate: `${BRAND_MONTH}-05`,
          streamTime: '13:00',
          streamEndDate: `${BRAND_MONTH}-05`,
          streamEndTime: '15:30',
          status,
          sampleSentAt: '',
        }]),
        brandApplications: [require('./helpers').BRAND_APP, BRAND_APP_2],
      },
      validateCreatorLogin: CREATOR_LOGIN_MOCK,
    });
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/');
    await loginAsCreator(page);
    // Use first() — when status is rejected/cancelled both brands are available so two buttons appear
    await page.getByText('Apply for This Brand').first().click();
    await page.waitForSelector('#creator-app-form');
  }

  // ── Check #7: another creator blocks same-brand slot ────────────────────────

  for (const status of ['confirmed', 'approved', 'pending']) {
    test(`Rejects timeslot overlapping another creator's ${status} slot (same brand)`, async ({ page }) => {
      await setupOtherCreatorSlot(page, status);
      await addTimeslot(page, `${BRAND_MONTH}-05T14:00`, `${BRAND_MONTH}-05T16:00`);
      await expect(page.getByText(/overlaps with an existing booking for this brand/)).toBeVisible();
    });
  }

  for (const status of ['rejected', 'cancelled']) {
    test(`Allows timeslot when another creator's slot is ${status} (same brand)`, async ({ page }) => {
      await setupOtherCreatorSlot(page, status);
      await addTimeslot(page, `${BRAND_MONTH}-05T14:00`, `${BRAND_MONTH}-05T16:00`);
      await expect(page.getByText('Selected Timeslots (1)')).toBeVisible();
    });
  }

  // ── Check #8: own slot at another brand blocks double-booking ───────────────

  for (const status of ['confirmed', 'approved', 'pending']) {
    test(`Rejects timeslot overlapping own ${status} slot at another brand`, async ({ page }) => {
      await setupOwnSlotAtOtherBrand(page, status);
      await addTimeslot(page, `${BRAND_MONTH}-05T14:00`, `${BRAND_MONTH}-05T16:00`);
      await expect(page.getByText(/overlaps with your existing stream/)).toBeVisible();
    });
  }

  for (const status of ['rejected', 'cancelled']) {
    test(`Allows timeslot when own slot at another brand is ${status}`, async ({ page }) => {
      await setupOwnSlotAtOtherBrand(page, status);
      await addTimeslot(page, `${BRAND_MONTH}-05T14:00`, `${BRAND_MONTH}-05T16:00`);
      await expect(page.getByText('Selected Timeslots (1)')).toBeVisible();
    });
  }

  test('Rejects duplicate timeslot in same form submission', async ({ page }) => {
    // Add first timeslot
    await addTimeslot(page, slot1Start, slot1End);
    await expect(page.getByText('Selected Timeslots (1)')).toBeVisible();

    // Try to add same slot again
    await addTimeslot(page, slot1Start, slot1End);
    await expect(page.getByText(/already in your list/)).toBeVisible();
    // Should still be only 1 timeslot
    await expect(page.getByText('Selected Timeslots (1)')).toBeVisible();
  });

  test('Hides brand from available list when fully booked', async ({ page }) => {
    // BRAND_APP has streamCount: 2. Fill all 2 slots with other creator rows.
    const takenRows = [1, 2].map((i) => ({
      ...CA_ROW_1,
      id: `taken00${i}`,
      groupId: `grptaken${i}`,
      creatorId: 'other_creator',
      streamDate: `${BRAND_MONTH}-0${i + 4}`,
      streamTime: '14:00',
      streamEndDate: `${BRAND_MONTH}-0${i + 4}`,
      streamEndTime: '16:00',
      status: 'confirmed',
      sampleSentAt: '',
    }));
    await mockApi(page, {
      getAllData: baseAllData(takenRows),
      validateCreatorLogin: CREATOR_LOGIN_MOCK,
    });
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/');
    await loginAsCreator(page);

    // Brand is fully booked — should not appear in available brands
    await expect(page.getByText('Apply for This Brand')).not.toBeVisible();
  });
});
