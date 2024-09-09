ALTER TABLE "categories" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "is_from_plaid" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "plaid_category_id" text;