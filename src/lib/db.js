import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath =
  process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'belowyourmeans.db');

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

let db = null;
let auditSuspended = false;

export function getDatabasePath() {
  return dbPath;
}

export function normalizeScope(scope) {
  return scope === 'business' ? 'business' : 'personal';
}

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initializeSchema();
  }
  return db;
}

export function runWithoutAudit(callback) {
  const previous = auditSuspended;
  auditSuspended = true;
  try {
    return callback();
  } finally {
    auditSuspended = previous;
  }
}

export function createDatabaseSnapshot(filePath) {
  const database = getDb();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath);
  }

  const escapedPath = filePath.replace(/'/g, "''");
  database.exec(`VACUUM INTO '${escapedPath}'`);
  return filePath;
}

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      scope TEXT NOT NULL DEFAULT 'personal' CHECK(scope IN ('personal', 'business')),
      notes TEXT,
      date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS current_money (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expected_money (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      expected_date TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      pay_date TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('Family', 'Home', 'Personal')),
      amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS held_money (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS metals (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      gold_24k_grams REAL DEFAULT 0,
      gold_21k_grams REAL DEFAULT 0,
      silver_kg REAL DEFAULT 0,
      gold_24k_price_per_gram REAL DEFAULT 85,
      gold_21k_price_per_gram REAL DEFAULT 74.4,
      silver_price_per_kg REAL DEFAULT 950,
      prices_fetched_at DATETIME DEFAULT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO metals (
      id,
      gold_24k_grams,
      gold_21k_grams,
      silver_kg,
      gold_24k_price_per_gram,
      gold_21k_price_per_gram,
      silver_price_per_kg
    )
    VALUES (1, 0, 0, 0, 85, 74.4, 950);

    CREATE TABLE IF NOT EXISTS prayers (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      soboh INTEGER DEFAULT 0,
      dohor INTEGER DEFAULT 0,
      aaser INTEGER DEFAULT 0,
      maghreb INTEGER DEFAULT 0,
      ishaa INTEGER DEFAULT 0,
      ayaat INTEGER DEFAULT 0,
      fasting INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO prayers (id, soboh, dohor, aaser, maghreb, ishaa, ayaat, fasting)
    VALUES (1, 0, 0, 0, 0, 0, 0, 0);

    CREATE TABLE IF NOT EXISTS gym_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      sessions INTEGER NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gym_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
      before_json TEXT,
      after_json TEXT,
      source TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
    CREATE INDEX IF NOT EXISTS idx_expected_money_date ON expected_money(expected_date);
    CREATE INDEX IF NOT EXISTS idx_payables_date ON payables(pay_date);
    CREATE INDEX IF NOT EXISTS idx_recurring_type ON recurring(type);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
  `);

  try {
    db.exec(`ALTER TABLE prayers ADD COLUMN fasting INTEGER DEFAULT 0`);
  } catch {}

  try {
    db.exec(`ALTER TABLE metals ADD COLUMN gold_24k_price_per_gram REAL DEFAULT 85`);
  } catch {}
  try {
    db.exec(`ALTER TABLE metals ADD COLUMN gold_21k_price_per_gram REAL DEFAULT 74.4`);
  } catch {}
  try {
    db.exec(`ALTER TABLE metals ADD COLUMN silver_price_per_kg REAL DEFAULT 950`);
  } catch {}
  try {
    db.exec(`ALTER TABLE metals ADD COLUMN prices_fetched_at DATETIME DEFAULT NULL`);
  } catch {}
  try {
    db.exec(
      `ALTER TABLE transactions ADD COLUMN scope TEXT NOT NULL DEFAULT 'personal' CHECK(scope IN ('personal', 'business'))`
    );
  } catch {}

  db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_scope ON transactions(scope)`);
}

function parseJsonColumn(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getTableColumns(tableName) {
  return getDb()
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((column) => column.name);
}

function getRowById(tableName, id) {
  return getDb().prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
}

function logAudit(tableName, action, beforeRow, afterRow, source = 'user') {
  if (auditSuspended) return;

  const entityId = afterRow?.id ?? beforeRow?.id ?? null;

  getDb()
    .prepare(`
      INSERT INTO audit_log (table_name, entity_id, action, before_json, after_json, source)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      tableName,
      entityId,
      action,
      beforeRow ? JSON.stringify(beforeRow) : null,
      afterRow ? JSON.stringify(afterRow) : null,
      source
    );
}

function insertRow(tableName, data, source = 'user') {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  const columns = entries.map(([column]) => column);
  const placeholders = columns.map(() => '?').join(', ');
  const values = entries.map(([, value]) => value);

  const result = getDb()
    .prepare(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`)
    .run(...values);

  const afterRow = getRowById(tableName, result.lastInsertRowid);
  logAudit(tableName, 'create', null, afterRow, source);
  return result;
}

function updateRow(tableName, id, data, source = 'user') {
  const beforeRow = getRowById(tableName, id);
  if (!beforeRow) {
    return { changes: 0 };
  }

  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return { changes: 0 };
  }

  const setClause = entries.map(([column]) => `${column} = ?`).join(', ');
  const values = entries.map(([, value]) => value);

  const result = getDb()
    .prepare(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`)
    .run(...values, id);

  if (result.changes) {
    const afterRow = getRowById(tableName, id);
    logAudit(tableName, 'update', beforeRow, afterRow, source);
  }

  return result;
}

function deleteRow(tableName, id, source = 'user') {
  const beforeRow = getRowById(tableName, id);
  if (!beforeRow) {
    return { changes: 0 };
  }

  const result = getDb().prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);
  if (result.changes) {
    logAudit(tableName, 'delete', beforeRow, null, source);
  }
  return result;
}

function restoreRow(tableName, row, source = 'undo') {
  const columns = getTableColumns(tableName).filter((column) =>
    Object.prototype.hasOwnProperty.call(row, column)
  );
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => row[column]);
  const existingRow = row.id ? getRowById(tableName, row.id) : null;

  getDb()
    .prepare(
      `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
    )
    .run(...values);

  const afterRow = row.id ? getRowById(tableName, row.id) : row;
  logAudit(tableName, existingRow ? 'update' : 'create', existingRow, afterRow, source);
}

function updateSingletonRow(tableName, data, source = 'user') {
  const beforeRow = getDb().prepare(`SELECT * FROM ${tableName} WHERE id = 1`).get();
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return { changes: 0 };
  }

  const setClause = entries.map(([column]) => `${column} = ?`).join(', ');
  const values = entries.map(([, value]) => value);
  const result = getDb()
    .prepare(`UPDATE ${tableName} SET ${setClause} WHERE id = 1`)
    .run(...values);

  if (result.changes) {
    const afterRow = getDb().prepare(`SELECT * FROM ${tableName} WHERE id = 1`).get();
    logAudit(tableName, 'update', beforeRow, afterRow, source);
  }

  return result;
}

function addDays(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day, 12));
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function addSeconds(dateTimeText, seconds) {
  const modifier = `${seconds >= 0 ? '+' : ''}${seconds} seconds`;
  return getDb().prepare('SELECT datetime(?, ?) AS value').get(dateTimeText, modifier).value;
}

// Transaction operations
export function getAllTransactions() {
  return getDb()
    .prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC')
    .all()
    .map((row) => ({ ...row, scope: normalizeScope(row.scope) }));
}

export function getTransactionsByDateRange(startDate, endDate) {
  return getDb()
    .prepare(`
      SELECT * FROM transactions
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC, id DESC
    `)
    .all(startDate, endDate)
    .map((row) => ({ ...row, scope: normalizeScope(row.scope) }));
}

export function addTransaction({ amount, category, type, scope, notes, date }) {
  return insertRow('transactions', {
    amount,
    category,
    type,
    scope: normalizeScope(scope),
    notes,
    date,
  });
}

export function deleteTransaction(id) {
  return deleteRow('transactions', id);
}

export function bulkDeleteTransactions(ids = []) {
  const database = getDb();
  const transaction = database.transaction((targetIds) =>
    targetIds.map((id) => deleteRow('transactions', id))
  );
  return transaction(ids);
}

// Category operations
export function getAllCategories() {
  return getDb().prepare('SELECT * FROM categories ORDER BY name').all();
}

export function addCategory(name) {
  return insertRow('categories', { name });
}

// Current Money operations
export function getAllCurrentMoney() {
  return getDb()
    .prepare('SELECT * FROM current_money ORDER BY created_at DESC, id DESC')
    .all();
}

export function addCurrentMoney({ location, amount, notes }) {
  return insertRow('current_money', { location, amount, notes });
}

export function updateCurrentMoney(id, { location, amount, notes }) {
  return updateRow('current_money', id, { location, amount, notes });
}

export function deleteCurrentMoney(id) {
  return deleteRow('current_money', id);
}

// Expected Money operations
export function getAllExpectedMoney() {
  return getDb()
    .prepare('SELECT * FROM expected_money ORDER BY expected_date ASC, id ASC')
    .all();
}

export function addExpectedMoney({ source, expected_date, amount, notes }) {
  return insertRow('expected_money', { source, expected_date, amount, notes });
}

export function updateExpectedMoney(id, { source, expected_date, amount, notes }) {
  return updateRow('expected_money', id, { source, expected_date, amount, notes });
}

export function deleteExpectedMoney(id) {
  return deleteRow('expected_money', id);
}

// Payables operations
export function getAllPayables() {
  return getDb()
    .prepare('SELECT * FROM payables ORDER BY pay_date ASC, id ASC')
    .all();
}

export function addPayable({ source, pay_date, amount, notes }) {
  return insertRow('payables', { source, pay_date, amount, notes });
}

export function updatePayable(id, { source, pay_date, amount, notes }) {
  return updateRow('payables', id, { source, pay_date, amount, notes });
}

export function deletePayable(id) {
  return deleteRow('payables', id);
}

// Recurring payments operations
export function getAllRecurring() {
  return getDb()
    .prepare('SELECT * FROM recurring ORDER BY type, target, id')
    .all();
}

export function addRecurring({ target, type, amount }) {
  return insertRow('recurring', { target, type, amount });
}

export function updateRecurring(id, { target, type, amount }) {
  return updateRow('recurring', id, { target, type, amount });
}

export function deleteRecurring(id) {
  return deleteRow('recurring', id);
}

// Held money operations
export function getAllHeldMoney() {
  return getDb()
    .prepare('SELECT * FROM held_money ORDER BY created_at DESC, id DESC')
    .all();
}

export function addHeldMoney({ person, amount, notes }) {
  return insertRow('held_money', { person, amount, notes });
}

export function updateHeldMoney(id, { person, amount, notes }) {
  return updateRow('held_money', id, { person, amount, notes });
}

export function deleteHeldMoney(id) {
  return deleteRow('held_money', id);
}

export function shiftDatedAccountItem(kind, id, direction) {
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

  const items = getDb()
    .prepare(`SELECT id, ${config.orderField} AS order_value FROM ${config.table} ORDER BY ${config.orderBy}`)
    .all();

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
    const database = getDb();
    const transaction = database.transaction(() => {
      reordered.forEach((item, index) => {
        updateRow(config.table, item.id, {
          [config.orderField]: addSeconds(anchorValue, -index),
        });
      });
    });

    transaction();
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

// Metals operations
export function getMetals() {
  return getDb().prepare('SELECT * FROM metals WHERE id = 1').get();
}

export function updateMetals({ gold_24k_grams, gold_21k_grams, silver_kg }) {
  return updateSingletonRow('metals', {
    gold_24k_grams,
    gold_21k_grams,
    silver_kg,
    updated_at: getDb().prepare('SELECT CURRENT_TIMESTAMP AS now').get().now,
  });
}

export function updateMetalPrices({
  gold_24k_price_per_gram,
  gold_21k_price_per_gram,
  silver_price_per_kg,
  fromApi = false,
}) {
  const beforeRow = getMetals();
  const database = getDb();

  const result = database
    .prepare(`
      UPDATE metals
      SET gold_24k_price_per_gram = ?,
          gold_21k_price_per_gram = ?,
          silver_price_per_kg = ?,
          prices_fetched_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `)
    .run(
      gold_24k_price_per_gram,
      gold_21k_price_per_gram,
      silver_price_per_kg,
      fromApi ? database.prepare('SELECT CURRENT_TIMESTAMP AS now').get().now : null
    );

  if (result.changes) {
    logAudit('metals', 'update', beforeRow, getMetals());
  }

  return result;
}

// Prayer operations
export function getPrayers() {
  return getDb().prepare('SELECT * FROM prayers WHERE id = 1').get();
}

export function updatePrayer(prayer, delta) {
  const validPrayers = ['soboh', 'dohor', 'aaser', 'maghreb', 'ishaa', 'ayaat', 'fasting'];
  if (!validPrayers.includes(prayer)) {
    throw new Error('Invalid prayer name');
  }

  const beforeRow = getPrayers();
  const result = getDb()
    .prepare(`
      UPDATE prayers
      SET ${prayer} = MAX(0, ${prayer} + ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `)
    .run(delta);

  if (result.changes) {
    logAudit('prayers', 'update', beforeRow, getPrayers());
  }

  return result;
}

export function setPrayers(prayers) {
  return updateSingletonRow('prayers', {
    soboh: prayers.soboh,
    dohor: prayers.dohor,
    aaser: prayers.aaser,
    maghreb: prayers.maghreb,
    ishaa: prayers.ishaa,
    ayaat: prayers.ayaat,
    fasting: prayers.fasting || 0,
    updated_at: getDb().prepare('SELECT CURRENT_TIMESTAMP AS now').get().now,
  });
}

// Gym payment operations
export function getAllGymPayments() {
  return getDb()
    .prepare('SELECT * FROM gym_payments ORDER BY date DESC, id DESC')
    .all();
}

export function addGymPayment({ date, sessions, notes }) {
  return insertRow('gym_payments', { date, sessions, notes });
}

export function deleteGymPayment(id) {
  return deleteRow('gym_payments', id);
}

// Gym session operations
export function getAllGymSessions() {
  return getDb()
    .prepare('SELECT * FROM gym_sessions ORDER BY date DESC, id DESC')
    .all();
}

export function addGymSession({ date, notes }) {
  return insertRow('gym_sessions', { date, notes });
}

export function deleteGymSession(id) {
  return deleteRow('gym_sessions', id);
}

// Audit operations
export function getRecentAuditEntries(limit = 20) {
  return getDb()
    .prepare(`
      SELECT *
      FROM audit_log
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(limit)
    .map((entry) => ({
      ...entry,
      before: parseJsonColumn(entry.before_json),
      after: parseJsonColumn(entry.after_json),
    }));
}

export function undoAuditEntry(auditId) {
  const entry = getDb().prepare('SELECT * FROM audit_log WHERE id = ?').get(auditId);
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
    restoreRow(entry.table_name, before, 'undo');
    return { changes: 1 };
  }

  if (entry.action === 'update') {
    if (!before) {
      throw new Error('No previous state found');
    }
    restoreRow(entry.table_name, before, 'undo');
    return { changes: 1 };
  }

  throw new Error('Unsupported audit action');
}
