CREATE TABLE IF NOT EXISTS long_term_savings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  aub_pension_amount REAL NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO long_term_savings (id, aub_pension_amount)
VALUES (1, 0);

CREATE TABLE recurring_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('Family', 'Home', 'Personal', 'Subscription', 'Donations')),
  amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO recurring_new (id, target, type, amount, created_at)
SELECT id, target, type, amount, created_at
FROM recurring;

DROP TABLE recurring;
ALTER TABLE recurring_new RENAME TO recurring;

CREATE INDEX IF NOT EXISTS idx_recurring_type ON recurring(type);
