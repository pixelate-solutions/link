ALTER TABLE "accounts" ADD COLUMN "current_balance" text DEFAULT '0';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "available_balance" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "plaid_type" text DEFAULT 'depository';