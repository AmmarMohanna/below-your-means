-- Existing payments remain unmarked until an actual payment is recorded.
ALTER TABLE recurring ADD COLUMN last_paid_date TEXT DEFAULT NULL;
