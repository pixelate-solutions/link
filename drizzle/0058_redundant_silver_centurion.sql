CREATE TABLE IF NOT EXISTS "lifetime_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"is_lifetime" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_customers" DROP COLUMN IF EXISTS "lifetime_purchase";