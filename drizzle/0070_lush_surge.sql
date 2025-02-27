CREATE TABLE IF NOT EXISTS "walkthrough_status" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL
);
