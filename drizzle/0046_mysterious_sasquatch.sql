ALTER TABLE "transactions" DROP CONSTRAINT "transactions_plaid_transaction_id_unique";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "plaid_transaction_id";