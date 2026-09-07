CREATE TABLE recurring_without_direction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('Family', 'Home', 'Personal', 'Subscription', 'Donations')),
  amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO recurring_without_direction (id, target, type, amount, created_at)
SELECT id, target, type, amount, created_at
FROM recurring;

DROP TABLE recurring;
ALTER TABLE recurring_without_direction RENAME TO recurring;

CREATE INDEX IF NOT EXISTS idx_recurring_type ON recurring(type);
