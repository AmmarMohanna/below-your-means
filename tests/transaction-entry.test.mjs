import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransactionPayload, validateEntryFields, isValidEntryDate } from '../src/lib/transaction-entry.js';
import { createTransactionPost } from '../src/lib/transaction-post.js';
import { getTodayBeirut } from '../src/lib/date.js';

const draft = { type: 'expense', amount: 45, currency: 'USD', description: 'Supermarket', scope: 'personal', date: '2026-01-01' };
const body = { amount: 45, type: 'expense', scope: 'personal', notes: 'Supermarket', date: '2026-01-01' };
const request = (value = body, headers = {}) => new Request('https://example.test/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });

test('the current entry date uses Beirut across the UTC midnight boundary', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-18T22:30:00Z') });
  assert.equal(getTodayBeirut(), '2026-09-19');
  assert.equal(isValidEntryDate('2026-09-19'), true);
  assert.equal(isValidEntryDate('2026-09-20'), false);
});

test('edited values map exactly to persistence and category is recomputed', () => {
  const edited = { ...draft, type: 'income', amount: '512.35', scope: 'business', description: '  Consulting  ', date: '2026-02-02' };
  const { created_at, ...payload } = buildTransactionPayload(edited);
  assert.deepEqual(payload, { type: 'income', amount: 512.35, scope: 'business', notes: 'Consulting', date: '2026-02-02', category: 'Income' });
  assert.match(created_at, /^\d{4}-\d{2}-\d{2} /);
  assert.equal(buildTransactionPayload({ ...draft, scope: 'business' }).category, 'Business');
  assert.equal(buildTransactionPayload(draft).category, 'Other');
});

test('invalid and unresolved fields cannot produce save payloads', () => {
  for (const amount of [null, true, [], '', ' ', '0x10', '1e3', '1,200', -1, 0, NaN, Infinity, 1.234]) {
    assert.ok(validateEntryFields({ ...draft, amount }).amount, String(amount));
  }
  for (const [key, value] of [['type', null], ['type', 'transfer'], ['scope', 'other'], ['date', '2026-02-30'], ['date', '2999-01-01'], ['description', ''], ['description', 'x'.repeat(501)], ['currency', 'LBP']]) {
    assert.ok(validateEntryFields({ ...draft, [key]: value })[key]);
    assert.throws(() => buildTransactionPayload({ ...draft, [key]: value }));
  }
  assert.equal(isValidEntryDate('2024-02-29', '2026-01-01'), true);
  assert.equal(isValidEntryDate('2025-02-29', '2026-01-01'), false);
  assert.deepEqual(validateEntryFields({ ...draft, amount: '0.29' }), {});
});

test('POST authenticates before reading or writing', async () => {
  let writes = 0;
  const post = createTransactionPost({ isAuthenticated: async () => false, addTransaction: async () => writes++ });
  assert.equal((await post(request())).status, 401);
  assert.equal(writes, 0);
});

test('POST validates values, preserves optional manual description, ignores supplied category and timestamp', async () => {
  const writes = [];
  const post = createTransactionPost({ isAuthenticated: async () => true, addTransaction: async value => { writes.push(value); return { lastInsertRowid: 9 }; } });
  for (const data of [null, [], { ...body, amount: true }, { ...body, type: 'transfer' }, { ...body, scope: 'wrong' }, { ...body, date: '2026-02-30' }, { ...body, notes: 'x'.repeat(501) }]) {
    assert.equal((await post(request(data))).status, 400);
  }
  assert.equal(writes.length, 0);
  const response = await post(request({ ...body, notes: '', category: 'Invented', created_at: 'future' }));
  assert.deepEqual(await response.json(), { success: true, id: 9 });
  assert.equal(writes[0].notes, '');
  assert.equal(writes[0].category, 'Other');
  assert.notEqual(writes[0].created_at, 'future');
});

test('POST rejects oversized and malformed JSON without a write', async () => {
  let writes = 0;
  const post = createTransactionPost({ isAuthenticated: async () => true, addTransaction: async () => writes++ });
  assert.equal((await post(request({ ...body, notes: 'x'.repeat(9000) }))).status, 413);
  assert.equal((await post(new Request('https://example.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal((await post(request(body, { 'Content-Type': 'application/jsonjunk' }))).status, 415);
  assert.equal(writes, 0);
});

test('POST failures are sanitized and identify an uncertain write without retrying', async () => {
  let writes = 0;
  const post = createTransactionPost({ isAuthenticated: async () => true, addTransaction: async () => { writes++; throw new Error('secret financial value'); } });
  const response = await post(request());
  assert.equal(response.status, 500);
  const value = await response.json();
  assert.equal(value.uncertain, true);
  assert.doesNotMatch(JSON.stringify(value), /secret financial/);
  assert.equal(writes, 1);
});
