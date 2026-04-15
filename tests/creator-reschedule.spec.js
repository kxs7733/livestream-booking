const { test, expect } = require('@playwright/test');
const {
  mockApi, baseAllData, loginAsCreator,
  CA_ROW_1, CA_ROW_APPROVED_1, CA_ROW_APPROVED_2,
  dateStr,
} = require('./helpers');

const CREATOR_MOCK = {
  success: true,
  exists: true,
  affiliate: { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567', shippingAddress: '123 Test St, Singapore 123456' },
};

// Slot ≥ 3 days away — reschedulable
const CA_CONFIRMED_RESCHEDULABLE = {
  ...CA_ROW_1,
  id: 'ca_conf_far',
  streamDate: dateStr(14),
  streamEndDate: dateStr(14),
  streamTime: '14:00',
  streamEndTime: '16:30',
  status: 'approved',
};

const CA_APPROVED_RESCHEDULABLE = {
  ...CA_ROW_APPROVED_1,
  id: 'ca_appr_far',
  streamDate: dateStr(14),
  streamEndDate: dateStr(14),
  streamTime: '14:00',
  streamEndTime: '16:30',
};

// Slot < 3 days away — NOT reschedulable (2 days out)
const CA_CONFIRMED_SOON = {
  ...CA_ROW_1,
  id: 'ca_conf_soon',
  streamDate: dateStr(2),
  streamEndDate: dateStr(2),
  streamTime: '14:00',
  streamEndTime: '16:30',
  status: 'approved',
};

const CA_APPROVED_SOON = {
  ...CA_ROW_APPROVED_1,
  id: 'ca_appr_soon',
  streamDate: dateStr(2),
  streamEndDate: dateStr(2),
  streamTime: '14:00',
  streamEndTime: '16:30',
};

// Another creator's slot for the same brand — to test "Taken" label
const CA_OTHER_CREATOR = {
  ...CA_ROW_1,
  id: 'ca_other',
  creatorId: 'creator002',
  creatorName: 'OtherCreator',
  affiliateUsername: 'othercreator',
  streamDate: dateStr(21),
  streamEndDate: dateStr(21),
  streamTime: '10:00',
  streamEndTime: '12:00',
  status: 'approved',
  brandApplicationId: 'bapp001',
};

// Creator's own other slot for same brand — to test "You" label
const CA_OWN_OTHER = {
  ...CA_ROW_1,
  id: 'ca_own_other',
  streamDate: dateStr(21),
  streamEndDate: dateStr(21),
  streamTime: '16:00',
  streamEndTime: '18:00',
  status: 'approved',
  brandApplicationId: 'bapp001',
};

async function goToConfirmedTab(page) {
  await page.getByText(/Confirmed Livestreams/).click();
}

async function openRescheduleModal(page) {
  await page.getByText('🔄 Reschedule').first().click();
  await expect(page.getByText('🔄 Reschedule Slot')).toBeVisible();
}

// Helper: fill reschedule form (mirrors addTimeslot helper in creator-apply.spec.js)
// start/end format: 'YYYY-MM-DDTHH:MM'
async function fillRescheduleForm(page, start, end = '') {
  const [sDate, sTime] = start.split('T');
  const [sHour, sMin] = sTime.split(':');
  await page.fill('#reschedule-start-date', sDate);
  await page.selectOption('#reschedule-start-hour', sHour);
  await page.selectOption('#reschedule-start-min', sMin);
  if (end) {
    const [eDate, eTime] = end.split('T');
    const [eHour, eMin] = eTime.split(':');
    if (eDate !== sDate) await page.fill('#reschedule-end-date', eDate);
    await page.selectOption('#reschedule-end-hour', eHour);
    await page.selectOption('#reschedule-end-min', eMin);
  }
}

// ─── Button visibility ────────────────────────────────────────────────────────

test.describe('Reschedule — button visibility', () => {
  test('Reschedule button shown on confirmed card when slot ≥ 3 days away', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText('🔄 Reschedule')).toBeVisible();
  });

  test('Reschedule button NOT shown on confirmed card when slot < 3 days away', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_SOON]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText('🔄 Reschedule')).not.toBeVisible();
  });

  test('Reschedule button shown on approved card when slot ≥ 3 days away', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_APPROVED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText('🔄 Reschedule')).toBeVisible();
  });

  test('Reschedule button NOT shown on approved card when slot < 3 days away', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_APPROVED_SOON]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await expect(page.getByText('🔄 Reschedule')).not.toBeVisible();
  });
});

// ─── Modal content ────────────────────────────────────────────────────────────

test.describe('Reschedule — modal content', () => {
  test('Modal opens when Reschedule button clicked', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await expect(page.locator('.brand-detail-modal')).toBeVisible();
  });

  test('Modal shows brand name', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await expect(page.locator('.brand-detail-modal')).toContainText('Test Shop');
  });

  test('Modal shows current slot in Current Slot section', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await expect(page.locator('.brand-detail-modal')).toContainText('Current Slot');
  });

  test('Modal shows date picker and hour/min selects', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await expect(page.locator('#reschedule-start-date')).toBeVisible();
    await expect(page.locator('#reschedule-start-hour')).toBeVisible();
    await expect(page.locator('#reschedule-start-min')).toBeVisible();
    await expect(page.locator('#reschedule-end-hour')).toBeVisible();
    await expect(page.locator('#reschedule-end-min')).toBeVisible();
  });

  test('Modal shows existing bookings for brand — other creator labelled Taken', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE, CA_OTHER_CREATOR]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    // Open modal for the reschedulable card (not CA_OTHER_CREATOR which belongs to another creator)
    const cards = page.locator('.app-card');
    await cards.first().getByText('🔄 Reschedule').click();
    await expect(page.locator('.brand-detail-modal')).toContainText('Taken');
  });

  test('Modal shows own other slot for same brand labelled You', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE, CA_OWN_OTHER]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await page.locator('.app-card').first().getByText('🔄 Reschedule').click();
    await expect(page.locator('.brand-detail-modal')).toContainText('You');
  });

  test('Modal shows own slots with other brands in same month under "Your Other Streams"', async ({ page }) => {
    // Use day 3 of the same month as the reschedulable slot — guaranteed same month, different day
    const slotMonth = CA_CONFIRMED_RESCHEDULABLE.streamDate.substring(0, 7);
    const sameMonthDate = `${slotMonth}-03`;
    const CA_OTHER_BRAND_SAME_MONTH = {
      ...CA_CONFIRMED_RESCHEDULABLE,
      id: 'ca_other_brand_sm',
      brandApplicationId: 'bapp_other',
      brandName: 'Other Brand',
      shopName: 'Other Brand',
      streamDate: sameMonthDate,
      streamEndDate: sameMonthDate,
      streamTime: '09:00',
      streamEndTime: '11:00',
    };
    await mockApi(page, {
      getAllData: {
        ...baseAllData([CA_CONFIRMED_RESCHEDULABLE, CA_OTHER_BRAND_SAME_MONTH]),
        brandApplications: [
          ...baseAllData([]).brandApplications,
          { id: 'bapp_other', brandId: 'shop002', shopId: 'shop002', brandName: 'Other Brand', shopName: 'Other Brand', month: slotMonth, streamCount: 2, status: 'approved', sellerType: 'Fashion', amsCommission: '5', sellerPicEmail: '', sellerPicName: '', sellerPicMobile: '' },
        ],
      },
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await page.locator('.app-card').first().getByText('🔄 Reschedule').click();
    await expect(page.locator('.brand-detail-modal')).toContainText('Your Other Streams');
    await expect(page.locator('.brand-detail-modal')).toContainText('Other Brand');
  });

  test('Modal does NOT show own slots with other brands that are outside the slot month', async ({ page }) => {
    const CA_OTHER_BRAND_DIFF_MONTH = {
      ...CA_CONFIRMED_RESCHEDULABLE,
      id: 'ca_other_brand_dm',
      brandApplicationId: 'bapp_other2',
      brandName: 'Future Brand',
      shopName: 'Future Brand',
      streamDate: '2099-01-15',
      streamEndDate: '2099-01-15',
      streamTime: '09:00',
      streamEndTime: '11:00',
    };
    await mockApi(page, {
      getAllData: {
        ...baseAllData([CA_CONFIRMED_RESCHEDULABLE, CA_OTHER_BRAND_DIFF_MONTH]),
        brandApplications: [
          ...baseAllData([]).brandApplications,
          { id: 'bapp_other2', brandId: 'shop003', shopId: 'shop003', brandName: 'Future Brand', shopName: 'Future Brand', month: '2099-01', streamCount: 2, status: 'approved', sellerType: 'Fashion', amsCommission: '5', sellerPicEmail: '', sellerPicName: '', sellerPicMobile: '' },
        ],
      },
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await expect(page.locator('.brand-detail-modal')).not.toContainText('Your Other Streams');
    await expect(page.locator('.brand-detail-modal')).not.toContainText('Future Brand');
  });

  test('Modal closes when Cancel clicked', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await page.locator('.brand-detail-modal').getByText('Cancel').click();
    await expect(page.locator('.brand-detail-modal')).not.toBeVisible();
  });

  test('Modal closes when overlay backdrop clicked', async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await page.locator('.brand-detail-overlay').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.brand-detail-modal')).not.toBeVisible();
  });
});

// ─── Positive submit flow ────────────────────────────────────────────────────

test.describe('Reschedule — successful submit', () => {
  test('Valid reschedule calls rescheduleCreatorApplication with correct params', async ({ page }) => {
    let capturedParams = null;
    const newDate = dateStr(20); // different date, same month
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
      rescheduleCreatorApplication: (params) => {
        capturedParams = { id: params.get('id'), data: JSON.parse(params.get('data')) };
        return { success: true };
      },
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await fillRescheduleForm(page, `${newDate}T16:00`, `${newDate}T18:00`);
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await page.waitForTimeout(500);
    expect(capturedParams).not.toBeNull();
    expect(capturedParams.id).toBe(CA_CONFIRMED_RESCHEDULABLE.id);
    expect(capturedParams.data.newDate).toBe(newDate);
    expect(capturedParams.data.newStartTime).toBe('16:00');
    expect(capturedParams.data.newEndTime).toBe('18:00');
  });

  test('Modal closes and success notification shown after successful reschedule', async ({ page }) => {
    const newDate = dateStr(20);
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
      rescheduleCreatorApplication: () => ({ success: true }),
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await fillRescheduleForm(page, `${newDate}T16:00`, `${newDate}T18:00`);
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await expect(page.locator('.brand-detail-modal')).not.toBeVisible();
    await expect(page.locator('.notification')).toContainText(/rescheduled/i);
  });

  test('Reschedule works from Confirmed Livestreams tab for approved slot', async ({ page }) => {
    let capturedParams = null;
    const newDate = dateStr(20);
    await mockApi(page, {
      getAllData: baseAllData([CA_APPROVED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
      rescheduleCreatorApplication: (params) => {
        capturedParams = { id: params.get('id'), data: JSON.parse(params.get('data')) };
        return { success: true };
      },
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await fillRescheduleForm(page, `${newDate}T10:00`, `${newDate}T12:00`);
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await page.waitForTimeout(500);
    expect(capturedParams).not.toBeNull();
    expect(capturedParams.id).toBe(CA_APPROVED_RESCHEDULABLE.id);
  });
});

// ─── Negative flows — client-side validation ─────────────────────────────────

test.describe('Reschedule — client-side validation errors', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
  });

  test('Submit with no date filled shows required fields error', async ({ page }) => {
    // Times are selects (always have a value); only date can be empty
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await expect(page.locator('.notification.error')).toBeVisible();
    await expect(page.locator('.notification.error')).toContainText(/fill in/i);
    // Modal stays open
    await expect(page.locator('.brand-detail-modal')).toBeVisible();
  });

  test('Submit with end time before start time shows error', async ({ page }) => {
    const newDate = dateStr(20);
    await page.fill('#reschedule-start-date', newDate);
    await page.selectOption('#reschedule-start-hour', '16');
    await page.selectOption('#reschedule-start-min', '00');
    await page.selectOption('#reschedule-end-hour', '14');
    await page.selectOption('#reschedule-end-min', '00');
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await expect(page.locator('.notification.error')).toContainText(/after start time/i);
    await expect(page.locator('.brand-detail-modal')).toBeVisible();
  });

  test('Submit with duration under 2 hours shows error', async ({ page }) => {
    const newDate = dateStr(20);
    await page.fill('#reschedule-start-date', newDate);
    await page.selectOption('#reschedule-start-hour', '14');
    await page.selectOption('#reschedule-start-min', '00');
    await page.selectOption('#reschedule-end-hour', '15');
    await page.selectOption('#reschedule-end-min', '00'); // 1 hour — too short
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await expect(page.locator('.notification.error')).toContainText(/2 hours/i);
    await expect(page.locator('.brand-detail-modal')).toBeVisible();
  });

  test('Submit with same date and time as current slot shows error', async ({ page }) => {
    // CA_CONFIRMED_RESCHEDULABLE has streamDate=dateStr(14), streamTime='14:00'
    await page.fill('#reschedule-start-date', dateStr(14));
    await page.selectOption('#reschedule-start-hour', '14');
    await page.selectOption('#reschedule-start-min', '00');
    await page.selectOption('#reschedule-end-hour', '16');
    await page.selectOption('#reschedule-end-min', '30'); // 2.5 hours — valid duration but same slot
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await expect(page.locator('.notification.error')).toContainText(/same/i);
    await expect(page.locator('.brand-detail-modal')).toBeVisible();
  });

  test('Submit with date in different month shows same-month error', async ({ page }) => {
    // Pick a date 2 months out — definitely a different month
    const differentMonthDate = dateStr(70);
    await page.fill('#reschedule-start-date', differentMonthDate);
    await page.selectOption('#reschedule-start-hour', '16');
    await page.selectOption('#reschedule-start-min', '00');
    await page.selectOption('#reschedule-end-hour', '18');
    await page.selectOption('#reschedule-end-min', '00');
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await expect(page.locator('.notification.error')).toContainText(/same month/i);
    await expect(page.locator('.brand-detail-modal')).toBeVisible();
  });

  test('Submit with overlap on same brand shows conflict error', async ({ page }) => {
    // CA_OTHER_CREATOR is at dateStr(21) 10:00–12:00 for same brand
    // Re-mock with the conflicting slot present
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE, CA_OTHER_CREATOR]),
      validateCreatorLogin: CREATOR_MOCK,
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await page.locator('.app-card').first().getByText('🔄 Reschedule').click();
    await expect(page.getByText('🔄 Reschedule Slot')).toBeVisible();
    // Try to reschedule to 10:00–12:00 on same day as CA_OTHER_CREATOR
    await page.fill('#reschedule-start-date', dateStr(21));
    await page.selectOption('#reschedule-start-hour', '10');
    await page.selectOption('#reschedule-start-min', '00');
    await page.selectOption('#reschedule-end-hour', '12');
    await page.selectOption('#reschedule-end-min', '00');
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await expect(page.locator('.notification.error')).toContainText(/overlap/i);
    await expect(page.locator('.brand-detail-modal')).toBeVisible();
  });
});

// ─── Negative flows — backend errors ────────────────────────────────────────

test.describe('Reschedule — backend error handling', () => {
  test('Backend conflict error shown and modal stays open', async ({ page }) => {
    const newDate = dateStr(20);
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
      rescheduleCreatorApplication: () => ({ success: false, error: 'This timeslot overlaps with an existing booking. Please choose a different time.' }),
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await fillRescheduleForm(page, `${newDate}T16:00`, `${newDate}T18:00`);
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await expect(page.locator('.notification.error')).toContainText(/overlaps/i);
    await expect(page.locator('.brand-detail-modal')).toBeVisible();
  });

  test('Backend 3-day rule error shown and modal stays open', async ({ page }) => {
    const newDate = dateStr(20);
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
      rescheduleCreatorApplication: () => ({ success: false, error: 'This slot is too close to today and cannot be rescheduled.' }),
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await fillRescheduleForm(page, `${newDate}T16:00`, `${newDate}T18:00`);
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await expect(page.locator('.notification.error')).toContainText(/too close/i);
    await expect(page.locator('.brand-detail-modal')).toBeVisible();
  });

  test('Generic backend failure shows error notification and modal stays open', async ({ page }) => {
    const newDate = dateStr(20);
    await mockApi(page, {
      getAllData: baseAllData([CA_CONFIRMED_RESCHEDULABLE]),
      validateCreatorLogin: CREATOR_MOCK,
      rescheduleCreatorApplication: () => ({ success: false }),
    });
    await page.goto('/');
    await loginAsCreator(page);
    await goToConfirmedTab(page);
    await openRescheduleModal(page);
    await fillRescheduleForm(page, `${newDate}T16:00`, `${newDate}T18:00`);
    await page.locator('.brand-detail-modal').getByText('🔄 Confirm Reschedule').click();
    await expect(page.locator('.notification.error')).toBeVisible();
    await expect(page.locator('.brand-detail-modal')).toBeVisible();
  });
});
