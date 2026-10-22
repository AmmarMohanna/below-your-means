import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { buildAccountSeriesPlan, createAccountsPost, insertAccountSeries } from '../src/lib/account-series.js';

function makeDatabase(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(name, migrations), 'utf8'));
  t.after(() => sqlite.close());
  const batches = [];
  const db = {
    prepare(sql) { return { bind(...params) { return { sql, params }; } }; },
    async batch(statements) {
      batches.push(statements);
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(({ sql, params }) => {
          const rows = sqlite.prepare(sql).all(...params);
          const meta = sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
          return { success: true, results: rows, meta };
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, db, batches };
}

function expected(overrides = {}) {
  return { source: 'Consulting', expected_date: '2026-01-31', amount: 500, planned_save_amount: 100, notes: 'Monthly work', monthly_repeat: { end_type: 'count', count: 3 }, ...overrides };
}
function payable(overrides = {}) {
  return { source: 'Rent', pay_date: '2026-01-31', amount: 200, notes: 'Apartment', monthly_repeat: { end_type: 'count', count: 3 }, ...overrides };
}
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map((row) => ({ ...row }));

test('expected series creates each occurrence, linked savings and faithful audit rows in one atomic batch', async (t) => {
  const { sqlite, db, batches } = makeDatabase(t);
  const result = await insertAccountSeries(db, 'expectedMoney', expected());
  assert.deepEqual(result, { lastInsertRowid: 1, createdCount: 3 });
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 4);
  const parents = rows(sqlite, 'expected_money');
  assert.deepEqual(parents.map((row) => row.expected_date), ['2026-01-31', '2026-02-28', '2026-03-31']);
  const savings = rows(sqlite, 'savings_plan_items');
  assert.equal(savings.length, 3);
  for (const item of savings) {
    const parent = parents.find((row) => row.id === item.expected_money_id);
    assert.equal(item.source, parent.source);
    assert.equal(item.planned_date, parent.expected_date);
    assert.equal(item.amount, 100);
    assert.equal(item.notes, parent.notes);
  }
  const audits = rows(sqlite, 'audit_log');
  assert.equal(audits.length, 6);
  for (const audit of audits) {
    const sourceRows = audit.table_name === 'expected_money' ? parents : savings;
    assert.deepEqual(JSON.parse(audit.after_json), sourceRows.find((row) => row.id === audit.entity_id));
    assert.equal(audit.action, 'create');
    assert.equal(audit.before_json, null);
  }
  assert.equal(rows(sqlite, 'transactions').length, 0);
});

test('payables create only planned payments and audit rows, with an inclusive end date', async (t) => {
  const { sqlite, db, batches } = makeDatabase(t);
  await insertAccountSeries(db, 'payables', payable({ monthly_repeat: { end_type: 'date', end_date: '2026-03-30' } }));
  assert.deepEqual(rows(sqlite, 'payables').map((row) => row.pay_date), ['2026-01-31', '2026-02-28']);
  assert.equal(rows(sqlite, 'audit_log').length, 2);
  assert.equal(rows(sqlite, 'savings_plan_items').length, 0);
  assert.equal(rows(sqlite, 'transactions').length, 0);
  assert.equal(batches[0].length, 2);
});

test('zero planned savings creates no savings rows and maximum120 series stays a four-statement batch', async (t) => {
  const { sqlite, db, batches } = makeDatabase(t);
  await insertAccountSeries(db, 'expectedMoney', expected({ planned_save_amount: 0 }));
  assert.equal(rows(sqlite, 'savings_plan_items').length, 0);
  assert.equal(batches[0].length, 2);
  const result = await insertAccountSeries(db, 'expectedMoney', expected({ monthly_repeat: { end_type: 'count', count: 120 } }));
  assert.equal(result.createdCount, 120);
  assert.equal(batches[1].length, 4);
  assert.equal(rows(sqlite, 'expected_money').length, 123);
  assert.equal(rows(sqlite, 'savings_plan_items').length, 120);
});

test('ID gaps, unrelated savings and high audit IDs cannot mislink new occurrences', async (t) => {
  const { sqlite, db } = makeDatabase(t);
  sqlite.exec(`
    INSERT INTO expected_money (id,source,expected_date,amount) VALUES (100,'Existing','2025-01-01',100),(900,'Deleted','2025-01-02',100);
    DELETE FROM expected_money WHERE id=900;
    INSERT INTO savings_plan_items (id,source,amount) VALUES (2000,'Independent',50);
    INSERT INTO audit_log (id,table_name,entity_id,action,source) VALUES (9000,'expected_money',100,'create','user');
  `);
  const result = await insertAccountSeries(db, 'expectedMoney', expected());
  assert.equal(result.lastInsertRowid, 901);
  assert.deepEqual(rows(sqlite, 'savings_plan_items').filter((row) => row.expected_money_id !== null).map((row) => row.expected_money_id).sort(), [901, 902, 903]);
  assert.equal(rows(sqlite, 'expected_money').find((row) => row.id === 100).source, 'Existing');
  assert.equal(rows(sqlite, 'savings_plan_items')[0].source, 'Independent');
});

test('an error in savings or either audit stage rolls back parents, savings and all audit rows', async (t) => {
  for (const failureTable of ['savings_plan_items', 'audit_log']) {
    const { sqlite, db } = makeDatabase(t);
    const condition = failureTable === 'audit_log' ? "WHEN NEW.table_name = 'savings_plan_items'" : '';
    sqlite.exec(`CREATE TRIGGER fail_series BEFORE INSERT ON ${failureTable} ${condition} BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
    await assert.rejects(insertAccountSeries(db, 'expectedMoney', expected()), /forced failure/);
    for (const table of ['expected_money', 'savings_plan_items', 'audit_log', 'transactions']) assert.equal(rows(sqlite, table).length, 0);
  }
  const { sqlite, db } = makeDatabase(t);
  sqlite.exec("CREATE TRIGGER fail_parent_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'forced failure'); END;");
  await assert.rejects(insertAccountSeries(db, 'payables', payable()), /forced failure/);
  assert.equal(rows(sqlite, 'payables').length, 0);
  assert.equal(rows(sqlite, 'audit_log').length, 0);
});

test('all user strings are bound and audit JSON preserves quotes and Arabic', async (t) => {
  const { sqlite, db } = makeDatabase(t);
  const source = "Consulting '); DROP TABLE transactions; -- استشارة";
  await insertAccountSeries(db, 'expectedMoney', expected({ source, notes: 'A "quoted" note\nline' }));
  assert.equal(rows(sqlite, 'expected_money')[0].source, source);
  assert.equal(JSON.parse(rows(sqlite, 'audit_log')[0].after_json).source, source);
  assert.deepEqual(rows(sqlite, 'transactions'), []);
});

test('invalid schedule or money/source data produces no batch or partial rows', async (t) => {
  const { db, batches } = makeDatabase(t);
  for (const data of [expected({ source: '' }), expected({ amount: -1 }), expected({ amount: null }), expected({ amount: Infinity }), expected({ planned_save_amount: 501 }), expected({ planned_save_amount: -1 }), expected({ notes: {} }), expected({ monthly_repeat: { end_type: 'count', count: 121 } }), expected({ expected_date: '2026-02-30' })]) {
    await assert.rejects(insertAccountSeries(db, 'expectedMoney', data));
  }
  assert.throws(() => buildAccountSeriesPlan('currentMoney', expected()), /Expected income and Payables/);
  assert.equal(batches.length, 0);
});

function makePost({ authenticated = true, failure } = {}) {
  const calls = [];
  const add = (name) => async (...args) => { calls.push({ name, args }); if (failure) throw failure; return { lastInsertRowid: 42, createdCount: name === 'series' ? 3 : 1 }; };
  return { calls, post: createAccountsPost({ isAuthenticated: async () => authenticated, addMonthlyAccountSeries: add('series'), addExpectedMoney: add('expected'), addPayable: add('payable'), addCurrentMoney: add('current'), addRecurring: add('recurring'), addProject: add('project') }) };
}
function request(data) { return new Request('https://example.test/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); }

test('accounts endpoint authenticates before reading data or creating a series', async () => {
  const { post, calls } = makePost({ authenticated: false });
  const result = await post({ json() { throw new Error('must not read'); } });
  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test('accounts endpoint routes recurring creates once and returns count plus first ID', async () => {
  const { post, calls } = makePost();
  const result = await post(request({ table: 'expectedMoney', ...expected() }));
  assert.deepEqual(await result.json(), { success: true, id: 42, created_count: 3 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'series');
  assert.equal(calls[0].args[0], 'expectedMoney');
  assert.equal(calls[0].args[1].planned_save_amount, 100);
});

test('ordinary single adds retain existing writers when monthly repeat is absent or null', async () => {
  for (const monthly_repeat of [undefined, null]) {
    const { post, calls } = makePost();
    const result = await post(request({ table: 'expectedMoney', ...expected({ monthly_repeat }) }));
    assert.equal(result.status, 200);
    assert.equal(calls[0].name, 'expected');
    assert.equal(calls.length, 1);
  }
});

test('bad count/date and unsupported repeat tables fail before any writer', async () => {
  for (const body of [
    { table: 'expectedMoney', ...expected({ monthly_repeat: { end_type: 'count' } }) },
    { table: 'payables', ...payable({ monthly_repeat: { end_type: 'date', end_date: '2025-01-01' } }) },
    { table: 'currentMoney', ...expected() }, { table: 'savings', ...expected() },
    { table: 'expectedMoney', ...expected({ monthly_repeat: false }) },
  ]) {
    const { post, calls } = makePost();
    assert.equal((await post(request(body))).status, 400);
    assert.equal(calls.length, 0);
  }
});

test('a lost batch response is marked uncertain and is not automatically retried', async () => {
  const { post, calls } = makePost({ failure: new Error('private SQL details') });
  const result = await post(request({ table: 'expectedMoney', ...expected() }));
  assert.equal(result.status, 500);
  const data = await result.json();
  assert.equal(data.uncertain, true);
  assert.doesNotMatch(data.error, /private SQL/);
  assert.equal(calls.length, 1);
});
