ALTER TABLE expected_money ADD COLUMN planned_save_amount REAL NOT NULL DEFAULT 0
  CHECK(planned_save_amount >= 0 AND planned_save_amount <= amount);

CREATE TABLE IF NOT EXISTS savings_plan (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  target_amount REAL NOT NULL DEFAULT 0 CHECK(target_amount >= 0),
  target_date TEXT DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO savings_plan (id, target_amount, target_date)
VALUES (1, 0, NULL);

CREATE INDEX IF NOT EXISTS idx_expected_money_planned_savings
ON expected_money(expected_date, planned_save_amount);
