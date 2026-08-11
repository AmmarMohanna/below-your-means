CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL CHECK(length(trim(description)) > 0),
  estimated_amount REAL NOT NULL CHECK(estimated_amount >= 0),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO projects (description, estimated_amount, created_at, updated_at)
SELECT
  COALESCE(NULLIF(trim(person), ''), 'Untitled project'),
  MAX(amount, 0),
  created_at,
  created_at
FROM held_money;

DROP TABLE held_money;
