#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'belowyourmeans.db');
const dataDir = path.dirname(dbPath);

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created data directory: ${dataDir}`);
}

console.log(`Initializing database at: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
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
    planned_save_amount REAL NOT NULL DEFAULT 0 CHECK(planned_save_amount >= 0 AND planned_save_amount <= amount),
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
    type TEXT NOT NULL CHECK(type IN ('Family', 'Home', 'Personal', 'Subscription', 'Donations')),
    amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL CHECK(length(trim(description)) > 0),
    estimated_amount REAL NOT NULL CHECK(estimated_amount >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    target_date TEXT DEFAULT NULL,
    sort_order INTEGER
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

  INSERT OR IGNORE INTO metals (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS long_term_savings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    aub_pension_amount REAL NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO long_term_savings (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS savings_plan (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    target_amount REAL NOT NULL DEFAULT 0 CHECK(target_amount >= 0),
    target_date TEXT DEFAULT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO savings_plan (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS savings_plan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expected_money_id INTEGER DEFAULT NULL,
    source TEXT NOT NULL CHECK(length(trim(source)) > 0),
    planned_date TEXT DEFAULT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    notes TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expected_money_id) REFERENCES expected_money(id) ON DELETE SET NULL
  );

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

  INSERT OR IGNORE INTO prayers (id) VALUES (1);

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
  CREATE INDEX IF NOT EXISTS idx_transactions_scope ON transactions(scope);
  CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
  CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
  CREATE INDEX IF NOT EXISTS idx_expected_money_date ON expected_money(expected_date);
  CREATE INDEX IF NOT EXISTS idx_expected_money_planned_savings ON expected_money(expected_date, planned_save_amount);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_savings_plan_items_expected_money ON savings_plan_items(expected_money_id);
  CREATE INDEX IF NOT EXISTS idx_savings_plan_items_date ON savings_plan_items(planned_date, id);
  CREATE INDEX IF NOT EXISTS idx_payables_date ON payables(pay_date);
  CREATE INDEX IF NOT EXISTS idx_recurring_type ON recurring(type);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
`);

console.log('Database initialized successfully!');
console.log('Tables created for transactions, accounts, savings, lifestyle, and audit history.');

db.close();
