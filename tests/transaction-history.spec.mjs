import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';

const session = createHmac('sha256', 'voice-tests-only-session-secret')
  .update('authenticated:voice-tests-only').digest('hex');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut' }).format(new Date());
const datedEntries = [
  [today, 'Today coffee', 'expense', 4.5],
  ['2025-03-15', 'March consulting', 'income', 900.25],
  ['2025-03-15', 'March groceries', 'expense', 35.5],
  ['2025-03-03', 'March train', 'expense', 12],
  ['2025-02-27', 'February lunch', 'expense', 18],
  ['2025-02-20', 'February tutoring', 'income', 100],
  ['2025-02-11', 'February bus', 'expense', 3],
  ['2025-02-01', 'February supplies', 'expense', 45],
  ['2025-01-29', 'January refund', 'income', 20],
  ['2025-01-14', 'January groceries', 'expense', 55],
  ['2025-01-02', 'January fare', 'expense', 7],
];
const transactions = datedEntries.map(([date, notes, type, amount], index) => ({
  id: index + 1, date, notes, type, amount, scope: 'personal',
  category: type === 'income' ? 'Income' : 'Other', created_at: `${date} 12:00:00`,
}));

async function setup(page, { entries = transactions, path = '/dashboard' } = {}) {
  const state = { writes: [], unexpected: [] };
  await page.context().addCookies([
    { name: 'bym_session', value: session, url: 'http://127.0.0.1:4308', httpOnly: true },
  ]);
  // Fail closed: these checks cannot reach a database or external provider.
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      if (pathname === '/api/transactions') return route.fulfill({ json: entries });
      if (pathname === '/api/reminders') return route.fulfill({ json: [] });
      if (pathname === '/api/auth/check') return route.fulfill({ json: { authenticated: true } });
      if (pathname === '/api/accounts') return route.fulfill({ json: {
        currentMoney: [], expectedMoney: [], payables: [], recurring: [],
        projects: [{ id: 99, description: 'Saved project', estimated_amount: 400, target_date: '2027-01-01', rank: 1 }],
      } });
      if (pathname === '/api/metals') return route.fulfill({ json: {
        holdings: { gold_24k_grams: 0, gold_21k_grams: 0, silver_kg: 0 },
        prices: { gold_24k_per_gram: 85, gold_21k_per_gram: 74.4, silver_per_kg: 950, source: 'manual' },
        values: { gold_24k: 0, gold_21k: 0, silver: 0, total: 0 },
        longTermSavings: { aub_pension_amount: 0, cash_savings_amount: 0 },
      } });
      if (pathname === '/api/savings-plan') return route.fulfill({ json: { items: [], summary: { planned: 0, item_count: 0 } } });
    } else {
      state.writes.push({ method: request.method(), pathname });
    }
    state.unexpected.push(`${request.method()} ${pathname}`);
    return route.fulfill({ status: 501, json: { error: 'Unexpected mocked request' } });
  });
  await page.goto(path);
  await expect(page.getByRole('heading', { name: path === '/accounts' ? 'Money' : 'Today', exact: true })).toBeVisible();
  return state;
}

const historyButton = (page) => page.getByRole('button', { name: 'History', exact: true });
const dayButton = (page) => page.getByRole('button', { name: 'Day', exact: true });
const datePicker = (page) => page.getByLabel('Show entries for date', { exact: true });
const rows = (page) => page.locator('article');

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('History groups earlier income and expenses without visiting empty days', async ({ page }, testInfo) => {
  const state = await setup(page);
  await expect(dayButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(1);
  await historyButton(page).click();
  await expect(historyButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('History month', { exact: true })).toHaveValue('');
  await expect(page.getByRole('heading', { level: 2 }).filter({ hasText: /15 Mar 2025/ })).toHaveCount(1);
  await expect(page.getByText('March consulting', { exact: true })).toBeVisible();
  await expect(page.getByText('March groceries', { exact: true })).toBeVisible();
  await expect(page.getByText('Received $900.25', { exact: true })).toBeVisible();
  await expect(page.getByText('Paid $35.50', { exact: true })).toBeVisible();
  await expect(page.getByText('No entries for this day.', { exact: true })).toHaveCount(0);
  await expect(rows(page)).toHaveCount(8);
  await expect(page.getByLabel('Entry date', { exact: true })).toHaveValue(today);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('transaction-history.png'), fullPage: true });
  expect(state.writes).toHaveLength(0);
  expect(state.unexpected).toHaveLength(0);
});

test('History loads older days and filters directly to a selected month', async ({ page }) => {
  const state = await setup(page);
  await historyButton(page).click();
  const earlierButton = page.getByRole('button', { name: 'Show earlier entries', exact: true });
  await expect(page.getByText('January refund', { exact: true })).toHaveCount(0);
  await earlierButton.click();
  await expect(rows(page)).toHaveCount(11);
  await expect(page.getByText('January fare', { exact: true })).toBeVisible();
  await expect(earlierButton).toHaveCount(0);
  await page.getByLabel('History month', { exact: true }).selectOption('2025-01');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('span').filter({ hasText: /^January 2025$/ })).toBeVisible();
  await expect(page.getByText('Month in', { exact: true }).locator('..').locator('strong')).toHaveText('$20');
  await expect(page.getByText('Month out', { exact: true }).locator('..').locator('strong')).toHaveText('$62');
  await expect(page.getByText('March groceries', { exact: true })).toHaveCount(0);
  await expect(page.getByText('January refund', { exact: true })).toBeVisible();
  await expect(earlierButton).toHaveCount(0);
  await expect(page.getByLabel('Entry date', { exact: true })).toHaveValue(today);
  await page.getByLabel('History month', { exact: true }).selectOption('');
  await expect(rows(page)).toHaveCount(8);
  await expect(earlierButton).toBeVisible();
  expect(state.writes).toHaveLength(0);
  expect(state.unexpected).toHaveLength(0);
});

test('Day controls jump to a date, move by one day, and return to Today', async ({ page }, testInfo) => {
  const state = await setup(page);
  await expect(datePicker(page)).toBeVisible();
  await expect(datePicker(page)).toHaveValue(today);
  await expect(page.getByRole('button', { name: 'Next day', exact: true })).toBeDisabled();
  await datePicker(page).fill('2025-03-15');
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByLabel('Entry date', { exact: true })).toHaveValue('2025-03-15');
  await expect(page.getByText('Received $900.25', { exact: true })).toBeVisible();
  await expect(page.getByText('Paid $35.50', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous day', exact: true }).click();
  await expect(datePicker(page)).toHaveValue('2025-03-14');
  await expect(page.getByText('No entries for this day.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(datePicker(page)).toHaveValue('2025-03-15');
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('transaction-date-navigation.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 });
  await expectNoOverflow(page);
  await historyButton(page).click();
  await expectNoOverflow(page);
  await page.getByLabel('History month', { exact: true }).selectOption('2025-01');
  await dayButton(page).click();
  await expect(datePicker(page)).toHaveValue('2025-03-15');
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(datePicker(page)).toHaveValue(today);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Next day', exact: true })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});

test('changing the day clears selected entries before another delete is possible', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Select Today coffee', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete selected', exact: true })).toBeVisible();
  await datePicker(page).fill('2025-03-15');
  await expect(page.getByRole('button', { name: 'Delete selected', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select March consulting', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Select March consulting', exact: true }).click();
  await historyButton(page).click();
  await expect(page.getByRole('button', { name: 'Delete selected', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select', exact: true }).first().click();
  await page.getByRole('button', { name: 'Select Today coffee', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete selected', exact: true })).toBeVisible();
  await page.getByLabel('History month', { exact: true }).selectOption('2025-01');
  await expect(page.getByRole('button', { name: 'Delete selected', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select January refund', exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test('a future date cannot change the active day or the entry date', async ({ page }) => {
  const state = await setup(page);
  await expect(datePicker(page)).toHaveAttribute('max', today);
  await datePicker(page).fill('2099-01-01');
  await expect(datePicker(page)).toHaveValue(today);
  await expect(page.getByLabel('Entry date', { exact: true })).toHaveValue(today);
  await expect(page.getByText('Today coffee', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test('an empty History remains usable and makes no writes', async ({ page }) => {
  const state = await setup(page, { entries: [] });
  await historyButton(page).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show earlier entries', exact: true })).toHaveCount(0);
  await expectNoOverflow(page);
  await dayButton(page).click();
  await expect(datePicker(page)).toHaveValue(today);
  await expect(page.getByText('No entries for this day.', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  expect(state.unexpected).toHaveLength(0);
});

test('Money shows its five areas without Projects or project mutations', async ({ page }, testInfo) => {
  const state = await setup(page, { path: '/accounts' });
  const areas = page.getByRole('navigation', { name: 'Money areas', exact: true });
  await expect(areas.getByRole('button')).toHaveCount(5);
  for (const name of ['Current', 'Expected', 'Payables', 'Monthly', 'Savings']) {
    await expect(areas.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Projects', exact: true })).toHaveCount(0);
  await expect(page.getByText('Saved project', { exact: true })).toHaveCount(0);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('money-without-projects.png'), fullPage: true });
  expect(state.writes).toHaveLength(0);
  expect(state.unexpected).toHaveLength(0);
});
