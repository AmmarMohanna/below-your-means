import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'belowyourmeans.db');

let db = null;

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
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

    -- Current money (what I have now)
    CREATE TABLE IF NOT EXISTS current_money (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Expected money (money coming in)
    CREATE TABLE IF NOT EXISTS expected_money (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      expected_date TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Payables (money to pay)
    CREATE TABLE IF NOT EXISTS payables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      pay_date TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Recurring monthly payments
    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('Family', 'Home', 'Personal')),
      amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Money held for others
    CREATE TABLE IF NOT EXISTS held_money (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Precious metals holdings
    CREATE TABLE IF NOT EXISTS metals (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      gold_24k_grams REAL DEFAULT 0,
      gold_21k_grams REAL DEFAULT 0,
      silver_kg REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Insert default row if not exists
    INSERT OR IGNORE INTO metals (id, gold_24k_grams, gold_21k_grams, silver_kg) VALUES (1, 0, 0, 0);

    -- Prayer tracker (missed prayers count)
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
    
    -- Insert default row for prayers
    INSERT OR IGNORE INTO prayers (id, soboh, dohor, aaser, maghreb, ishaa, ayaat, fasting) VALUES (1, 0, 0, 0, 0, 0, 0, 0);

    -- Gym payments (when you paid for sessions)
    CREATE TABLE IF NOT EXISTS gym_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      sessions INTEGER NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Gym sessions (when you exercised)
    CREATE TABLE IF NOT EXISTS gym_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
    CREATE INDEX IF NOT EXISTS idx_expected_money_date ON expected_money(expected_date);
    CREATE INDEX IF NOT EXISTS idx_payables_date ON payables(pay_date);
    CREATE INDEX IF NOT EXISTS idx_recurring_type ON recurring(type);
  `);

  // Migration: Add fasting column to prayers table if it doesn't exist
  try {
    db.exec(`ALTER TABLE prayers ADD COLUMN fasting INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
}

// Transaction operations
export function getAllTransactions() {
  return getDb().prepare('SELECT * FROM transactions ORDER BY date DESC').all();
}

export function getTransactionsByDateRange(startDate, endDate) {
  return getDb().prepare(`
    SELECT * FROM transactions 
    WHERE date >= ? AND date <= ?
    ORDER BY date DESC
  `).all(startDate, endDate);
}

export function addTransaction({ amount, category, type, notes, date }) {
  const stmt = getDb().prepare(`
    INSERT INTO transactions (amount, category, type, notes, date)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(amount, category, type, notes, date);
}

export function deleteTransaction(id) {
  return getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id);
}

// Category operations
export function getAllCategories() {
  return getDb().prepare('SELECT * FROM categories ORDER BY name').all();
}

export function addCategory(name) {
  const stmt = getDb().prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  return stmt.run(name);
}

// Current Money operations
export function getAllCurrentMoney() {
  return getDb().prepare('SELECT * FROM current_money ORDER BY created_at DESC').all();
}

export function addCurrentMoney({ location, amount, notes }) {
  const stmt = getDb().prepare('INSERT INTO current_money (location, amount, notes) VALUES (?, ?, ?)');
  return stmt.run(location, amount, notes);
}

export function updateCurrentMoney(id, { location, amount, notes }) {
  const stmt = getDb().prepare('UPDATE current_money SET location = ?, amount = ?, notes = ? WHERE id = ?');
  return stmt.run(location, amount, notes, id);
}

export function deleteCurrentMoney(id) {
  return getDb().prepare('DELETE FROM current_money WHERE id = ?').run(id);
}

// Expected Money operations
export function getAllExpectedMoney() {
  return getDb().prepare('SELECT * FROM expected_money ORDER BY expected_date ASC').all();
}

export function addExpectedMoney({ source, expected_date, amount, notes }) {
  const stmt = getDb().prepare('INSERT INTO expected_money (source, expected_date, amount, notes) VALUES (?, ?, ?, ?)');
  return stmt.run(source, expected_date, amount, notes);
}

export function updateExpectedMoney(id, { source, expected_date, amount, notes }) {
  const stmt = getDb().prepare('UPDATE expected_money SET source = ?, expected_date = ?, amount = ?, notes = ? WHERE id = ?');
  return stmt.run(source, expected_date, amount, notes, id);
}

export function deleteExpectedMoney(id) {
  return getDb().prepare('DELETE FROM expected_money WHERE id = ?').run(id);
}

// Payables operations
export function getAllPayables() {
  return getDb().prepare('SELECT * FROM payables ORDER BY pay_date ASC').all();
}

export function addPayable({ source, pay_date, amount, notes }) {
  const stmt = getDb().prepare('INSERT INTO payables (source, pay_date, amount, notes) VALUES (?, ?, ?, ?)');
  return stmt.run(source, pay_date, amount, notes);
}

export function updatePayable(id, { source, pay_date, amount, notes }) {
  const stmt = getDb().prepare('UPDATE payables SET source = ?, pay_date = ?, amount = ?, notes = ? WHERE id = ?');
  return stmt.run(source, pay_date, amount, notes, id);
}

export function deletePayable(id) {
  return getDb().prepare('DELETE FROM payables WHERE id = ?').run(id);
}

// Recurring payments operations
export function getAllRecurring() {
  return getDb().prepare('SELECT * FROM recurring ORDER BY type, target').all();
}

export function addRecurring({ target, type, amount }) {
  const stmt = getDb().prepare('INSERT INTO recurring (target, type, amount) VALUES (?, ?, ?)');
  return stmt.run(target, type, amount);
}

export function updateRecurring(id, { target, type, amount }) {
  const stmt = getDb().prepare('UPDATE recurring SET target = ?, type = ?, amount = ? WHERE id = ?');
  return stmt.run(target, type, amount, id);
}

export function deleteRecurring(id) {
  return getDb().prepare('DELETE FROM recurring WHERE id = ?').run(id);
}

// Held money operations (money held for others)
export function getAllHeldMoney() {
  return getDb().prepare('SELECT * FROM held_money ORDER BY created_at DESC').all();
}

export function addHeldMoney({ person, amount, notes }) {
  const stmt = getDb().prepare('INSERT INTO held_money (person, amount, notes) VALUES (?, ?, ?)');
  return stmt.run(person, amount, notes);
}

export function updateHeldMoney(id, { person, amount, notes }) {
  const stmt = getDb().prepare('UPDATE held_money SET person = ?, amount = ?, notes = ? WHERE id = ?');
  return stmt.run(person, amount, notes, id);
}

export function deleteHeldMoney(id) {
  return getDb().prepare('DELETE FROM held_money WHERE id = ?').run(id);
}

// Metals operations
export function getMetals() {
  return getDb().prepare('SELECT * FROM metals WHERE id = 1').get();
}

export function updateMetals({ gold_24k_grams, gold_21k_grams, silver_kg }) {
  const stmt = getDb().prepare(`
    UPDATE metals 
    SET gold_24k_grams = ?, gold_21k_grams = ?, silver_kg = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = 1
  `);
  return stmt.run(gold_24k_grams, gold_21k_grams, silver_kg);
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
  const stmt = getDb().prepare(`
    UPDATE prayers 
    SET ${prayer} = MAX(0, ${prayer} + ?), updated_at = CURRENT_TIMESTAMP 
    WHERE id = 1
  `);
  return stmt.run(delta);
}

export function setPrayers(prayers) {
  const stmt = getDb().prepare(`
    UPDATE prayers 
    SET soboh = ?, dohor = ?, aaser = ?, maghreb = ?, ishaa = ?, ayaat = ?, fasting = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = 1
  `);
  return stmt.run(prayers.soboh, prayers.dohor, prayers.aaser, prayers.maghreb, prayers.ishaa, prayers.ayaat, prayers.fasting || 0);
}

// Gym payment operations
export function getAllGymPayments() {
  return getDb().prepare('SELECT * FROM gym_payments ORDER BY date DESC').all();
}

export function addGymPayment({ date, sessions, notes }) {
  const stmt = getDb().prepare('INSERT INTO gym_payments (date, sessions, notes) VALUES (?, ?, ?)');
  return stmt.run(date, sessions, notes);
}

export function deleteGymPayment(id) {
  return getDb().prepare('DELETE FROM gym_payments WHERE id = ?').run(id);
}

// Gym session operations
export function getAllGymSessions() {
  return getDb().prepare('SELECT * FROM gym_sessions ORDER BY date DESC').all();
}

export function addGymSession({ date, notes }) {
  const stmt = getDb().prepare('INSERT INTO gym_sessions (date, notes) VALUES (?, ?)');
  return stmt.run(date, notes);
}

export function deleteGymSession(id) {
  return getDb().prepare('DELETE FROM gym_sessions WHERE id = ?').run(id);
}

