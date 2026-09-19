import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';

const session = createHmac('sha256', 'voice-tests-only-session-secret')
  .update('authenticated:voice-tests-only').digest('hex');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut' }).format(new Date());
const countDates = ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30'];
const dateDates = countDates.slice(0, 4);
const configurations = [
  { tab: 'Expected', table: 'expectedMoney', sourcePlaceholder: 'Source', amountPlaceholder: 'Expected amount', dateField: 'expected_date' },
  { tab: 'Payables', table: 'payables', sourcePlaceholder: 'Pay to', amountPlaceholder: 'Amount', dateField: 'pay_date' },
];

async function setupAccounts(page, { items = {}, createdDates, saveHandler } = {}) {
  const state = {
    writes: [], reads: 0, savingsReads: 0,
    data: { currentMoney: [], expectedMoney: [], payables: [], recurring: [], projects: [], ...items },
  };
  await page.context().addCookies([{ name: 'bym_session', value: session, url: 'http://127.0.0.1:4308', httpOnly: true }]);
  // Fail closed for all application API calls: no live database or provider calls.
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      if (pathname === '/api/accounts') {
        state.reads += 1;
        return route.fulfill({ json: state.data });
      }
      if (pathname === '/api/metals') return route.fulfill({ json: {
        holdings: { gold_24k_grams: 0, gold_21k_grams: 0, silver_kg: 0 },
        prices: { gold_24k_per_gram: 85, gold_21k_per_gram: 74.4, silver_per_kg: 950, source: 'manual' },
        values: { gold_24k: 0, gold_21k: 0, silver: 0, total: 0 },
        longTermSavings: { aub_pension_amount: 0, cash_savings_amount: 0 },
      } });
      if (pathname === '/api/savings-plan') {
        state.savingsReads += 1;
        return route.fulfill({ json: { items: [], summary: { planned: 0, item_count: 0 } } });
      }
      if (pathname === '/api/auth/check') return route.fulfill({ json: { authenticated: true } });
    }
    if (pathname === '/api/accounts' && ['POST', 'PUT'].includes(request.method())) {
      const body = request.postDataJSON();
      state.writes.push({ method: request.method(), body });
      if (saveHandler) return saveHandler(route, state);
      if (request.method() === 'PUT') {
        state.data[body.table] = state.data[body.table].map((item) => item.id === body.id ? { ...item, ...body } : item);
        return route.fulfill({ json: { success: true } });
      }
      const dateField = body.table === 'expectedMoney' ? 'expected_date' : 'pay_date';
      const dates = createdDates || [body[dateField]];
      const { monthly_repeat: ignored, ...fields } = body;
      state.data[body.table].push(...dates.map((date, index) => ({ ...fields, [dateField]: date, id: index + 100 })));
      return route.fulfill({ json: { success: true, id: 100, created_count: dates.length } });
    }
    return route.fulfill({ status: 501, json: { error: `Unexpected mocked request: ${request.method()} ${pathname}` } });
  });
  await page.goto('/accounts');
  await expect(page.getByRole('button', { name: 'Current', exact: true })).toBeVisible();
  return state;
}

async function openAdd(page, config) {
  await page.getByRole('button', { name: config.tab, exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add item', exact: true })).toBeVisible();
}

async function fillEntry(page, config, { source = 'Consulting payment', amount = '500', date = '2027-01-31', notes = 'Keep this note' } = {}) {
  await page.getByPlaceholder(config.sourcePlaceholder, { exact: true }).fill(source);
  await page.getByPlaceholder(config.amountPlaceholder, { exact: true }).fill(amount);
  await page.locator('input[type="date"]:visible').first().fill(date);
  await page.getByPlaceholder('Notes', { exact: true }).fill(notes);
}

const advanced = (page) => page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Advanced$/ }) });
const addButton = (page) => page.getByRole('button', { name: 'Add item', exact: true });

for (const config of configurations) {
  test(`${config.tab}: Advanced starts collapsed and a normal add makes one unchanged item`, async ({ page }) => {
    const state = await setupAccounts(page);
    await openAdd(page, config);
    await expect(advanced(page)).not.toHaveAttribute('open');
    await expect(page.getByLabel('Repeat monthly', { exact: true })).not.toBeVisible();
    if (config.tab === 'Expected') await expect(page.getByRole('spinbutton', { name: /^Add to savings plan \(optional\)/ })).not.toBeVisible();
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);
    await expect(page.getByText('Enter a source of up to 500 characters.', { exact: true })).toHaveCount(0);
    await addButton(page).click();
    await expect(page.locator('p[role="alert"]')).toContainText(config.tab === 'Expected' ? 'Source is required.' : 'Payee is required.');
    expect(state.writes).toHaveLength(0);
    await fillEntry(page, config, { source: 'Single entry', date: today });
    await addButton(page).click();
    await expect(addButton(page)).not.toBeVisible();
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toMatchObject({ method: 'POST', body: {
      table: config.table, source: 'Single entry', amount: 500, [config.dateField]: today,
      notes: 'Keep this note', monthly_repeat: null,
    } });
    expect(state.data[config.table]).toHaveLength(1);
    await expect(page.locator('article').filter({ hasText: 'Single entry' })).toHaveCount(1);
    await expect.poll(() => state.reads).toBeGreaterThan(1);
  });

  for (const ending of ['count', 'date']) {
    test(`${config.tab}: monthly ${ending} submits a finite schedule in one request`, async ({ page }, testInfo) => {
      const dates = ending === 'count' ? countDates : dateDates;
      const state = await setupAccounts(page, { createdDates: dates });
      await openAdd(page, config);
      await fillEntry(page, config);
      await advanced(page).locator('summary').click();
      await expect(page.getByLabel('Repeat monthly', { exact: true })).not.toBeChecked();
      await expect(page.getByRole('combobox', { name: 'Repeat until', exact: true })).not.toBeVisible();
      await page.getByLabel('Repeat monthly', { exact: true }).check();
      if (ending === 'count') {
        await expect(page.getByLabel('Number of months', { exact: true })).toHaveValue('6');
        await page.getByLabel('Number of months', { exact: true }).fill('6');
      } else {
        await page.getByRole('combobox', { name: 'Repeat until', exact: true }).selectOption({ label: 'End date' });
        await page.getByLabel('End date', { exact: true }).fill('2027-04-30');
      }
      await expect(advanced(page)).toContainText(`${dates.length} monthly items`);
      await expect(advanced(page)).toContainText(/first included/i);
      expect(state.writes).toHaveLength(0);
      await page.screenshot({ path: testInfo.outputPath(`account-${config.table}-${ending}.png`), fullPage: true });
      await addButton(page).click();
      await expect(addButton(page)).not.toBeVisible();
      expect(state.writes).toHaveLength(1);
      expect(state.writes[0]).toMatchObject({ method: 'POST', body: {
        table: config.table, source: 'Consulting payment', amount: 500, [config.dateField]: '2027-01-31', notes: 'Keep this note',
        monthly_repeat: ending === 'count' ? { end_type: 'count', count: 6 } : { end_type: 'date', end_date: '2027-04-30' },
      } });
      expect(state.data[config.table]).toHaveLength(dates.length);
      await expect.poll(() => state.reads).toBeGreaterThan(1);
    });
  }

  test(`${config.tab}: editing an individual dated item never offers or creates a series`, async ({ page }) => {
    const state = await setupAccounts(page, { items: { [config.table]: [{ id: 7, source: 'Existing item', amount: 500, [config.dateField]: today, notes: 'Existing note', planned_save_amount: config.tab === 'Expected' ? 100 : undefined }] } });
    await page.getByRole('button', { name: config.tab, exact: true }).click();
    await page.locator('article').filter({ hasText: 'Existing item' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Repeat monthly', { exact: true })).toHaveCount(0);
    if (config.tab === 'Expected') {
      await expect(advanced(page)).not.toHaveAttribute('open');
      await advanced(page).locator('summary').click();
      await expect(page.getByRole('spinbutton', { name: /^Add to savings plan \(optional\)/ })).toHaveValue('100');
    }
    await page.getByPlaceholder(config.amountPlaceholder, { exact: true }).fill('550');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).not.toBeVisible();
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toMatchObject({ method: 'PUT', body: { table: config.table, id: 7, amount: 550 } });
    expect(state.writes[0].body.monthly_repeat ?? null).toBeNull();
    expect(state.data[config.table]).toHaveLength(1);
    if (config.tab === 'Expected') expect(state.writes[0].body.planned_save_amount).toBe(100);
  });
}

test('Expected savings stays in Advanced and preserves its amount through collapse and monthly add', async ({ page }) => {
  const config = configurations[0];
  const state = await setupAccounts(page, { createdDates: countDates });
  await openAdd(page, config);
  await fillEntry(page, config);
  await advanced(page).locator('summary').click();
  await page.getByRole('spinbutton', { name: /^Add to savings plan \(optional\)/ }).fill('125');
  await page.getByLabel('Repeat monthly', { exact: true }).check();
  await advanced(page).locator('summary').click();
  await expect(page.getByRole('spinbutton', { name: /^Add to savings plan \(optional\)/ })).not.toBeVisible();
  await advanced(page).locator('summary').click();
  await expect(page.getByRole('spinbutton', { name: /^Add to savings plan \(optional\)/ })).toHaveValue('125');
  await expect(page.getByLabel('Number of months', { exact: true })).toHaveValue('6');
  await addButton(page).click();
  await expect(addButton(page)).not.toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toMatchObject({ planned_save_amount: 125, monthly_repeat: { end_type: 'count', count: 6 } });
  await expect.poll(() => state.savingsReads).toBeGreaterThan(1);
});

test('turning off monthly repeat restores a single item without altering the ordinary fields', async ({ page }) => {
  const config = configurations[1];
  const state = await setupAccounts(page);
  await openAdd(page, config);
  await fillEntry(page, config);
  await advanced(page).locator('summary').click();
  await page.getByLabel('Repeat monthly', { exact: true }).check();
  await page.getByLabel('Number of months', { exact: true }).fill('12');
  await page.getByLabel('Repeat monthly', { exact: true }).uncheck();
  await expect(page.getByLabel('Number of months', { exact: true })).not.toBeVisible();
  await expect(page.getByPlaceholder('Pay to', { exact: true })).toHaveValue('Consulting payment');
  await expect(page.getByPlaceholder('Amount', { exact: true })).toHaveValue('500');
  await expect(page.getByPlaceholder('Notes', { exact: true })).toHaveValue('Keep this note');
  await addButton(page).click();
  await expect(addButton(page)).not.toBeVisible();
  expect(state.writes[0].body.monthly_repeat).toBeNull();
  expect(state.data.payables).toHaveLength(1);
});

test('monthly controls reject missing, fractional, excessive and backwards limits', async ({ page }) => {
  const state = await setupAccounts(page);
  await openAdd(page, configurations[0]);
  await fillEntry(page, configurations[0]);
  await advanced(page).locator('summary').click();
  await page.getByLabel('Repeat monthly', { exact: true }).check();
  for (const count of ['', '0', '1.5', '121']) {
    await page.getByLabel('Number of months', { exact: true }).fill(count);
    await addButton(page).click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
  }
  await page.getByLabel('Number of months', { exact: true }).fill('120');
  await expect(addButton(page)).toBeEnabled();
  await page.getByRole('combobox', { name: 'Repeat until', exact: true }).selectOption({ label: 'End date' });
  for (const end of ['', '2027-01-30', '2038-01-31']) {
    await page.getByLabel('End date', { exact: true }).fill(end);
    await addButton(page).click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
  }
  await page.getByLabel('End date', { exact: true }).fill('2027-01-31');
  await expect(addButton(page)).toBeEnabled();
  await expect(advanced(page)).toContainText(/1 monthly item/);
  expect(state.writes).toHaveLength(0);
});

test('planned savings validation still prevents amounts above the expected income', async ({ page }) => {
  const state = await setupAccounts(page);
  await openAdd(page, configurations[0]);
  await fillEntry(page, configurations[0]);
  await advanced(page).locator('summary').click();
  await page.getByRole('spinbutton', { name: /^Add to savings plan \(optional\)/ }).fill('501');
  await addButton(page).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Planned savings');
  await page.getByLabel('Repeat monthly', { exact: true }).check();
  await addButton(page).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Planned savings');
  await page.getByRole('spinbutton', { name: /^Add to savings plan \(optional\)/ }).fill('500');
  await expect(addButton(page)).toBeEnabled();
  expect(state.writes).toHaveLength(0);
});

test('a rejected schedule retains all edits and supports an explicit retry', async ({ page }) => {
  const state = await setupAccounts(page, { saveHandler: (route, current) => current.writes.length === 1
    ? route.fulfill({ status: 400, json: { error: 'Please check the monthly schedule.' } })
    : route.fulfill({ json: { success: true, id: 100, created_count: 6 } }) });
  await openAdd(page, configurations[0]);
  await fillEntry(page, configurations[0]);
  await advanced(page).locator('summary').click();
  await page.getByRole('spinbutton', { name: /^Add to savings plan \(optional\)/ }).fill('100');
  await page.getByLabel('Repeat monthly', { exact: true }).check();
  await addButton(page).click();
  await expect(page.locator('p[role="alert"]').filter({ hasText: 'Please check the monthly schedule.' })).toBeVisible();
  await expect(page.getByPlaceholder('Source', { exact: true })).toHaveValue('Consulting payment');
  await expect(page.getByRole('spinbutton', { name: /^Add to savings plan \(optional\)/ })).toHaveValue('100');
  await expect(page.getByLabel('Number of months', { exact: true })).toHaveValue('6');
  await expect(addButton(page)).toBeEnabled();
  expect(state.writes).toHaveLength(1);
  await addButton(page).click();
  await expect(addButton(page)).not.toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].body).toEqual(state.writes[0].body);
});

test('double submission sends one schedule request and locks controls until completion', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const state = await setupAccounts(page, { saveHandler: async (route) => { await pending; await route.fulfill({ json: { success: true, id: 100, created_count: 6 } }); } });
  await openAdd(page, configurations[1]);
  await fillEntry(page, configurations[1]);
  await advanced(page).locator('summary').click();
  await page.getByLabel('Repeat monthly', { exact: true }).check();
  await addButton(page).evaluate((button) => { button.click(); button.click(); });
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(page.getByRole('button', { name: /Adding/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole('button', { name: /Adding/ })).not.toBeVisible();
  expect(state.writes).toHaveLength(1);
});

test('uncertain schedule saves cannot be retried without first checking the list', async ({ page }) => {
  const state = await setupAccounts(page, { saveHandler: (route) => route.fulfill({ status: 500, json: { error: 'The save could not be confirmed. Check your entries before adding them again.', uncertain: true } }) });
  await openAdd(page, configurations[1]);
  await fillEntry(page, configurations[1]);
  await advanced(page).locator('summary').click();
  await page.getByLabel('Repeat monthly', { exact: true }).check();
  await addButton(page).click();
  await expect(page.locator('p[role="alert"]').filter({ hasText: /could not be confirmed/i })).toBeVisible();
  await expect(addButton(page)).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Close and check entries', exact: true }).click();
  await expect(addButton(page)).not.toBeVisible();
  await expect.poll(() => state.reads).toBeGreaterThan(1);
  expect(state.writes).toHaveLength(1);
});

test('reopening Add resets Advanced and cancels a schedule draft without writes', async ({ page }) => {
  const state = await setupAccounts(page);
  await openAdd(page, configurations[0]);
  await fillEntry(page, configurations[0]);
  await advanced(page).locator('summary').click();
  await page.getByLabel('Repeat monthly', { exact: true }).check();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(advanced(page)).not.toHaveAttribute('open');
  await advanced(page).locator('summary').click();
  await expect(page.getByLabel('Repeat monthly', { exact: true })).not.toBeChecked();
  expect(state.writes).toHaveLength(0);
});

test('Advanced remains usable at 320px without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const state = await setupAccounts(page);
  await openAdd(page, configurations[0]);
  await fillEntry(page, configurations[0]);
  await page.screenshot({ path: testInfo.outputPath('expected-advanced-collapsed-320.png'), fullPage: true });
  await advanced(page).locator('summary').click();
  await page.getByLabel('Repeat monthly', { exact: true }).check();
  await page.getByRole('combobox', { name: 'Repeat until', exact: true }).selectOption({ label: 'End date' });
  await page.getByLabel('End date', { exact: true }).fill('2027-04-30');
  await page.getByRole('spinbutton', { name: /^Add to savings plan \(optional\)/ }).fill('100');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await addButton(page).scrollIntoViewIfNeeded();
  await expect(addButton(page)).toBeInViewport();
  await expect(addButton(page)).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('expected-advanced-expanded-320.png'), fullPage: true });
  expect(state.writes).toHaveLength(0);
});
