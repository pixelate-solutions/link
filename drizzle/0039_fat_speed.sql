CREATE TABLE IF NOT EXISTS "chat_access" (
	"customer_id" text NOT NULL,
	"allow_access" boolean DEFAULT false NOT NULL
);
