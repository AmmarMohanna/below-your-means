import { buildMonthlyDates } from './monthly-series.js';

const TABLES = {
  expectedMoney: { table: 'expected_money', dateField: 'expected_date' },
  payables: { table: 'payables', dateField: 'pay_date' },
};

function nonnegativeAmount(value) {
  const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()));
  const amount = numeric ? Number(value) : NaN;
  return Number.isFinite(amount) && amount >= 0 && amount <= Number.MAX_SAFE_INTEGER / 100 ? amount : null;
}

export function validateExpectedPlan(data) {
  const amount = nonnegativeAmount(data.amount);
  const plannedSaveAmount = data.planned_save_amount === '' || data.planned_save_amount === null || data.planned_save_amount === undefined
    ? 0 : nonnegativeAmount(data.planned_save_amount);
  if (amount === null || plannedSaveAmount === null || plannedSaveAmount > amount) return null;
  return { ...data, amount, planned_save_amount: plannedSaveAmount };
}

export function buildAccountSeriesPlan(table, data) {
  const config = TABLES[table];
  if (!config) throw new Error('Monthly repeat is available for Expected income and Payables only.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Enter valid payment details.');
  if (typeof data.source !== 'string' || !data.source.trim() || data.source.length > 500) throw new Error('Enter a payment source of up to 500 characters.');
  if (data.notes !== undefined && data.notes !== null && (typeof data.notes !== 'string' || data.notes.length > 2000)) throw new Error('Notes must be text of up to 2000 characters.');
  const amount = nonnegativeAmount(data.amount);
  if (amount === null) throw new Error('Enter a valid nonnegative amount.');
  const expectedPlan = table === 'expectedMoney' ? validateExpectedPlan(data) : null;
  if (table === 'expectedMoney' && !expectedPlan) throw new Error('Planned savings must be between zero and the expected amount.');
  const dates = buildMonthlyDates(data[config.dateField], data.monthly_repeat);
  return {
    ...config,
    source: data.source.trim(),
    amount,
    notes: data.notes || null,
    plannedSaveAmount: expectedPlan?.planned_save_amount || 0,
    dates,
  };
}

function auditStatement(db, table, dateField, count) {
  // The names come exclusively from TABLES above, never from request input.
  const legacySavingsField = table === 'expected_money' ? ", 'planned_save_amount', planned_save_amount" : '';
  return db.prepare(`
    INSERT INTO audit_log (table_name, entity_id, action, before_json, after_json, source)
    SELECT ?, id, 'create', NULL,
      json_object('id', id, 'source', source, '${dateField}', ${dateField},
        'amount', amount, 'notes', notes, 'created_at', created_at${legacySavingsField}), 'user'
    FROM (SELECT * FROM ${table} ORDER BY id DESC LIMIT ?)
  `).bind(table, count);
}

// D1.batch executes this complete sequence as one non-interleaved transaction.
// The tables use AUTOINCREMENT and have no insertion triggers. Therefore the
// latest N parent rows are exactly this batch's rows, even after ID gaps/deletes.
// Audit inserts affect only audit_log: no connection-local last_insert_rowid()
// values are used for linking parents to their planned savings.
export async function insertAccountSeries(db, table, data) {
  const plan = buildAccountSeriesPlan(table, data);
  const count = plan.dates.length;
  const statements = [
    db.prepare(`
      INSERT INTO ${plan.table} (source, ${plan.dateField}, amount, notes)
      SELECT ?, value, ?, ? FROM json_each(?) ORDER BY key
      RETURNING id
    `).bind(plan.source, plan.amount, plan.notes, JSON.stringify(plan.dates)),
    auditStatement(db, plan.table, plan.dateField, count),
  ];
  if (table === 'expectedMoney' && plan.plannedSaveAmount > 0) {
    statements.push(
      db.prepare(`
        INSERT INTO savings_plan_items (expected_money_id, source, planned_date, amount, notes, updated_at)
        SELECT id, source, expected_date, ?, notes, CURRENT_TIMESTAMP
        FROM (SELECT * FROM expected_money ORDER BY id DESC LIMIT ?)
      `).bind(plan.plannedSaveAmount, count),
      db.prepare(`
        INSERT INTO audit_log (table_name, entity_id, action, before_json, after_json, source)
        SELECT 'savings_plan_items', id, 'create', NULL,
          json_object('id', id, 'expected_money_id', expected_money_id, 'source', source,
            'planned_date', planned_date, 'amount', amount, 'notes', notes,
            'created_at', created_at, 'updated_at', updated_at), 'user'
        FROM (SELECT * FROM savings_plan_items ORDER BY id DESC LIMIT ?)
      `).bind(count),
    );
  }
  const results = await db.batch(statements);
  const ids = results?.[0]?.results?.map((row) => row.id);
  if (!Array.isArray(results) || results.some((result) => result.success === false) || ids?.length !== count || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new Error('The monthly schedule save could not be confirmed.');
  }
  return { lastInsertRowid: Math.min(...ids), createdCount: count };
}

function response(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function createAccountsPost({ isAuthenticated, addMonthlyAccountSeries, addCurrentMoney, addExpectedMoney, addPayable, addRecurring, addProject }) {
  const addOne = { currentMoney: addCurrentMoney, expectedMoney: addExpectedMoney, payables: addPayable, recurring: addRecurring, projects: addProject };
  return async function POST(request) {
    if (!(await isAuthenticated())) return response({ error: 'Unauthorized' }, 401);
    let body;
    try { body = await request.json(); }
    catch { return response({ error: 'Enter valid payment details.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return response({ error: 'Enter valid payment details.' }, 400);
    const { table, ...data } = body;
    if (!Object.hasOwn(addOne, table)) return response({ error: 'Invalid table' }, 400);
    const repeating = data.monthly_repeat !== null && data.monthly_repeat !== undefined;
    if (repeating) {
      try { buildAccountSeriesPlan(table, data); }
      catch (error) { return response({ error: error.message }, 400); }
    }
    const normalized = table === 'expectedMoney' ? validateExpectedPlan(data) : data;
    if (!normalized) return response({ error: 'Planned savings must be between zero and the expected amount' }, 400);
    try {
      const result = repeating ? await addMonthlyAccountSeries(table, normalized) : await addOne[table](normalized);
      return response({ success: true, id: result.lastInsertRowid, created_count: result.createdCount || 1 });
    } catch {
      // A lost response can follow a successful atomic commit. Do not suggest an
      // automatic retry, which could duplicate the entire monthly schedule.
      return response({ error: 'The save could not be confirmed. Check your entries before adding them again.', uncertain: true }, 500);
    }
  };
}
