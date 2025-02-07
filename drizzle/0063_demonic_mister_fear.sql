CREATE TABLE IF NOT EXISTS "categorization_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category_id" text NOT NULL,
	"match_type" text NOT NULL,
	"match_value" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "plaid_type" DROP DEFAULT;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
