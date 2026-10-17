import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Link 2.0 lives in its own Postgres schema so the legacy `public` tables stay
 * untouched until a verified import has run (see docs/DATABASE_MIGRATION.md).
 *
 * Conventions
 *  - Money: bigint minor units (`*_minor`), sign + = inflow to the user.
 *  - Calendar dates: `date` strings (YYYY-MM-DD). Instants: timestamptz.
 *  - Every user-owned row carries `user_id` and is only ever queried with it.
 */
export const link = pgSchema("link");

const id = () => uuid("id").primaryKey().defaultRandom();
const userId = () =>
  text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });
const money = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ── Identity ────────────────────────────────────────────────────────────────

export const users = link.table("users", {
  id: text("id").primaryKey(), // Clerk user id
  email: text("email"),
  name: text("name"),
  timezone: text("timezone").notNull().default("America/New_York"),
  currency: text("currency").notNull().default("USD"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Structured planning inputs (age, retirement spending, …) with provenance. */
export const facts = link.table(
  "facts",
  {
    id: id(),
    userId: userId(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    source: text("source").notNull(), // user | connected | inferred | assumed
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("facts_user_key").on(t.userId, t.key)],
);

export const preferences = link.table("preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 0 = reach goals as fast as possible, 100 = protect today's lifestyle. */
  lifestyleWeight: integer("lifestyle_weight").notNull().default(50),
  protectedCategories: text("protected_categories").array().notNull().default(sql`'{}'::text[]`),
  bufferMinor: money("buffer_minor"),
  /** Monthly savings the user committed to; Safe to Spend reserves it. */
  committedSavingsMinor: money("committed_savings_minor").notNull().default(0),
  notifyEmail: boolean("notify_email").notNull().default(false),
  updatedAt: updatedAt(),
});

// ── Connections & accounts ──────────────────────────────────────────────────

export const connections = link.table(
  "connections",
  {
    id: id(),
    userId: userId(),
    provider: text("provider").notNull().default("plaid"),
    itemId: text("item_id").notNull(),
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    accessTokenEnc: text("access_token_enc").notNull(),
    cursor: text("cursor"),
    status: text("status").notNull().default("active"), // active | login_required | error | disconnected
    errorCode: text("error_code"),
    initialSyncDone: boolean("initial_sync_done").notNull().default(false),
    historicalSyncDone: boolean("historical_sync_done").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("connections_provider_item").on(t.provider, t.itemId), index("connections_user").on(t.userId)],
);

export const accounts = link.table(
  "accounts",
  {
    id: id(),
    userId: userId(),
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id"),
    name: text("name").notNull(),
    officialName: text("official_name"),
    mask: text("mask"),
    type: text("type").notNull(), // depository | credit | loan | investment | other
    subtype: text("subtype"),
    currency: text("currency").notNull().default("USD"),
    /** Provider convention: positive = owed for credit/loan, held for assets. */
    currentMinor: money("current_minor"),
    availableMinor: money("available_minor"),
    limitMinor: money("limit_minor"),
    balanceAsOf: timestamp("balance_as_of", { withTimezone: true }),
    aprBps: integer("apr_bps"),
    minPaymentMinor: money("min_payment_minor"),
    statementBalanceMinor: money("statement_balance_minor"),
    nextPaymentDue: date("next_payment_due", { mode: "string" }),
    source: text("source").notNull().default("plaid"), // plaid | manual | legacy
    hidden: boolean("hidden").notNull().default(false),
    closed: boolean("closed").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("accounts_connection_provider").on(t.connectionId, t.providerAccountId),
    index("accounts_user").on(t.userId),
  ],
);

export const balanceHistory = link.table(
  "balance_history",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: userId(),
    date: date("date", { mode: "string" }).notNull(),
    currentMinor: money("current_minor").notNull(),
  },
  (t) => [uniqueIndex("balance_history_account_date").on(t.accountId, t.date), index("balance_history_user").on(t.userId, t.date)],
);

// ── Transactions ────────────────────────────────────────────────────────────

export const transactions = link.table(
  "transactions",
  {
    id: id(),
    userId: userId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Provider's id; for manual rows a generated one. Never our primary key. */
    providerId: text("provider_id").notNull(),
    pendingProviderId: text("pending_provider_id"),
    amountMinor: money("amount_minor").notNull(),
    currency: text("currency").notNull().default("USD"),
    date: date("date", { mode: "string" }).notNull(),
    authorizedDate: date("authorized_date", { mode: "string" }),
    pending: boolean("pending").notNull().default(false),
    // Source facts — never overwritten by enrichment.
    name: text("name").notNull(),
    providerMerchant: text("provider_merchant"),
    providerPrimary: text("provider_primary"),
    providerDetailed: text("provider_detailed"),
    providerConfidence: text("provider_confidence"),
    paymentChannel: text("payment_channel"),
    // Enrichment.
    merchant: text("merchant").notNull(),
    merchantKey: text("merchant_key").notNull(),
    kind: text("kind").notNull(),
    category: text("category").notNull(),
    classSource: text("class_source").notNull(),
    confidence: real("confidence").notNull(),
    reason: text("reason"),
    needsReview: boolean("needs_review").notNull().default(false),
    userLocked: boolean("user_locked").notNull().default(false),
    transferPairId: uuid("transfer_pair_id"),
    recurringId: uuid("recurring_id"),
    hasSplits: boolean("has_splits").notNull().default(false),
    note: text("note"),
    legacyCategory: text("legacy_category"),
    source: text("source").notNull().default("plaid"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("transactions_account_provider").on(t.accountId, t.providerId),
    index("transactions_user_date").on(t.userId, t.date),
    index("transactions_user_merchant").on(t.userId, t.merchantKey),
    index("transactions_review").on(t.userId).where(sql`${t.needsReview} and ${t.removedAt} is null`),
  ],
);

export const splits = link.table(
  "splits",
  {
    id: id(),
    userId: userId(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    amountMinor: money("amount_minor").notNull(),
    category: text("category").notNull(),
    kind: text("kind").notNull(),
    note: text("note"),
  },
  (t) => [index("splits_transaction").on(t.transactionId)],
);

export const rules = link.table(
  "rules",
  {
    id: id(),
    userId: userId(),
    description: text("description").notNull(),
    when: jsonb("when").notNull(),
    unless: jsonb("unless"),
    then: jsonb("then").notNull(),
    priority: integer("priority").notNull().default(100),
    source: text("source").notNull().default("user"), // user | legacy | ai
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("rules_user").on(t.userId)],
);

export const corrections = link.table(
  "corrections",
  {
    id: id(),
    userId: userId(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    merchantKey: text("merchant_key").notNull(),
    before: jsonb("before").notNull(),
    after: jsonb("after").notNull(),
    createdAt: createdAt(),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
  },
  (t) => [index("corrections_user_merchant").on(t.userId, t.merchantKey)],
);

export const recurring = link.table(
  "recurring",
  {
    id: id(),
    userId: userId(),
    key: text("key").notNull(),
    merchant: text("merchant").notNull(),
    kind: text("kind").notNull(), // income | bill | subscription | transfer | savings | card_payment
    category: text("category").notNull(),
    cadence: text("cadence").notNull(),
    amountMinor: money("amount_minor").notNull(),
    variability: real("variability").notNull().default(0),
    firstDate: date("first_date", { mode: "string" }).notNull(),
    lastDate: date("last_date", { mode: "string" }).notNull(),
    nextDate: date("next_date", { mode: "string" }),
    occurrences: integer("occurrences").notNull(),
    confidence: real("confidence").notNull(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"), // active | ended | ignored
    userConfirmed: boolean("user_confirmed").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("recurring_user_key").on(t.userId, t.key)],
);

// ── Goals & planning ────────────────────────────────────────────────────────

export const goals = link.table(
  "goals",
  {
    id: id(),
    userId: userId(),
    statement: text("statement").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    priority: integer("priority").notNull().default(1),
    status: text("status").notNull().default("active"), // active | achieved | paused | archived
    interpretation: jsonb("interpretation").notNull(),
    targetMinor: money("target_minor"),
    targetDate: date("target_date", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("goals_user").on(t.userId)],
);

export const goalProgress = link.table(
  "goal_progress",
  {
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    userId: userId(),
    date: date("date", { mode: "string" }).notNull(),
    metrics: jsonb("metrics").notNull(),
  },
  (t) => [uniqueIndex("goal_progress_goal_date").on(t.goalId, t.date)],
);

export const budgets = link.table(
  "budgets",
  {
    id: id(),
    userId: userId(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("active"), // active | superseded
    origin: text("origin").notNull(), // auto | user | recommendation
    items: jsonb("items").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budgets_user_version").on(t.userId, t.version)],
);

export const scenarios = link.table(
  "scenarios",
  {
    id: id(),
    userId: userId(),
    title: text("title").notNull(),
    changes: jsonb("changes").notNull(),
    result: jsonb("result"),
    status: text("status").notNull().default("draft"), // draft | accepted | discarded
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("scenarios_user").on(t.userId)],
);

export const recommendations = link.table(
  "recommendations",
  {
    id: id(),
    userId: userId(),
    fingerprint: text("fingerprint").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    action: jsonb("action"),
    impact: jsonb("impact").notNull(),
    evidence: jsonb("evidence").notNull(),
    assumptions: jsonb("assumptions").notNull(),
    tradeoffs: text("tradeoffs"),
    goalIds: uuid("goal_ids").array().notNull().default(sql`'{}'::uuid[]`),
    confidence: real("confidence").notNull(),
    score: real("score").notNull(),
    /** Monthly impact when last shown/dismissed; resurfacing requires a material change. */
    basisMinor: money("basis_minor").notNull(),
    status: text("status").notNull().default("active"), // active | applied | done | dismissed | expired
    feedback: text("feedback"),
    createdAt: createdAt(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("recommendations_user_fingerprint").on(t.userId, t.fingerprint), index("recommendations_user_status").on(t.userId, t.status)],
);

/** Latest computed financial state per user; every surface reads from here. */
export const snapshots = link.table("snapshots", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
  asOf: date("as_of", { mode: "string" }).notNull(),
  version: integer("version").notNull(),
  data: jsonb("data").notNull(),
});

// ── AI ──────────────────────────────────────────────────────────────────────

export const conversations = link.table(
  "conversations",
  {
    id: id(),
    userId: userId(),
    title: text("title"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("conversations_user").on(t.userId, t.updatedAt)],
);

export const messages = link.table(
  "messages",
  {
    id: id(),
    userId: userId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    parts: jsonb("parts"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation").on(t.conversationId, t.createdAt)],
);

export const agentRuns = link.table(
  "agent_runs",
  {
    id: id(),
    userId: userId(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(), // chat | goal | classify
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_runs_user").on(t.userId, t.createdAt)],
);

export const toolCalls = link.table(
  "tool_calls",
  {
    id: id(),
    userId: userId(),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // agent | mcp
    tool: text("tool").notNull(),
    args: jsonb("args").notNull(),
    ok: boolean("ok").notNull(),
    summary: text("summary"),
    durationMs: integer("duration_ms").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("tool_calls_user").on(t.userId, t.createdAt)],
);

export const memories = link.table(
  "memories",
  {
    id: id(),
    userId: userId(),
    content: text("content").notNull(),
    kind: text("kind").notNull(), // preference | fact | constraint
    source: text("source").notNull(), // user | agent
    createdAt: createdAt(),
  },
  (t) => [index("memories_user").on(t.userId)],
);

/** Consequential changes the agent wants to make; applied only after the user approves. */
export const proposals = link.table(
  "proposals",
  {
    id: id(),
    userId: userId(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    summary: text("summary").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("proposals_user").on(t.userId, t.status)],
);

// ── Infrastructure ──────────────────────────────────────────────────────────

export const jobs = link.table(
  "jobs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    type: text("type").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull().default({}),
    dedupeKey: text("dedupe_key"),
    status: text("status").notNull().default("queued"), // queued | running | done | failed
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("jobs_ready").on(t.status, t.runAfter),
    // Only one *queued* copy per key; a new one may queue while another runs.
    uniqueIndex("jobs_dedupe_queued").on(t.dedupeKey).where(sql`${t.status} = 'queued'`),
  ],
);

export const webhookEvents = link.table(
  "webhook_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    eventKey: text("event_key").notNull(),
    type: text("type").notNull(),
    itemId: text("item_id"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_key").on(t.provider, t.eventKey)],
);

export const auditLog = link.table(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id").notNull(),
    actor: text("actor").notNull(), // user | agent | system
    action: text("action").notNull(),
    target: text("target"),
    meta: jsonb("meta"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_user").on(t.userId, t.createdAt)],
);
