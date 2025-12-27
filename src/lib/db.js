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

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
  `);
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

