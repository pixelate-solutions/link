CREATE TABLE IF NOT EXISTS "referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"effective_date" text NOT NULL,
	"amount" integer NOT NULL,
	"applied" boolean DEFAULT false
);
