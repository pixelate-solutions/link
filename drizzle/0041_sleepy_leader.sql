ALTER TABLE "recurring_transactions" RENAME COLUMN "category_name" TO "category_id";--> statement-breakpoint
ALTER TABLE "recurring_transactions" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "recurring_transactions" DROP COLUMN IF EXISTS "merchant_name";