ALTER TABLE "link"."accounts" ADD COLUMN "plaid" jsonb;--> statement-breakpoint
ALTER TABLE "link"."connections" ADD COLUMN "plaid" jsonb;--> statement-breakpoint
ALTER TABLE "link"."transactions" ADD COLUMN "plaid" jsonb;