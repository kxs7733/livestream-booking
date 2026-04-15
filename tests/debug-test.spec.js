const { test, expect } = require('@playwright/test');
const { mockApi, baseAllData, CA_ROW_1 } = require('./helpers');

const CREATOR_MOCK = {
  success: true,
  exists: true,
  affiliate: { id: 'creator001', name: 'TestCreator', createdAt: '2026-01-01T00:00:00Z', phone: '6591234567', shippingAddress: '123 Test St, Singapore 123456' },
};

test('debug login', async ({ page }) => {
  const errors = [];
  const logs = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'log') logs.push(msg.text());
  });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));
  
  await mockApi(page, {
    getAllData: baseAllData([CA_ROW_1]),
    validateCreatorLogin: CREATOR_MOCK,
  });
  await page.goto('/');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/');
  await page.getByText("I'm a Creator").click();
  await page.fill('#login-name', 'TestCreator');
  await page.fill('#login-phone', '91234567');
  await page.click('#login-btn');
  
  await page.waitForTimeout(3000);
  
  console.log('=== ERRORS ===');
  errors.forEach(e => console.log(e));
  console.log('=== LOGS (last 10) ===');
  logs.slice(-10).forEach(l => console.log(l));
  
  const title = await page.locator('.dashboard-title').count();
  console.log('Dashboard title count:', title);
  
  // Get visible text
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
  console.log('Body text:', bodyText);
});
