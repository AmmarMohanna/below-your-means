import { createHmac } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const session = createHmac('sha256', 'voice-tests-only-session-secret')
  .update('authenticated:voice-tests-only').digest('hex');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut' }).format(new Date());
const earlier = '2025-01-15';
const ready = (changes = {}) => ({
  status: 'ready',
  transaction: { type: 'expense', amount: 45, currency: 'USD', description: 'Supermarket', scope: 'personal', date: today, ...changes },
  clarification_question: null,
});

async function setup(page, { permissionDenied = false, permissionPending = false, emptyAudio = false, unsupported = false, mp4Only = false, parsed = ready(), transcribeHandler, parseHandler, saveHandler } = {}) {
  const state = { writes: [], parses: [], transcriptions: [], reads: 0, entries: [] };
  await page.context().addCookies([{ name: 'bym_session', value: session, url: 'http://127.0.0.1:4308', httpOnly: true }]);
  await page.addInitScript(({ permissionDenied, permissionPending, emptyAudio, unsupported, mp4Only }) => {
    window.__voiceTest = { tracksStopped: 0, started: 0 };
    if (unsupported) {
      Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: undefined });
      return;
    }
    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(type) { return mp4Only ? type.startsWith('audio/mp4') : type.startsWith('audio/webm'); }
      constructor(stream, options = {}) {
        super();
        this.stream = stream;
        this.mimeType = options.mimeType || (mp4Only ? 'audio/mp4' : 'audio/webm');
        this.state = 'inactive';
      }
      start() { this.state = 'recording'; window.__voiceTest.started += 1; }
      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        queueMicrotask(() => {
          const data = new Blob(emptyAudio ? [] : [new Uint8Array(4096)], { type: this.mimeType });
          const event = new Event('dataavailable');
          Object.defineProperty(event, 'data', { value: data });
          this.ondataavailable?.(event);
          this.dispatchEvent(event);
          const stopped = new Event('stop');
          this.onstop?.(stopped);
          this.dispatchEvent(stopped);
        });
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => {
        if (permissionDenied) throw new DOMException('Permission denied', 'NotAllowedError');
        const stream = { getTracks: () => [{ stop: () => { window.__voiceTest.tracksStopped += 1; } }] };
        if (permissionPending) return new Promise((resolve) => { window.__voiceTest.resolvePermission = () => resolve(stream); });
        return stream;
      },
    } });
  }, { permissionDenied, permissionPending, emptyAudio, unsupported, mp4Only });

  // Fail closed: every API request is handled here. No browser test can write D1
  // or call a provider, including when a route is added to the page later.
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/transactions/transcribe') {
      state.transcriptions.push(request);
      if (transcribeHandler) return transcribeHandler(route, state);
      return route.fulfill({ json: { transcript: 'Paid 45 dollars at the supermarket.' } });
    }
    if (path === '/api/transactions/parse') {
      state.parses.push(request.postDataJSON());
      if (parseHandler) return parseHandler(route, state);
      return route.fulfill({ json: parsed });
    }
    if (path === '/api/transactions' && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.writes.push(body);
      if (saveHandler) return saveHandler(route, state);
      const entry = { ...body, id: state.writes.length };
      state.entries.push(entry);
      return route.fulfill({ json: { success: true, id: entry.id } });
    }
    if (path === '/api/transactions' && request.method() === 'GET') {
      state.reads += 1;
      return route.fulfill({ json: state.entries });
    }
    if (path === '/api/reminders') return route.fulfill({ json: [] });
    if (path === '/api/auth/check') return route.fulfill({ json: { authenticated: true } });
    return route.fulfill({ status: 501, json: { error: `Unexpected mocked endpoint: ${request.method()} ${path}` } });
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'Add entry', exact: true })).toBeVisible();
  return state;
}

async function recordAndReview(page) {
  await page.getByRole('button', { name: 'Record an entry', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review your entry' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const confirm = (dialog) => dialog.getByRole('button', { name: 'Confirm and add', exact: true });

test('recording automatically processes into an editable modal without saving', async ({ page }, testInfo) => {
  const state = await setup(page);
  const dialog = await recordAndReview(page);
  await expect(dialog.getByRole('button', { name: 'Expense', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByLabel('Amount in US dollars', { exact: true })).toHaveValue('45');
  await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('Supermarket');
  await expect(dialog.getByLabel('Entry scope', { exact: true })).toHaveValue('personal');
  await expect(dialog.getByLabel('Entry date', { exact: true })).toHaveValue(today);
  await page.screenshot({ path: testInfo.outputPath('voice-review.png'), fullPage: true });
  expect(state.transcriptions).toHaveLength(1);
  expect(state.parses).toHaveLength(1);
  expect(state.writes).toHaveLength(0);
  expect(await page.evaluate(() => window.__voiceTest.tracksStopped)).toBeGreaterThan(0);
});

test('all direct edits persist once with recomputed income category and refreshed totals', async ({ page }, testInfo) => {
  const state = await setup(page);
  const dialog = await recordAndReview(page);
  await dialog.getByLabel('Amount in US dollars', { exact: true }).fill('501.25');
  await dialog.getByLabel('Description', { exact: true }).fill('edited consulting');
  await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('Edited consulting');
  await dialog.getByRole('button', { name: 'Income', exact: true }).click();
  await dialog.getByLabel('Entry scope', { exact: true }).selectOption('business');
  await dialog.getByLabel('Entry date', { exact: true }).fill(earlier);
  await page.screenshot({ path: testInfo.outputPath('voice-review-edited.png'), fullPage: true });
  expect(state.writes).toHaveLength(0);
  expect(state.parses).toHaveLength(1);
  await confirm(dialog).click();
  await expect(dialog).not.toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ amount: 501.25, notes: 'Edited consulting', type: 'income', scope: 'business', date: earlier, category: 'Income' });
  expect(state.writes[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
  expect(state.reads).toBeGreaterThan(1);
});

test('changing scope recomputes business expense category', async ({ page }) => {
  const state = await setup(page);
  const dialog = await recordAndReview(page);
  await dialog.getByLabel('Entry scope', { exact: true }).selectOption('business');
  await confirm(dialog).click();
  await expect(dialog).not.toBeVisible();
  expect(state.writes[0]).toMatchObject({ type: 'expense', scope: 'business', category: 'Business' });
});

test('Enter in editable fields never confirms or submits the background manual form', async ({ page }) => {
  const state = await setup(page);
  await page.getByLabel('Amount in US dollars', { exact: true }).fill('12');
  await page.getByLabel('Description', { exact: true }).fill('Manual draft');
  const dialog = await recordAndReview(page);
  for (const label of ['Amount in US dollars', 'Description', 'Entry date']) {
    await dialog.getByLabel(label, { exact: true }).focus();
    await page.keyboard.press('Enter');
  }
  await expect(dialog).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test('cancel and Escape restore mic focus and preserve every manual field', async ({ page }) => {
  const state = await setup(page);
  await page.getByLabel('Amount in US dollars', { exact: true }).fill('72.25');
  await page.getByLabel('Description', { exact: true }).fill('Keep manual draft');
  await page.getByRole('button', { name: 'Income', exact: true }).click();
  await page.getByLabel('Entry scope', { exact: true }).selectOption('business');
  await page.getByLabel('Entry date', { exact: true }).fill(earlier);
  let dialog = await recordAndReview(page);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Record an entry', exact: true })).toBeFocused();
  dialog = await recordAndReview(page);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Amount in US dollars', { exact: true })).toHaveValue('72.25');
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Keep manual draft');
  await expect(page.getByRole('button', { name: 'Income', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Entry scope', { exact: true })).toHaveValue('business');
  await expect(page.getByLabel('Entry date', { exact: true })).toHaveValue(earlier);
  expect(state.writes).toHaveLength(0);
});

test('missing and invalid draft fields prevent saving, direct corrections need no model call', async ({ page }) => {
  const state = await setup(page, { parsed: { status: 'needs_clarification', transaction: { ...ready().transaction, amount: null }, clarification_question: 'How much did you pay in USD?' } });
  const dialog = await recordAndReview(page);
  await expect(confirm(dialog)).toBeDisabled();
  await dialog.getByLabel('Amount in US dollars', { exact: true }).fill('-5');
  await expect(confirm(dialog)).toBeDisabled();
  await dialog.getByLabel('Amount in US dollars', { exact: true }).fill('25');
  await dialog.getByLabel('Description', { exact: true }).fill('');
  await expect(confirm(dialog)).toBeDisabled();
  await dialog.getByLabel('Description', { exact: true }).fill('Groceries');
  await dialog.getByLabel('Entry date', { exact: true }).fill('2099-01-01');
  await expect(confirm(dialog)).toBeDisabled();
  await dialog.getByLabel('Entry date', { exact: true }).fill(today);
  await expect(confirm(dialog)).toBeEnabled();
  expect(state.parses).toHaveLength(1);
  await confirm(dialog).click();
  await expect(dialog).not.toBeVisible();
  expect(state.writes[0]).toMatchObject({ amount: 25, notes: 'Groceries', category: 'Other' });
});

test('known rejected save retains edited values and can be explicitly retried', async ({ page }) => {
  const state = await setup(page, { saveHandler: async (route, current) => current.writes.length === 1
    ? route.fulfill({ status: 400, json: { error: 'Please check this entry.' } })
    : route.fulfill({ json: { success: true, id: 1 } }) });
  const dialog = await recordAndReview(page);
  await dialog.getByLabel('Description', { exact: true }).fill('Corrected description');
  await confirm(dialog).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('Corrected description');
  await expect(confirm(dialog)).toBeEnabled();
  expect(state.writes).toHaveLength(1);
  await confirm(dialog).click();
  await expect(dialog).not.toBeVisible();
  expect(state.writes).toHaveLength(2);
});

test('double activation sends exactly one POST and prevents dismissal during save', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const state = await setup(page, { saveHandler: async (route) => { await pending; await route.fulfill({ json: { success: true, id: 1 } }); } });
  const dialog = await recordAndReview(page);
  await confirm(dialog).evaluate((button) => { button.click(); button.click(); });
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(dialog.getByRole('button', { name: /Adding|Saving/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  release();
  await expect(dialog).not.toBeVisible();
  expect(state.writes).toHaveLength(1);
});

test('uncertain save does not offer a duplicate retry', async ({ page }) => {
  const state = await setup(page, { saveHandler: (route) => route.abort('failed') });
  const dialog = await recordAndReview(page);
  await dialog.getByLabel('Description', { exact: true }).fill('Retain after disconnect');
  await confirm(dialog).click();
  await expect(dialog.getByRole('alert')).toContainText(/could not confirm|check your entries/i);
  await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('Retain after disconnect');
  await expect(confirm(dialog)).toBeDisabled();
  expect(state.writes).toHaveLength(1);
});

test('cancel during processing ignores late responses and performs no write', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const state = await setup(page, { transcribeHandler: async (route) => { await pending; await route.fulfill({ json: { transcript: 'Paid 45 dollars at the supermarket.' } }).catch(() => {}); } });
  await page.getByRole('button', { name: 'Record an entry', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect.poll(() => state.transcriptions.length).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  release();
  await expect(page.getByRole('button', { name: 'Record an entry', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog', { name: 'Review your entry' })).not.toBeVisible();
  expect(state.parses).toHaveLength(0);
  expect(state.writes).toHaveLength(0);
  expect(await page.evaluate(() => window.__voiceTest.tracksStopped)).toBeGreaterThan(0);
});

test('transcript edits only replace corrected fields after explicit reinterpretation', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const state = await setup(page, { parseHandler: async (route, current) => {
    if (current.parses.length === 1) return route.fulfill({ json: ready() });
    await pending;
    return route.fulfill({ json: ready({ amount: 60, description: 'Updated transcript' }) });
  } });
  const dialog = await recordAndReview(page);
  await dialog.getByLabel('Amount in US dollars', { exact: true }).fill('99');
  await dialog.getByText('Transcript', { exact: true }).first().click();
  await dialog.getByLabel('Transcript', { exact: true }).fill('Paid 60 for updated transcript');
  await expect(dialog.getByLabel('Amount in US dollars', { exact: true })).toHaveValue('99');
  expect(state.parses).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Interpret again and replace fields', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect.poll(() => state.parses.length).toBe(2);
  await expect(confirm(dialog)).toBeDisabled();
  release();
  await expect(dialog.getByLabel('Amount in US dollars', { exact: true })).toHaveValue('60');
  expect(state.writes).toHaveLength(0);
});

test('phone viewport and short keyboard-height viewport keep modal reachable with trapped focus', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await setup(page);
  const microphone = page.getByRole('button', { name: 'Record an entry', exact: true });
  const manualAdd = page.getByRole('button', { name: 'Add entry', exact: true });
  await expect(page.getByRole('region', { name: 'Voice entry' })).toHaveCount(0);
  await expect(page.getByText('Say one income or expense. Review it before adding.', { exact: true })).toHaveCount(0);
  await expect(microphone).toHaveText('');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 664 });
    await expect(microphone).toBeInViewport({ ratio: 1 });
    const microphoneBox = await microphone.boundingBox();
    const addBox = await manualAdd.boundingBox();
    expect(microphoneBox.width).toBeGreaterThanOrEqual(44);
    expect(microphoneBox.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(microphoneBox.y + microphoneBox.height / 2 - addBox.y - addBox.height / 2)).toBeLessThanOrEqual(2);
    const gap = Math.max(microphoneBox.x - addBox.x - addBox.width, addBox.x - microphoneBox.x - microphoneBox.width);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('today-microphone-320.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 664 });
  await page.screenshot({ path: testInfo.outputPath('today-microphone.png'), fullPage: true });
  const dialog = await recordAndReview(page);
  expect(await dialog.evaluate((element) => element.open && element.matches(':modal'))).toBe(true);
  expect((await dialog.getByLabel('Entry scope', { exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
  for (let index = 0; index < 15; index += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('voice-review-320.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 340 });
  await dialog.getByLabel('Description', { exact: true }).focus();
  await confirm(dialog).scrollIntoViewIfNeeded();
  await expect(confirm(dialog)).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('voice-review-short-viewport.png'), fullPage: true });
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width);
  const dialogSize = await dialog.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  expect(dialogSize.scroll).toBeLessThanOrEqual(dialogSize.width);
});

test('permission denial leaves manual entry usable with no upload', async ({ page }) => {
  const state = await setup(page, { permissionDenied: true });
  await page.getByRole('button', { name: 'Record an entry', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Voice entry' }).getByRole('alert')).toContainText(/microphone|permission/i);
  await page.getByLabel('Amount in US dollars', { exact: true }).fill('8');
  await page.getByLabel('Description', { exact: true }).fill('Manual fallback');
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({ amount: 8, notes: 'Manual fallback', category: 'Other' });
  expect(state.transcriptions).toHaveLength(0);
});

test('empty recording is recoverable without interpretation or saving', async ({ page }) => {
  const state = await setup(page, { emptyAudio: true });
  await page.getByRole('button', { name: 'Record an entry', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Voice entry' }).getByRole('alert')).toContainText(/audio|record|empty|hear/i);
  expect(state.parses).toHaveLength(0);
  expect(state.writes).toHaveLength(0);
});

test('unsupported recording APIs preserve manual fallback', async ({ page }) => {
  const state = await setup(page, { unsupported: true });
  await expect(page.getByText(/recording.*not supported|does not support.*record|Voice unavailable/i)).toBeVisible();
  await page.getByLabel('Amount in US dollars', { exact: true }).fill('8');
  await expect(page.getByRole('button', { name: 'Add entry', exact: true })).toBeEnabled();
  expect(state.writes).toHaveLength(0);
});

test('MP4-only recorders upload the correct extension and content type', async ({ page }) => {
  const state = await setup(page, { mp4Only: true });
  await recordAndReview(page);
  const multipart = state.transcriptions[0].postDataBuffer().toString('utf8');
  expect(multipart).toMatch(/filename="[^"]+\.(mp4|m4a)"/);
  expect(multipart).toContain('Content-Type: audio/mp4');
  expect(state.writes).toHaveLength(0);
});

test('provider failure is visible and permits recording again without a transaction', async ({ page }) => {
  const state = await setup(page, { parseHandler: (route) => route.fulfill({ status: 502, json: { error: 'Could not interpret this recording. Please try again.' } }) });
  await page.getByRole('button', { name: 'Record an entry', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review your entry' });
  await expect(dialog.getByRole('alert')).toContainText(/interpret|try again/i);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record an entry', exact: true })).toBeEnabled();
  expect(state.writes).toHaveLength(0);
});

test('authentication redirects to login when no session exists', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Enter', exact: true })).toBeVisible();
});


test('unauthenticated voice and transaction endpoints reject before processing', async ({ request }) => {
  for (const path of ['/api/transactions/transcribe', '/api/transactions/parse', '/api/transactions']) {
    const response = await request.post(path, { data: {}, maxRedirects: 0 });
    expect([401, 302, 307]).toContain(response.status());
    if (response.status() !== 401) expect(response.headers().location).toMatch(/\/login$/);
  }
});

test('confirmed entry refreshes the visible list and totals', async ({ page }) => {
  const state = await setup(page);
  const dialog = await recordAndReview(page);
  await confirm(dialog).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Supermarket', exact: true })).toBeVisible();
  await expect(page.getByLabel('Daily totals')).toContainText('Paid $45.00');
  await expect(page.getByText('Month out', { exact: true }).locator('..')).toContainText('$45');
  expect(state.writes).toHaveLength(1);
});

test('cancelling recording stops tracks without processing or writing', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Record an entry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record an entry', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.__voiceTest.tracksStopped)).toBeGreaterThan(0);
  expect(state.transcriptions).toHaveLength(0);
  expect(state.writes).toHaveLength(0);
});

test('navigation ends recording and does not leave voice controls on other pages', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Record an entry', exact: true }).click();
  await page.getByRole('link', { name: 'Money', exact: true }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole('button', { name: 'Record an entry', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__voiceTest.tracksStopped)).toBeGreaterThan(0);
  expect(state.transcriptions).toHaveLength(0);
  expect(state.writes).toHaveLength(0);
});

test('edits made during reinterpretation are kept instead of overwritten by stale response', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const state = await setup(page, { parseHandler: async (route, current) => {
    if (current.parses.length === 1) return route.fulfill({ json: ready() });
    await pending;
    return route.fulfill({ json: ready({ amount: 60, description: 'Model replacement' }) });
  } });
  const dialog = await recordAndReview(page);
  await dialog.getByText('Transcript', { exact: true }).first().click();
  await dialog.getByLabel('Transcript', { exact: true }).fill('Paid 60 for updated transcript');
  await dialog.getByRole('button', { name: 'Interpret again and replace fields', exact: true }).click();
  await expect.poll(() => state.parses.length).toBe(2);
  await dialog.getByLabel('Amount in US dollars', { exact: true }).fill('123');
  await dialog.getByLabel('Description', { exact: true }).fill('Newest user correction');
  release();
  await expect(dialog.getByText(/newer edits were kept/i)).toBeVisible();
  await expect(dialog.getByLabel('Amount in US dollars', { exact: true })).toHaveValue('123');
  await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('Newest user correction');
  await expect(confirm(dialog)).toBeEnabled();
  expect(state.writes).toHaveLength(0);
});

test('canceled interpretation cannot replace the next recording draft', async ({ page }) => {
  let release;
  let completed;
  const pending = new Promise((resolve) => { release = resolve; });
  const done = new Promise((resolve) => { completed = resolve; });
  const state = await setup(page, { parseHandler: async (route, current) => {
    if (current.parses.length === 2) {
      await pending;
      await route.fulfill({ json: ready({ amount: 500, description: 'Canceled response' }) }).catch(() => {});
      completed();
      return;
    }
    return route.fulfill({ json: ready({ amount: current.parses.length === 3 ? 70 : 45 }) });
  } });
  let dialog = await recordAndReview(page);
  await dialog.getByText('Transcript', { exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Interpret again and replace fields', exact: true }).click();
  await expect.poll(() => state.parses.length).toBe(2);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  dialog = await recordAndReview(page);
  await expect(dialog.getByLabel('Amount in US dollars', { exact: true })).toHaveValue('70');
  release();
  await done;
  await expect(dialog.getByLabel('Amount in US dollars', { exact: true })).toHaveValue('70');
  expect(state.writes).toHaveLength(0);
});

test('existing manual entry still saves its exact values and refreshes the list', async ({ page }) => {
  const state = await setup(page);
  await page.getByLabel('Amount in US dollars', { exact: true }).fill('300.50');
  await page.getByLabel('Description', { exact: true }).fill('manual consulting income');
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Manual consulting income');
  await page.getByRole('button', { name: 'Income', exact: true }).click();
  await page.getByLabel('Entry scope', { exact: true }).selectOption('business');
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manual consulting income Business', exact: true })).toBeVisible();
  await expect(page.getByLabel('Daily totals')).toContainText('Received $300.50');
  await expect(page.getByLabel('Amount in US dollars', { exact: true })).toHaveValue('');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ amount: 300.5, notes: 'Manual consulting income', type: 'income', scope: 'business', category: 'Income', date: today });
  expect(state.transcriptions).toHaveLength(0);
});


test('authenticated voice routes report missing local key without a provider call', async ({ request }) => {
  // A future local .dev.vars may contain a real secret that takes precedence
  // over process.env. Never send this probe when a Wrangler secret file exists.
  test.skip(readdirSync('.').some((name) => (name === '.dev.vars' || name.startsWith('.dev.vars.')) && !name.endsWith('.example')), 'Local Wrangler secrets exist; skip no-key probe.');
  for (const path of ['/api/transactions/transcribe', '/api/transactions/parse']) {
    const response = await request.post(path, {
      headers: { Cookie: `bym_session=${session}` },
      data: {},
      maxRedirects: 0,
    });
    expect(response.status()).toBe(503);
    expect((await response.json()).error).toMatch(/not configured/i);
  }
});


test('the sixty-second recording limit automatically stops and processes without saving', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const state = await setup(page);
  await page.getByRole('button', { name: 'Record an entry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole('dialog', { name: 'Review your entry' })).toBeVisible();
  expect(state.transcriptions).toHaveLength(1);
  expect(state.writes).toHaveLength(0);
  expect(await page.evaluate(() => window.__voiceTest.tracksStopped)).toBeGreaterThan(0);
});

test('a malformed successful save response locks retry as an uncertain write', async ({ page }) => {
  const state = await setup(page, { saveHandler: (route) => route.fulfill({ json: { unexpected: true } }) });
  const dialog = await recordAndReview(page);
  await confirm(dialog).click();
  await expect(dialog.getByRole('alert')).toContainText(/could not confirm|check your entries/i);
  await expect(confirm(dialog)).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Close and check entries', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.reads).toBeGreaterThan(1);
  expect(state.writes).toHaveLength(1);
});

test('permission resolving after cancellation immediately stops tracks without recording', async ({ page }) => {
  const state = await setup(page, { permissionPending: true });
  await page.getByRole('button', { name: 'Record an entry', exact: true }).click();
  await expect(page.getByText('Waiting for microphone access…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => window.__voiceTest.resolvePermission());
  await expect.poll(() => page.evaluate(() => window.__voiceTest.tracksStopped)).toBe(1);
  expect(await page.evaluate(() => window.__voiceTest.started)).toBe(0);
  expect(state.transcriptions).toHaveLength(0);
  expect(state.writes).toHaveLength(0);
});
