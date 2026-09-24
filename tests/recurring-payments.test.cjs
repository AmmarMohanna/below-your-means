// Run with: node --experimental-vm-modules --test tests/recurring-payments.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const root = path.resolve(__dirname, '..');

async function harness(authenticated = true) {
  const sqlite = new Database(':memory:');
  for (const file of readdirSync(path.join(root, 'migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(path.join(root, 'migrations', file), 'utf8'));
  }
  const d1 = {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return sqlite.prepare(sql).get(...params) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...params) }; },
        async run() {
          const result = sqlite.prepare(sql).run(...params);
          return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
        },
      };
    },
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-09-24T10:00:00Z'])); }
  }
  const context = vm.createContext({ Date: FixedDate, console });
  const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  const date = new vm.SourceTextModule(readFileSync(path.join(root, 'src/lib/date.js'), 'utf8'), { context });
  const db = new vm.SourceTextModule(readFileSync(path.join(root, 'src/lib/db.js'), 'utf8'), { context });
  const route = new vm.SourceTextModule(readFileSync(path.join(root, 'src/app/api/accounts/recurring/[id]/payment/route.js'), 'utf8'), { context });
  await date.link(() => {});
  await date.evaluate();
  await db.link(async (name) => {
    if (name === './date.js') return date;
    if (name === './account-series.js') return synthetic(await import(require('node:url').pathToFileURL(path.join(root, 'src/lib/account-series.js'))));
    return synthetic({ getCloudflareContext: () => ({ env: { DB: d1 } }) });
  });
  await db.evaluate();
  await route.link((name) => {
    if (name === '@/lib/db') return db;
    if (name === '@/lib/auth') return synthetic({ isAuthenticated: async () => authenticated });
    return synthetic({ NextResponse: { json: (data, options) => Response.json(data, options) } });
  });
  await route.evaluate();
  const importer = new vm.SourceTextModule(readFileSync(path.join(root, 'src/lib/workbook-import.js'), 'utf8'), { context });
  await importer.link((name) => {
    if (name === './db.js') return db;
    if (name === './date.js') return date;
    return synthetic(require('xlsx'));
  });
  await importer.evaluate();
  return { sqlite, date: date.namespace, db: db.namespace, route: route.namespace, importer: importer.namespace };
}

test('calendar months, leap years, year boundaries, invalid dates, and Beirut midnight', async () => {
  const { date, sqlite } = await harness();
  for (const [paid, expected] of [
    ['2026-09-24', '2026-10-24'], ['2026-01-31', '2026-02-28'],
    ['2028-01-31', '2028-02-29'], ['2026-08-31', '2026-09-30'],
    ['2026-12-24', '2027-01-24'], ['2026-02-28', '2026-03-28'],
  ]) assert.equal(date.getNextMonthlyPaymentDate(paid), expected);
  for (const value of [null, '', '2026-02-30', '2026-13-24', '09/24/2026']) {
    assert.equal(date.getNextMonthlyPaymentDate(value), null);
  }
  assert.equal(date.formatDateBeirut(new Date('2026-09-23T22:30:00Z')), '2026-09-24');
  sqlite.close();
});

test('migration preserves existing recurring entries without marking them paid', () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(readFileSync(path.join(root, 'migrations/0001_initial.sql'), 'utf8'));
  sqlite.exec("INSERT INTO recurring (target, type, amount) VALUES ('Rent', 'Home', 800)");
  const before = sqlite.prepare('SELECT * FROM recurring').get();
  sqlite.exec(readFileSync(path.join(root, 'migrations/0010_recurring_payment_tracking.sql'), 'utf8'));
  assert.deepEqual(sqlite.prepare('SELECT * FROM recurring').get(), { ...before, last_paid_date: null });
  sqlite.close();
});

test('paid persists, retries are idempotent, edits preserve the date, and audit undo restores it', async () => {
  const { db, sqlite } = await harness();
  const { lastInsertRowid: id } = await db.addRecurring({ target: 'Rent', type: 'Home', amount: 800 });
  assert.equal((await db.markRecurringPaid(id)).last_paid_date, '2026-09-24');
  const auditId = sqlite.prepare('SELECT MAX(id) AS id FROM audit_log').get().id;
  await db.markRecurringPaid(id);
  assert.equal(sqlite.prepare('SELECT MAX(id) AS id FROM audit_log').get().id, auditId);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM transactions').get().n, 0);
  await db.updateRecurring(id, { target: 'Rent', type: 'Home', amount: 850 });
  assert.equal((await db.getAllRecurring())[0].last_paid_date, '2026-09-24');
  await db.undoAuditEntry(auditId + 1);
  await db.undoAuditEntry(auditId);
  assert.equal((await db.getAllRecurring())[0].last_paid_date, null);
  sqlite.close();
});

test('backdating and clearing work; impossible and future dates are rejected', async () => {
  const { db, sqlite } = await harness();
  const values = { target: 'Internet', type: 'Home', amount: 30 };
  const { lastInsertRowid: id } = await db.addRecurring({ ...values, last_paid_date: '2026-08-10' });
  for (const value of ['2026-02-30', '2026-09-25', 'garbage']) {
    await assert.rejects(db.updateRecurring(id, { ...values, last_paid_date: value }));
  }
  assert.equal((await db.getAllRecurring())[0].last_paid_date, '2026-08-10');
  await db.updateRecurring(id, { ...values, last_paid_date: '' });
  assert.equal((await db.getAllRecurring())[0].last_paid_date, null);
  sqlite.close();
});

test('payment endpoint validates ids, missing rows, and returns saved state', async () => {
  const { db, route, sqlite } = await harness();
  const request = (id) => route.POST(null, { params: Promise.resolve({ id }) });
  assert.equal((await request('1oops')).status, 400);
  assert.equal((await request('0')).status, 400);
  assert.equal((await request('999')).status, 404);
  const payment = await db.addRecurring({ target: 'Rent', type: 'Home', amount: 800 });
  const response = await request(String(payment.lastInsertRowid));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).item.last_paid_date, '2026-09-24');
  sqlite.close();
});

test('payment endpoint rejects unauthenticated requests', async () => {
  const { route, sqlite } = await harness(false);
  assert.equal((await route.POST(null, { params: Promise.resolve({ id: '1' }) })).status, 401);
  sqlite.close();
});


test('workbook import and JSON backup preserve payment dates; old workbooks remain unmarked', async () => {
  const { db, importer, sqlite } = await harness();
  const XLSX = require('xlsx');
  for (const includeDate of [true, false]) {
    const workbook = XLSX.utils.book_new();
    const headers = ['Target', 'Direction', 'Type', 'Amount'];
    const row = ['Rent', 'Pay', 'Home', 800];
    if (includeDate) { headers.push('Last Paid'); row.push('2026-09-24'); }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, row]), 'Recurring Monthly');
    await importer.importWorkbookBuffer(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    assert.equal((await db.getAllRecurring())[0].last_paid_date, includeDate ? '2026-09-24' : null);
    assert.equal((await db.getDatabaseBackup()).tables.recurring[0].last_paid_date, includeDate ? '2026-09-24' : null);
  }
  sqlite.close();
});


test('unchecking clears the paid date, persists, and is idempotent', async () => {
  const { db, route, sqlite } = await harness();
  const { lastInsertRowid: id } = await db.addRecurring({ target: 'Internet', type: 'Home', amount: 30 });
  await db.markRecurringPaid(id);
  const context = { params: Promise.resolve({ id: String(id) }) };
  const response = await route.DELETE(null, context);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).item.last_paid_date, null);
  assert.equal((await db.getAllRecurring())[0].last_paid_date, null);
  const audits = sqlite.prepare('SELECT count(*) AS n FROM audit_log').get().n;
  await route.DELETE(null, context);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM audit_log').get().n, audits);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM transactions').get().n, 0);
  assert.equal((await route.DELETE(null, { params: Promise.resolve({ id: '999' }) })).status, 404);
  sqlite.close();
});

test('unchecking also requires authentication', async () => {
  const { route, sqlite } = await harness(false);
  assert.equal((await route.DELETE(null, { params: Promise.resolve({ id: '1' }) })).status, 401);
  sqlite.close();
});
