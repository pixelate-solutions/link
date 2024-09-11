ALTER TABLE "accounts" ALTER COLUMN "is_from_plaid" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "plaid_account_id" text;