const { test, expect } = require('@playwright/test');
const { mockApi, baseAllData, loginAsCreator, BRAND_APP, CA_ROW_1 } = require('./helpers');

const CREATOR_LOGIN_MOCK = {
  success: true,
  exists: true,
  affiliate: { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567' },
};

// Brand month e.g. "2026-04" — dates must fall within it
const BRAND_MONTH = BRAND_APP.month; // "YYYY-MM"
const slot1Start = `${BRAND_MONTH}-05T14:00`;
const slot1End   = `${BRAND_MONTH}-05T16:00`;
const slot2Start = `${BRAND_MONTH}-12T14:00`;
const slot2End   = `${BRAND_MONTH}-12T16:00`;

// A date in the month BEFORE the brand's month (for wrong-month test)
const [y, m] = BRAND_MONTH.split('-').map(Number);
const prevYear = m === 1 ? y - 1 : y;
const prevMonth = m === 1 ? 12 : m - 1;
const wrongMonthSlot = `${prevYear}-${String(prevMonth).padStart(2, '0')}-15T14:00`;

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
async function addTimeslot(page, start, end) {
  await page.fill('#f-stream-start-datetime', start);
  await page.fill('#f-stream-end-datetime', end);
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
    await expect(page.locator('.notification')).toContainText(/at least 1.5 hours/);
    await expect(page.getByText('Selected Timeslots')).not.toBeVisible();
  });

  test('Rejects end time before start time', async ({ page }) => {
    await addTimeslot(page, `${BRAND_MONTH}-05T16:00`, `${BRAND_MONTH}-05T14:00`);
    await expect(page.getByText(/end must be after start/)).toBeVisible();
  });

  test('Rejects date outside brand month', async ({ page }) => {
    // Use evaluate to bypass the min/max HTML constraint on the input
    await page.evaluate(([start, end]) => {
      document.getElementById('f-stream-start-datetime').value = start;
      document.getElementById('f-stream-end-datetime').value = end;
    }, [wrongMonthSlot, wrongMonthSlot.replace('T14:00', 'T16:00')]);
    await page.getByRole('button', { name: '+ Add Timeslot' }).click();

    await expect(page.getByText(/Stream must start within/)).toBeVisible();
  });

  test('Rejects timeslot overlapping one taken by another creator', async ({ page }) => {
    // Pre-populate state with a confirmed CA from another creator at slot1 time
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
        status: 'confirmed',
        sampleSentAt: '',
      }]),
      validateCreatorLogin: CREATOR_LOGIN_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await openApplyForm(page);

    // Try to add a slot that overlaps 13:00-15:30
    await addTimeslot(page, `${BRAND_MONTH}-05T14:00`, `${BRAND_MONTH}-05T16:00`);
    await expect(page.getByText(/already taken by another creator/)).toBeVisible();
  });

  test('Rejects timeslot overlapping creator own confirmed slot at another brand', async ({ page }) => {
    const BRAND_APP_2 = { ...require('./helpers').BRAND_APP, id: 'bapp002', shopId: 'shop002', shopName: 'Other Shop', brandId: 'shop002' };
    // Creator has a confirmed slot at another brand that overlaps
    await mockApi(page, {
      getAllData: {
        ...baseAllData([{
          ...CA_ROW_1,
          id: 'myconfirmed001',
          groupId: 'grpmyconf',
          creatorId: 'creator001',
          brandApplicationId: 'bapp002',
          streamDate: `${BRAND_MONTH}-05`,
          streamTime: '13:00',
          streamEndDate: `${BRAND_MONTH}-05`,
          streamEndTime: '15:30',
          status: 'confirmed',
          sampleSentAt: '',
        }]),
        brandApplications: [require('./helpers').BRAND_APP, BRAND_APP_2],
      },
      validateCreatorLogin: CREATOR_LOGIN_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await openApplyForm(page);

    await addTimeslot(page, `${BRAND_MONTH}-05T14:00`, `${BRAND_MONTH}-05T16:00`);
    await expect(page.getByText(/overlaps with your confirmed stream/)).toBeVisible();
  });

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
    // BRAND_APP has streamCount: 3. Fill all 3 slots with other creator rows.
    const takenRows = [1, 2, 3].map((i) => ({
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
    await page.goto('/');
    await loginAsCreator(page);

    // Brand is fully booked — should not appear in available brands
    await expect(page.getByText('Apply for This Brand')).not.toBeVisible();
  });
});
