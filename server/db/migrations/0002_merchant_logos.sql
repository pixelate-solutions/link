ALTER TABLE "link"."transactions" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "link"."transactions" ADD COLUMN "website" text;--> statement-breakpoint
-- One-time backfill: resync Plaid items from the start so existing transactions pick up merchant logos.
-- Unchanged records only get logo_url/website filled in (see applySyncBatch); nothing is re-categorized.
UPDATE "link"."connections" SET "cursor" = NULL WHERE "provider" = 'plaid' AND "status" <> 'disconnected';
