import { getCloudflareContext } from '@opennextjs/cloudflare';

const orderedAccountConfig = {
  currentMoney: {
    table: 'current_money',
    orderField: 'created_at',
    orderBy: 'created_at DESC, id DESC',
    valueType: 'timestamp',
  },
  expectedMoney: {
    table: 'expected_money',
    orderField: 'expected_date',
    orderBy: 'expected_date ASC, id ASC',
    valueType: 'date',
  },
  payables: {
    table: 'payables',
    orderField: 'pay_date',
    orderBy: 'pay_date ASC, id ASC',
    valueType: 'date',
  },
};

export function normalizeScope(scope) {
  return scope === 'business' ? 'business' : 'personal';
}

function getTransactionCategory(type, scope) {
  if (type === 'income') return 'Income';
  return normalizeScope(scope) === 'business' ? 'Business' : 'Other';
}

function buildCompletionNotes(label, notes) {
  return [label, notes].filter(Boolean).join(' • ');
}

export function getDb() {
  return getCloudflareContext().env.DB;
}

export async function runWithoutAudit(callback) {
  return callback();
}

function prepare(sql, params = []) {
  const statement = getDb().prepare(sql);
  return params.length > 0 ? statement.bind(...params) : statement;
}

export async function runSql(sql, params = []) {
  const result = await prepare(sql, params).run();
  return {
    changes: result.meta?.changes || 0,
    lastInsertRowid: result.meta?.last_row_id || 0,
    meta: result.meta,
  };
}

export async function allSql(sql, params = []) {
  const result = await prepare(sql, params).all();
  return result.results || [];
}

export async function firstSql(sql, params = []) {
  return (await prepare(sql, params).first()) || null;
}

function parseJsonColumn(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function getTableColumns(tableName) {
  const columns = await allSql(`PRAGMA table_info(${tableName})`);
  return columns.map((column) => column.name);
}

async function getRowById(tableName, id) {
  return firstSql(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
}

async function getCurrentTimestamp() {
  const row = await firstSql('SELECT CURRENT_TIMESTAMP AS now');
  return row.now;
}

async function logAudit(tableName, action, beforeRow, afterRow, source = 'user') {
  const entityId = afterRow?.id ?? beforeRow?.id ?? null;

  await runSql(
    `
      INSERT INTO audit_log (table_name, entity_id, action, before_json, after_json, source)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      tableName,
      entityId,
      action,
      beforeRow ? JSON.stringify(beforeRow) : null,
      afterRow ? JSON.stringify(afterRow) : null,
      source,
    ]
  );
}

async function insertRow(tableName, data, source = 'user') {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  const columns = entries.map(([column]) => column);
  const placeholders = columns.map(() => '?').join(', ');
  const values = entries.map(([, value]) => value);

  const result = await runSql(
    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  const afterRow = await getRowById(tableName, result.lastInsertRowid);
  await logAudit(tableName, 'create', null, afterRow, source);
  return result;
}

async function updateRow(tableName, id, data, source = 'user') {
  const beforeRow = await getRowById(tableName, id);
  if (!beforeRow) {
    return { changes: 0 };
  }

  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return { changes: 0 };
  }

  const setClause = entries.map(([column]) => `${column} = ?`).join(', ');
  const values = entries.map(([, value]) => value);

  const result = await runSql(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, [
    ...values,
    id,
  ]);

  if (result.changes) {
    const afterRow = await getRowById(tableName, id);
    await logAudit(tableName, 'update', beforeRow, afterRow, source);
  }

  return result;
}

async function deleteRow(tableName, id, source = 'user') {
  const beforeRow = await getRowById(tableName, id);
  if (!beforeRow) {
    return { changes: 0 };
  }

  const result = await runSql(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
  if (result.changes) {
    await logAudit(tableName, 'delete', beforeRow, null, source);
  }
  return result;
}

async function restoreRow(tableName, row, source = 'undo') {
  const columns = (await getTableColumns(tableName)).filter((column) =>
    Object.prototype.hasOwnProperty.call(row, column)
  );
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => row[column]);
  const existingRow = row.id ? await getRowById(tableName, row.id) : null;

  await runSql(
    `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  const afterRow = row.id ? await getRowById(tableName, row.id) : row;
  await logAudit(tableName, existingRow ? 'update' : 'create', existingRow, afterRow, source);
}

async function updateSingletonRow(tableName, data, source = 'user') {
  const beforeRow = await firstSql(`SELECT * FROM ${tableName} WHERE id = 1`);
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return { changes: 0 };
  }

  const setClause = entries.map(([column]) => `${column} = ?`).join(', ');
  const values = entries.map(([, value]) => value);
  const result = await runSql(`UPDATE ${tableName} SET ${setClause} WHERE id = 1`, values);

  if (result.changes) {
    const afterRow = await firstSql(`SELECT * FROM ${tableName} WHERE id = 1`);
    await logAudit(tableName, 'update', beforeRow, afterRow, source);
  }

  return result;
}

function addDays(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day, 12));
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

async function addSeconds(dateTimeText, seconds) {
  const modifier = `${seconds >= 0 ? '+' : ''}${seconds} seconds`;
  const row = await firstSql('SELECT datetime(?, ?) AS value', [dateTimeText, modifier]);
  return row.value;
}

export async function getAllTransactions() {
  const rows = await allSql(
    'SELECT * FROM transactions ORDER BY date DESC, created_at DESC, id DESC'
  );
  return rows.map((row) => ({ ...row, scope: normalizeScope(row.scope) }));
}

export async function getTransactionsByDateRange(startDate, endDate) {
  const rows = await allSql(
    `
      SELECT * FROM transactions
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC, created_at DESC, id DESC
    `,
    [startDate, endDate]
  );
  return rows.map((row) => ({ ...row, scope: normalizeScope(row.scope) }));
}

export async function addTransaction({ amount, category, type, scope, notes, date, created_at }) {
  return insertRow('transactions', {
    amount,
    category,
    type,
    scope: normalizeScope(scope),
    notes,
    date,
    created_at,
  });
}

export async function deleteTransaction(id) {
  return deleteRow('transactions', id);
}

export async function bulkDeleteTransactions(ids = []) {
  const results = [];
  for (const id of ids) {
    results.push(await deleteRow('transactions', id));
  }
  return results;
}

export async function getAllCategories() {
  return allSql('SELECT * FROM categories ORDER BY name');
}

export async function addCategory(name) {
  return insertRow('categories', { name });
}

export async function getAllCurrentMoney() {
  return allSql('SELECT * FROM current_money ORDER BY created_at DESC, id DESC');
}

export async function addCurrentMoney({ location, amount, notes }) {
  return insertRow('current_money', { location, amount, notes });
}

export async function updateCurrentMoney(id, { location, amount, notes }) {
  return updateRow('current_money', id, { location, amount, notes });
}

export async function deleteCurrentMoney(id) {
  return deleteRow('current_money', id);
}

export async function getAllExpectedMoney() {
  return allSql(
    `
      SELECT
        expected_money.id,
        expected_money.source,
        expected_money.expected_date,
        expected_money.amount,
        expected_money.notes,
        expected_money.created_at,
        COALESCE(savings_plan_items.amount, 0) AS planned_save_amount
      FROM expected_money
      LEFT JOIN savings_plan_items
        ON savings_plan_items.expected_money_id = expected_money.id
      ORDER BY expected_money.expected_date ASC, expected_money.id ASC
    `
  );
}

async function syncExpectedSavingsPlanItem(
  expectedMoneyId,
  { source, expected_date, planned_save_amount, notes }
) {
  const existingItem = await firstSql(
    'SELECT * FROM savings_plan_items WHERE expected_money_id = ?',
    [Number(expectedMoneyId)]
  );
  const plannedAmount = Number(planned_save_amount || 0);

  if (plannedAmount <= 0) {
    if (existingItem) {
      await deleteRow('savings_plan_items', existingItem.id);
    }
    return;
  }

  const itemData = {
    expected_money_id: Number(expectedMoneyId),
    source: String(source || '').trim() || 'Expected income',
    planned_date: expected_date || null,
    amount: plannedAmount,
    notes: notes || null,
    updated_at: await getCurrentTimestamp(),
  };

  if (existingItem) {
    await updateRow('savings_plan_items', existingItem.id, itemData);
  } else {
    await insertRow('savings_plan_items', itemData);
  }
}

export async function addExpectedMoney({ source, expected_date, amount, planned_save_amount = 0, notes }) {
  const result = await insertRow('expected_money', {
    source,
    expected_date,
    amount,
    notes,
  });

  await syncExpectedSavingsPlanItem(result.lastInsertRowid, {
    source,
    expected_date,
    planned_save_amount,
    notes,
  });
  return result;
}

export async function updateExpectedMoney(
  id,
  { source, expected_date, amount, planned_save_amount, notes }
) {
  const result = await updateRow('expected_money', id, {
    source,
    expected_date,
    amount,
    notes,
  });

  await syncExpectedSavingsPlanItem(id, {
    source,
    expected_date,
    planned_save_amount,
    notes,
  });
  return result;
}

export async function deleteExpectedMoney(id) {
  return deleteRow('expected_money', id);
}

export async function completeExpectedMoney(id, { date, scope } = {}) {
  const item = await getRowById('expected_money', Number(id));
  if (!item) {
    throw new Error('Expected money item not found');
  }

  const normalizedScope = normalizeScope(scope);
  const transactionResult = await insertRow(
    'transactions',
    {
      amount: item.amount,
      category: getTransactionCategory('income', normalizedScope),
      type: 'income',
      scope: normalizedScope,
      notes: buildCompletionNotes(item.source, item.notes),
      date: date || item.expected_date,
    },
    'completion'
  );

  await deleteRow('expected_money', Number(id), 'completion');
  return { transactionId: transactionResult.lastInsertRowid };
}

export async function getAllPayables() {
  return allSql('SELECT * FROM payables ORDER BY pay_date ASC, id ASC');
}

export async function addPayable({ source, pay_date, amount, notes }) {
  return insertRow('payables', { source, pay_date, amount, notes });
}

export async function updatePayable(id, { source, pay_date, amount, notes }) {
  return updateRow('payables', id, { source, pay_date, amount, notes });
}

export async function deletePayable(id) {
  return deleteRow('payables', id);
}

export async function completePayable(id, { date, scope } = {}) {
  const item = await getRowById('payables', Number(id));
  if (!item) {
    throw new Error('Payable item not found');
  }

  const normalizedScope = normalizeScope(scope);
  const transactionResult = await insertRow(
    'transactions',
    {
      amount: item.amount,
      category: getTransactionCategory('expense', normalizedScope),
      type: 'expense',
      scope: normalizedScope,
      notes: buildCompletionNotes(item.source, item.notes),
      date: date || item.pay_date,
    },
    'completion'
  );

  await deleteRow('payables', Number(id), 'completion');
  return { transactionId: transactionResult.lastInsertRowid };
}

export async function getAllRecurring() {
  return allSql('SELECT * FROM recurring ORDER BY type, target, id');
}

export async function addRecurring({ target, type, amount }) {
  return insertRow('recurring', { target, type, amount });
}

export async function updateRecurring(id, { target, type, amount }) {
  return updateRow('recurring', id, { target, type, amount });
}

export async function deleteRecurring(id) {
  return deleteRow('recurring', id);
}

export async function getAllProjects() {
  return allSql('SELECT * FROM projects ORDER BY sort_order ASC, created_at DESC, id DESC');
}

export async function addProject({ description, estimated_amount, target_date }) {
  const firstProject = await firstSql('SELECT MIN(sort_order) AS sort_order FROM projects');
  const sortOrder = Number(firstProject?.sort_order ?? 0) - 1;

  return insertRow('projects', {
    description: String(description || '').trim(),
    estimated_amount: Number(estimated_amount),
    target_date: target_date ? String(target_date) : null,
    sort_order: sortOrder,
  });
}

export async function updateProject(id, { description, estimated_amount, target_date }) {
  return updateRow('projects', id, {
    description: String(description || '').trim(),
    estimated_amount: Number(estimated_amount),
    target_date: target_date ? String(target_date) : null,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function deleteProject(id) {
  return deleteRow('projects', id);
}

export async function shiftProject(id, direction) {
  const projects = await getAllProjects();
  const currentIndex = projects.findIndex((project) => project.id === Number(id));
  if (currentIndex === -1) {
    throw new Error('Project not found');
  }

  const targetIndex = direction === 'up' ? currentIndex - 1 : direction === 'down' ? currentIndex + 1 : -1;
  if (targetIndex < 0 || targetIndex >= projects.length) {
    return { changes: 0 };
  }

  const currentProject = projects[currentIndex];
  const targetProject = projects[targetIndex];
  await updateRow('projects', currentProject.id, {
    sort_order: targetProject.sort_order,
    updated_at: await getCurrentTimestamp(),
  });
  await updateRow('projects', targetProject.id, {
    sort_order: currentProject.sort_order,
    updated_at: await getCurrentTimestamp(),
  });

  return { changes: 2 };
}

export async function shiftDatedAccountItem(kind, id, direction) {
  const config = orderedAccountConfig[kind];
  if (!config) {
    throw new Error('Unsupported account list');
  }

  const normalizedDirection =
    direction === 'earlier' || direction === 'up'
      ? 'up'
      : direction === 'later' || direction === 'down'
        ? 'down'
        : null;

  if (!normalizedDirection) {
    throw new Error('Unsupported direction');
  }

  const items = await allSql(
    `SELECT id, ${config.orderField} AS order_value FROM ${config.table} ORDER BY ${config.orderBy}`
  );

  const currentIndex = items.findIndex((item) => item.id === id);
  if (currentIndex === -1) {
    throw new Error('Item not found');
  }

  const currentItem = items[currentIndex];
  let nextValue = currentItem.order_value;

  if (config.valueType === 'timestamp') {
    const targetIndex =
      normalizedDirection === 'up'
        ? Math.max(0, currentIndex - 1)
        : Math.min(items.length - 1, currentIndex + 1);

    if (targetIndex === currentIndex) {
      return { changes: 0 };
    }

    const reordered = [...items];
    const [movedItem] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, movedItem);

    const anchorValue = items[0].order_value;
    for (let index = 0; index < reordered.length; index += 1) {
      await updateRow(config.table, reordered[index].id, {
        [config.orderField]: await addSeconds(anchorValue, -index),
      });
    }

    return { changes: 1 };
  } else if (config.valueType === 'date') {
    if (normalizedDirection === 'up') {
      const previousItem = items[currentIndex - 1];
      nextValue = previousItem
        ? addDays(previousItem.order_value, -1)
        : addDays(currentItem.order_value, -1);
    } else {
      const followingItem = items[currentIndex + 1];
      nextValue = followingItem
        ? addDays(followingItem.order_value, 1)
        : addDays(currentItem.order_value, 1);
    }
  } else {
    throw new Error('Unsupported ordering strategy');
  }

  return updateRow(config.table, id, { [config.orderField]: nextValue });
}

export async function getMetals() {
  return firstSql('SELECT * FROM metals WHERE id = 1');
}

export async function updateMetals({ gold_24k_grams, gold_21k_grams, silver_kg }) {
  return updateSingletonRow('metals', {
    gold_24k_grams,
    gold_21k_grams,
    silver_kg,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function getLongTermSavings() {
  return firstSql('SELECT * FROM long_term_savings WHERE id = 1');
}

export async function updateLongTermSavings({ aub_pension_amount, cash_savings_amount }) {
  return updateSingletonRow('long_term_savings', {
    aub_pension_amount,
    cash_savings_amount,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function getSavingsPlan() {
  const items = await allSql(
    `
      SELECT
        savings_plan_items.id,
        savings_plan_items.expected_money_id,
        savings_plan_items.source,
        savings_plan_items.planned_date,
        savings_plan_items.amount,
        savings_plan_items.notes,
        savings_plan_items.created_at,
        savings_plan_items.updated_at,
        expected_money.amount AS expected_amount
      FROM savings_plan_items
      LEFT JOIN expected_money
        ON expected_money.id = savings_plan_items.expected_money_id
      ORDER BY
        CASE WHEN savings_plan_items.planned_date IS NULL THEN 1 ELSE 0 END,
        savings_plan_items.planned_date ASC,
        savings_plan_items.id ASC
    `
  );
  const planned = items.reduce((total, item) => total + (item.amount || 0), 0);

  return {
    items,
    summary: {
      planned,
      item_count: items.length,
    },
  };
}

export async function addSavingsPlanItem({ source, planned_date, amount, notes }) {
  return insertRow('savings_plan_items', {
    expected_money_id: null,
    source,
    planned_date: planned_date || null,
    amount,
    notes: notes || null,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function updateSavingsPlanItem(id, { source, planned_date, amount, notes }) {
  return updateRow('savings_plan_items', Number(id), {
    source,
    planned_date: planned_date || null,
    amount,
    notes: notes || null,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function deleteSavingsPlanItem(id) {
  return deleteRow('savings_plan_items', Number(id));
}

export async function updateMetalPrices({
  gold_24k_price_per_gram,
  gold_21k_price_per_gram,
  silver_price_per_kg,
  fromApi = false,
}) {
  const beforeRow = await getMetals();
  const fetchedAt = fromApi ? await getCurrentTimestamp() : null;

  const result = await runSql(
    `
      UPDATE metals
      SET gold_24k_price_per_gram = ?,
          gold_21k_price_per_gram = ?,
          silver_price_per_kg = ?,
          prices_fetched_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `,
    [gold_24k_price_per_gram, gold_21k_price_per_gram, silver_price_per_kg, fetchedAt]
  );

  if (result.changes) {
    await logAudit('metals', 'update', beforeRow, await getMetals());
  }

  return result;
}

export async function getPrayers() {
  return firstSql('SELECT * FROM prayers WHERE id = 1');
}

export async function updatePrayer(prayer, delta) {
  const validPrayers = ['soboh', 'dohor', 'aaser', 'maghreb', 'ishaa', 'ayaat', 'fasting'];
  if (!validPrayers.includes(prayer)) {
    throw new Error('Invalid prayer name');
  }

  const beforeRow = await getPrayers();
  const result = await runSql(
    `
      UPDATE prayers
      SET ${prayer} = MAX(0, ${prayer} + ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `,
    [delta]
  );

  if (result.changes) {
    await logAudit('prayers', 'update', beforeRow, await getPrayers());
  }

  return result;
}

export async function setPrayers(prayers) {
  return updateSingletonRow('prayers', {
    soboh: prayers.soboh,
    dohor: prayers.dohor,
    aaser: prayers.aaser,
    maghreb: prayers.maghreb,
    ishaa: prayers.ishaa,
    ayaat: prayers.ayaat,
    fasting: prayers.fasting || 0,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function getAllGymPayments() {
  return allSql('SELECT * FROM gym_payments ORDER BY date DESC, id DESC');
}

export async function addGymPayment({ date, sessions, notes }) {
  return insertRow('gym_payments', { date, sessions, notes });
}

export async function deleteGymPayment(id) {
  return deleteRow('gym_payments', id);
}

export async function getAllGymSessions() {
  return allSql('SELECT * FROM gym_sessions ORDER BY date DESC, id DESC');
}

export async function addGymSession({ date, notes }) {
  return insertRow('gym_sessions', { date, notes });
}

export async function deleteGymSession(id) {
  return deleteRow('gym_sessions', id);
}

export async function getAllReminders() {
  return allSql('SELECT * FROM reminders ORDER BY is_active DESC, next_due_at ASC, id ASC');
}

export async function addReminder({ title, interval_hours }) {
  const intervalHours = Number(interval_hours);
  const now = Date.now();
  const nextDueAt = new Date(now + intervalHours * 60 * 60 * 1000).toISOString();
  return insertRow('reminders', {
    title,
    interval_hours: intervalHours,
    next_due_at: nextDueAt,
    is_active: 1,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function updateReminder(
  id,
  { title, interval_hours, is_active, recalculate_from_now = false }
) {
  const reminder = await getRowById('reminders', id);
  if (!reminder) {
    throw new Error('Reminder not found');
  }

  const intervalHours =
    interval_hours === undefined ? reminder.interval_hours : Number(interval_hours);
  const activeValue =
    is_active === undefined
      ? reminder.is_active
      : is_active === true || is_active === 1 || is_active === '1'
        ? 1
        : 0;

  return updateRow('reminders', id, {
    title: title ?? reminder.title,
    interval_hours: intervalHours,
    is_active: activeValue,
    next_due_at: recalculate_from_now
      ? new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString()
      : reminder.next_due_at,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function markReminderDone(id) {
  const reminder = await getRowById('reminders', id);
  if (!reminder) {
    throw new Error('Reminder not found');
  }

  const nowIso = new Date().toISOString();
  const nextDueAt = new Date(Date.now() + reminder.interval_hours * 60 * 60 * 1000).toISOString();

  return updateRow('reminders', id, {
    last_done_at: nowIso,
    next_due_at: nextDueAt,
    is_active: 1,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function pauseReminder(id) {
  return updateRow('reminders', id, {
    is_active: 0,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function resumeReminder(id) {
  return updateRow('reminders', id, {
    is_active: 1,
    updated_at: await getCurrentTimestamp(),
  });
}

export async function deleteReminder(id) {
  return deleteRow('reminders', id);
}

export async function getRecentAuditEntries(limit = 20) {
  const entries = await allSql(
    `
      SELECT *
      FROM audit_log
      ORDER BY id DESC
      LIMIT ?
    `,
    [limit]
  );

  return entries.map((entry) => ({
    ...entry,
    before: parseJsonColumn(entry.before_json),
    after: parseJsonColumn(entry.after_json),
  }));
}

export async function undoAuditEntry(auditId) {
  const entry = await firstSql('SELECT * FROM audit_log WHERE id = ?', [auditId]);
  if (!entry) {
    throw new Error('Audit entry not found');
  }

  const before = parseJsonColumn(entry.before_json);
  const after = parseJsonColumn(entry.after_json);

  if (entry.action === 'create') {
    if (!after?.id) {
      throw new Error('Nothing to undo');
    }
    return deleteRow(entry.table_name, after.id, 'undo');
  }

  if (entry.action === 'delete') {
    if (!before) {
      throw new Error('Nothing to restore');
    }
    await restoreRow(entry.table_name, before, 'undo');
    return { changes: 1 };
  }

  if (entry.action === 'update') {
    if (!before) {
      throw new Error('No previous state found');
    }
    await restoreRow(entry.table_name, before, 'undo');
    return { changes: 1 };
  }

  throw new Error('Unsupported audit action');
}

export async function getDatabaseBackup() {
  const tableNames = [
    'transactions',
    'categories',
    'budgets',
    'current_money',
    'projects',
    'expected_money',
    'payables',
    'recurring',
    'metals',
    'long_term_savings',
    'savings_plan',
    'savings_plan_items',
    'prayers',
    'gym_payments',
    'gym_sessions',
    'reminders',
    'audit_log',
  ];

  const tables = {};
  for (const tableName of tableNames) {
    tables[tableName] = await allSql(`SELECT * FROM ${tableName} ORDER BY id ASC`);
  }

  return {
    format: 'belowyourmeans.d1.json',
    exportedAt: new Date().toISOString(),
    tables,
  };
}
