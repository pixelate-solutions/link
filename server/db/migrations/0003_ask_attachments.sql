CREATE TABLE "link"."attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "link"."proposals" DROP CONSTRAINT "proposals_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "link"."attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."attachments" ADD CONSTRAINT "attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "link"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "link"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_user" ON "link"."attachments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "attachments_message" ON "link"."attachments" USING btree ("message_id");--> statement-breakpoint
ALTER TABLE "link"."proposals" ADD CONSTRAINT "proposals_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "link"."conversations"("id") ON DELETE set null ON UPDATE no action;