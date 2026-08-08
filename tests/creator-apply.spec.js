const { test, expect } = require('@playwright/test');
const { mockApi, baseAllData, loginAsCreator, BRAND_APP, CA_ROW_1 } = require('./helpers');

const CREATOR_LOGIN_MOCK = {
  success: true,
  exists: true,
  affiliate: { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567', shippingAddress: '123 Test St, Singapore 123456', shippingPostalCode: '123456' },
};

// Brand month e.g. "2026-04" — dates must fall within it
const BRAND_MONTH = BRAND_APP.month; // "YYYY-MM"
const SLOT1_DATE = `${BRAND_MONTH}-05`;
const SLOT1_TIME = '14:00';
const SLOT2_DATE = `${BRAND_MONTH}-12`;
const SLOT2_TIME = '14:00';

// Mirrors the app's formatTime() — builds the exact visible label on a time pill button
function pillTimeLabel(time) {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

// Anchored regex for a pill button's accessible name — avoids "2:00 PM" matching inside "12:00 PM"
function pillNameRe(time) {
  const label = pillTimeLabel(time).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(✓\\s*)?${label}(\\s*\\(\\+1d\\))?$`);
}

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

// Helper: click a day in the small day-picker, then click the time pill for that start time.
// Fixed 2hr duration is implicit now — there's no end time to pass.
async function addTimeslot(page, date, startTime) {
  const day = String(parseInt(date.split('-')[2], 10)); // no leading zero, e.g. "5" not "05"
  await page.locator('.calendar-day-num').filter({ hasText: new RegExp(`^${day}$`) }).click();
  await page.getByRole('button', { name: pillNameRe(startTime) }).click();
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
    await addTimeslot(page, SLOT1_DATE, SLOT1_TIME);
    await addTimeslot(page, SLOT2_DATE, SLOT2_TIME);
    await fillCreatorDetails(page);
    await page.getByText('Submit Application').click();
    await page.waitForTimeout(1000);

    expect(capturedData).not.toBeNull();
    expect(capturedData.timeslots).toHaveLength(2);
    expect(capturedData.timeslots[0].date).toBe(SLOT1_DATE);
    expect(capturedData.timeslots[0].startTime).toBe(SLOT1_TIME);
    expect(capturedData.timeslots[0].endTime).toBe('16:00'); // fixed 2hr block
    expect(capturedData.timeslots[1].date).toBe(SLOT2_DATE);
    expect(capturedData.brandApplicationId).toBe(BRAND_APP.id);
    expect(capturedData.status).toBe('pending');
  });

  test('Shows added timeslots in the selected list', async ({ page }) => {
    await openApplyForm(page);
    await addTimeslot(page, SLOT1_DATE, SLOT1_TIME);

    await expect(page.getByText('Selected Timeslots (1)')).toBeVisible();

    await addTimeslot(page, SLOT2_DATE, SLOT2_TIME);
    await expect(page.getByText('Selected Timeslots (2)')).toBeVisible();
  });

  test('Blocks submit with fewer than 2 timeslots', async ({ page }) => {
    await openApplyForm(page);
    await addTimeslot(page, SLOT1_DATE, SLOT1_TIME);
    await fillCreatorDetails(page);
    await page.getByText('Submit Application').click();

    await expect(page.locator('.notification')).toContainText(/at least 2 timeslots/);
  });

  test('Blocks submit when required contact fields are empty', async ({ page }) => {
    await openApplyForm(page);
    await addTimeslot(page, SLOT1_DATE, SLOT1_TIME);
    await addTimeslot(page, SLOT2_DATE, SLOT2_TIME);
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

  // The following scenarios from the old free-form date/hour dropdown picker are no longer
  // reachable with the pill picker and have been removed:
  // - "Rejects stream shorter than 1.5 hours" — duration isn't user input anymore; every pill is a fixed 2hr block.
  // - "Rejects end time before start time" — not possible; end is always start+2h.
  // - "Rejects date outside brand month" — the day-picker only ever renders days within brandApp.month, so an
  //   out-of-month date can't be selected (there's no native date input left to bypass via page.evaluate).

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
      await addTimeslot(page, `${BRAND_MONTH}-05`, '14:00');
      await expect(page.getByText(/overlaps with an existing booking for this brand|has just been taken by another creator/)).toBeVisible();
    });
  }

  for (const status of ['rejected', 'cancelled']) {
    test(`Allows timeslot when another creator's slot is ${status} (same brand)`, async ({ page }) => {
      await setupOtherCreatorSlot(page, status);
      await addTimeslot(page, `${BRAND_MONTH}-05`, '14:00');
      await expect(page.getByText('Selected Timeslots (1)')).toBeVisible();
    });
  }

  // ── Check #8: own slot at another brand blocks double-booking ───────────────

  for (const status of ['confirmed', 'approved', 'pending']) {
    test(`Rejects timeslot overlapping own ${status} slot at another brand`, async ({ page }) => {
      await setupOwnSlotAtOtherBrand(page, status);
      await addTimeslot(page, `${BRAND_MONTH}-05`, '14:00');
      await expect(page.getByText(/overlaps with your existing stream/)).toBeVisible();
    });
  }

  for (const status of ['rejected', 'cancelled']) {
    test(`Allows timeslot when own slot at another brand is ${status}`, async ({ page }) => {
      await setupOwnSlotAtOtherBrand(page, status);
      await addTimeslot(page, `${BRAND_MONTH}-05`, '14:00');
      await expect(page.getByText('Selected Timeslots (1)')).toBeVisible();
    });
  }

  test('Clicking an already-selected pill deselects it', async ({ page }) => {
    await addTimeslot(page, SLOT1_DATE, SLOT1_TIME);
    await expect(page.getByText('Selected Timeslots (1)')).toBeVisible();

    // Click the same day + pill again — toggles it off instead of erroring
    await addTimeslot(page, SLOT1_DATE, SLOT1_TIME);
    await expect(page.getByText('Selected Timeslots')).not.toBeVisible();
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

  // ── New pill-picker-specific behavior ────────────────────────────────────────

  test('A pill fully booked by 2 other creators is not rendered at all', async ({ page }) => {
    const takenRows = ['other_a', 'other_b'].map((creatorId, i) => ({
      ...CA_ROW_1,
      id: `full00${i}`,
      groupId: `grpfull${i}`,
      creatorId,
      streamDate: `${BRAND_MONTH}-05`,
      streamTime: '14:00',
      streamEndDate: `${BRAND_MONTH}-05`,
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
    await openApplyForm(page);

    const day = String(parseInt(`${BRAND_MONTH}-05`.split('-')[2], 10));
    await page.locator('.calendar-day-num').filter({ hasText: new RegExp(`^${day}$`) }).click();

    await expect(page.getByRole('button', { name: pillNameRe('14:00') })).toHaveCount(0);
  });

  test('Selecting a pill disables other pills that would overlap it', async ({ page }) => {
    const day = String(parseInt(SLOT1_DATE.split('-')[2], 10));
    await page.locator('.calendar-day-num').filter({ hasText: new RegExp(`^${day}$`) }).click();
    await page.getByRole('button', { name: pillNameRe('14:00') }).click();

    // 14:00-16:00 selected — 13:30 (13:30-15:30) and 14:30 (14:30-16:30) both overlap it
    await expect(page.getByRole('button', { name: pillNameRe('13:30') })).toBeDisabled();
    await expect(page.getByRole('button', { name: pillNameRe('14:30') })).toBeDisabled();
    // 12:00 (12:00-14:00) ends exactly when the selected slot starts — no overlap, stays enabled
    await expect(page.getByRole('button', { name: pillNameRe('12:00') })).toBeEnabled();
  });
});
