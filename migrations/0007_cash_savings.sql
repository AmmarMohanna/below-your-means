ALTER TABLE long_term_savings
ADD COLUMN cash_savings_amount REAL NOT NULL DEFAULT 0 CHECK(cash_savings_amount >= 0);
