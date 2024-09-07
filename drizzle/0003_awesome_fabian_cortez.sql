CREATE TABLE IF NOT EXISTS "user_tokens" (
	"user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"item_id" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
