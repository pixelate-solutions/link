CREATE SCHEMA IF NOT EXISTS "link";
--> statement-breakpoint
CREATE TABLE "link"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" uuid,
	"provider_account_id" text,
	"name" text NOT NULL,
	"official_name" text,
	"mask" text,
	"type" text NOT NULL,
	"subtype" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"current_minor" bigint,
	"available_minor" bigint,
	"limit_minor" bigint,
	"balance_as_of" timestamp with time zone,
	"apr_bps" integer,
	"min_payment_minor" bigint,
	"statement_balance_minor" bigint,
	"next_payment_due" date,
	"source" text DEFAULT 'plaid' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "link"."audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."balance_history" (
	"account_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"current_minor" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"origin" text NOT NULL,
	"items" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'plaid' NOT NULL,
	"item_id" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"access_token_enc" text NOT NULL,
	"cursor" text,
	"status" text DEFAULT 'active' NOT NULL,
	"error_code" text,
	"initial_sync_done" boolean DEFAULT false NOT NULL,
	"historical_sync_done" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_webhook_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"merchant_key" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "link"."facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."goal_progress" (
	"goal_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"metrics" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"statement" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"interpretation" jsonb NOT NULL,
	"target_minor" bigint,
	"target_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "link"."jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"type" text NOT NULL,
	"user_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "link"."memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"parts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"lifestyle_weight" integer DEFAULT 50 NOT NULL,
	"protected_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"buffer_minor" bigint,
	"committed_savings_minor" bigint DEFAULT 0 NOT NULL,
	"notify_email" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "link"."recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"action" jsonb,
	"impact" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"assumptions" jsonb NOT NULL,
	"tradeoffs" text,
	"goal_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"confidence" real NOT NULL,
	"score" real NOT NULL,
	"basis_minor" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "link"."recurring" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"merchant" text NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"cadence" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"variability" real DEFAULT 0 NOT NULL,
	"first_date" date NOT NULL,
	"last_date" date NOT NULL,
	"next_date" date,
	"occurrences" integer NOT NULL,
	"confidence" real NOT NULL,
	"account_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"user_confirmed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"description" text NOT NULL,
	"when" jsonb NOT NULL,
	"unless" jsonb,
	"then" jsonb NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"changes" jsonb NOT NULL,
	"result" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."snapshots" (
	"user_id" text PRIMARY KEY NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"as_of" date NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"category" text NOT NULL,
	"kind" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "link"."tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"run_id" uuid,
	"channel" text NOT NULL,
	"tool" text NOT NULL,
	"args" jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"summary" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"pending_provider_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"date" date NOT NULL,
	"authorized_date" date,
	"pending" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"provider_merchant" text,
	"provider_primary" text,
	"provider_detailed" text,
	"provider_confidence" text,
	"payment_channel" text,
	"merchant" text NOT NULL,
	"merchant_key" text NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"class_source" text NOT NULL,
	"confidence" real NOT NULL,
	"reason" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"user_locked" boolean DEFAULT false NOT NULL,
	"transfer_pair_id" uuid,
	"recurring_id" uuid,
	"has_splits" boolean DEFAULT false NOT NULL,
	"note" text,
	"source" text DEFAULT 'plaid' NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link"."webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_key" text NOT NULL,
	"type" text NOT NULL,
	"item_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "link"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."accounts" ADD CONSTRAINT "accounts_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "link"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "link"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."balance_history" ADD CONSTRAINT "balance_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "link"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."balance_history" ADD CONSTRAINT "balance_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."connections" ADD CONSTRAINT "connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."corrections" ADD CONSTRAINT "corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."corrections" ADD CONSTRAINT "corrections_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "link"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."facts" ADD CONSTRAINT "facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."goal_progress" ADD CONSTRAINT "goal_progress_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "link"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."goal_progress" ADD CONSTRAINT "goal_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "link"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."preferences" ADD CONSTRAINT "preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."proposals" ADD CONSTRAINT "proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."proposals" ADD CONSTRAINT "proposals_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "link"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."recurring" ADD CONSTRAINT "recurring_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."recurring" ADD CONSTRAINT "recurring_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "link"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."rules" ADD CONSTRAINT "rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."scenarios" ADD CONSTRAINT "scenarios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."snapshots" ADD CONSTRAINT "snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."splits" ADD CONSTRAINT "splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."splits" ADD CONSTRAINT "splits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "link"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."tool_calls" ADD CONSTRAINT "tool_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."tool_calls" ADD CONSTRAINT "tool_calls_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "link"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "link"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link"."transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "link"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_connection_provider" ON "link"."accounts" USING btree ("connection_id","provider_account_id");--> statement-breakpoint
CREATE INDEX "accounts_user" ON "link"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_runs_user" ON "link"."agent_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_user" ON "link"."audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "balance_history_account_date" ON "link"."balance_history" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "balance_history_user" ON "link"."balance_history" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_user_version" ON "link"."budgets" USING btree ("user_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_provider_item" ON "link"."connections" USING btree ("provider","item_id");--> statement-breakpoint
CREATE INDEX "connections_user" ON "link"."connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_user" ON "link"."conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "corrections_user_merchant" ON "link"."corrections" USING btree ("user_id","merchant_key");--> statement-breakpoint
CREATE UNIQUE INDEX "facts_user_key" ON "link"."facts" USING btree ("user_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_progress_goal_date" ON "link"."goal_progress" USING btree ("goal_id","date");--> statement-breakpoint
CREATE INDEX "goals_user" ON "link"."goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "jobs_ready" ON "link"."jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_queued" ON "link"."jobs" USING btree ("dedupe_key") WHERE "link"."jobs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "memories_user" ON "link"."memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation" ON "link"."messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "proposals_user" ON "link"."proposals" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_user_fingerprint" ON "link"."recommendations" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "recommendations_user_status" ON "link"."recommendations" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_user_key" ON "link"."recurring" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "rules_user" ON "link"."rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scenarios_user" ON "link"."scenarios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "splits_transaction" ON "link"."splits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "tool_calls_user" ON "link"."tool_calls" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_account_provider" ON "link"."transactions" USING btree ("account_id","provider_id");--> statement-breakpoint
CREATE INDEX "transactions_user_date" ON "link"."transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "transactions_user_merchant" ON "link"."transactions" USING btree ("user_id","merchant_key");--> statement-breakpoint
CREATE INDEX "transactions_review" ON "link"."transactions" USING btree ("user_id") WHERE "link"."transactions"."needs_review" and "link"."transactions"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_key" ON "link"."webhook_events" USING btree ("provider","event_key");