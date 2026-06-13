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

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  interval_hours INTEGER NOT NULL CHECK(interval_hours > 0),
  next_due_at TEXT NOT NULL,
  last_done_at TEXT DEFAULT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
CREATE INDEX IF NOT EXISTS idx_payables_date ON payables(pay_date);
CREATE INDEX IF NOT EXISTS idx_recurring_type ON recurring(type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_active_due ON reminders(is_active, next_due_at);
