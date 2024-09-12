ALTER TABLE transactions
ALTER COLUMN amount TYPE numeric(12, 2)
USING amount::numeric(12, 2);
