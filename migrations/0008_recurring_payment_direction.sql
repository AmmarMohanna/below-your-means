ALTER TABLE recurring
ADD COLUMN direction TEXT NOT NULL DEFAULT 'pay'
CHECK(direction IN ('pay', 'receive'));

CREATE INDEX IF NOT EXISTS idx_recurring_direction
ON recurring(direction);
