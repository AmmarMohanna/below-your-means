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

CREATE UNIQUE INDEX IF NOT EXISTS idx_savings_plan_items_expected_money
ON savings_plan_items(expected_money_id);

CREATE INDEX IF NOT EXISTS idx_savings_plan_items_date
ON savings_plan_items(planned_date, id);

INSERT OR IGNORE INTO savings_plan_items (
  expected_money_id,
  source,
  planned_date,
  amount,
  notes
)
SELECT
  id,
  source,
  expected_date,
  planned_save_amount,
  notes
FROM expected_money
WHERE planned_save_amount > 0;
