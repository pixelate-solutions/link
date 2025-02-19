CREATE TABLE IF NOT EXISTS "chat_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"question" text NOT NULL,
	"response" text NOT NULL,
	"response_date" timestamp NOT NULL
);
