CREATE TABLE "link"."businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"structure" text DEFAULT 'llc' NOT NULL,
	"ownership_pct" integer DEFAULT 100 NOT NULL,
	"count_toward_goals" boolean DEFAULT false NOT NULL,
	"tax_set_aside_pct" integer DEFAULT 25 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "link"."accounts" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "link"."businesses" ADD CONSTRAINT "businesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "businesses_user" ON "link"."businesses" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "link"."accounts" ADD CONSTRAINT "accounts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "link"."businesses"("id") ON DELETE set null ON UPDATE no action;