CREATE TABLE IF NOT EXISTS "recurring_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"account_id" text NOT NULL,
	"merchant_name" text NOT NULL,
	"category_name" text NOT NULL,
	"frequency" text NOT NULL,
	"average_amount" text NOT NULL,
	"last_amount" text NOT NULL,
	"is_active" text NOT NULL
);
