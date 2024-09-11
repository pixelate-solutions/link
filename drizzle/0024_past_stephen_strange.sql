CREATE TABLE IF NOT EXISTS "user_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"item_id" text,
	"created_at" timestamp DEFAULT now()
);
