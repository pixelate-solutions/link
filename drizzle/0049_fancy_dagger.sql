CREATE TABLE IF NOT EXISTS "chat_info_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
