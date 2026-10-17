import { sql } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { log } from "./log";

/**
 * Postgres-backed job queue: idempotent enqueue (dedupe key), claim with
 * SKIP LOCKED, exponential backoff, and a terminal `failed` state that keeps
 * the last error for inspection. Runs from the cron route or `npm run jobs:work`.
 */
export type JobType = "plaid_sync" | "process_user" | "refresh_all" | "ai_classify";

export async function enqueue(job: { type: JobType; userId?: string | null; payload?: Record<string, unknown>; dedupeKey?: string; runAfter?: Date }) {
  const db = await getDb();
  await db
    .insert(schema.jobs)
    .values({
      type: job.type,
      userId: job.userId ?? null,
      payload: job.payload ?? {},
      dedupeKey: job.dedupeKey ?? null,
      runAfter: job.runAfter ?? new Date(),
    })
    .onConflictDoNothing();
}

type Handler = (job: typeof schema.jobs.$inferSelect) => Promise<void>;

async function handlers(): Promise<Record<JobType, Handler>> {
  const [{ syncConnection }, { processUser, refreshAll }, { aiClassifyUser }] = await Promise.all([
    import("./plaid/sync"),
    import("./pipeline/process"),
    import("./ai/classify"),
  ]);
  return {
    plaid_sync: async (j) => {
      const { connectionId, waits = 0 } = j.payload as { connectionId: string; waits?: number };
      const r = await syncConnection(String(connectionId), j.userId!);
      // Plaid prepares new items asynchronously; until the first transactions arrive, check
      // back shortly (webhooks also trigger syncs, but may be unavailable, e.g. locally).
      if (r.added === 0 && r.modified === 0 && waits < 20) {
        const { and, count, eq } = await import("drizzle-orm");
        const d = await getDb();
        const [c] = await d
          .select({ initialSyncDone: schema.connections.initialSyncDone })
          .from(schema.connections)
          .where(and(eq(schema.connections.id, String(connectionId)), eq(schema.connections.userId, j.userId!)));
        const [row] = await d
          .select({ n: count() })
          .from(schema.transactions)
          .innerJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
          .where(and(eq(schema.accounts.connectionId, String(connectionId)), eq(schema.transactions.userId, j.userId!)));
        if (c && !c.initialSyncDone && !row?.n) {
          await enqueue({ type: "plaid_sync", userId: j.userId, payload: { connectionId, waits: waits + 1 }, dedupeKey: `sync:${connectionId}`, runAfter: new Date(Date.now() + 15_000) });
        }
      }
    },
    process_user: async (j) => {
      await processUser(j.userId!);
    },
    refresh_all: async () => {
      await refreshAll();
    },
    ai_classify: async (j) => {
      await aiClassifyUser(j.userId!);
    },
  };
}

/** Drain due jobs. With `userId`, only that user's jobs run (for responsive, per-request work). */
export async function runJobs(opts: { limit?: number; timeBudgetMs?: number; userId?: string } = {}) {
  const db = await getDb();
  const limit = opts.limit ?? 10;
  const deadline = Date.now() + (opts.timeBudgetMs ?? 50_000);
  const h = await handlers();
  // Recover jobs whose worker died mid-run. A stale job that is out of attempts, or
  // already has a queued copy (only one may be queued per key), is retired instead.
  await db.execute(sql`
    update link.jobs j set status = 'failed', locked_at = null, finished_at = now(),
      last_error = coalesce(j.last_error, 'Worker stopped before finishing')
    where j.status = 'running' and j.locked_at < now() - interval '10 minutes'
      and (j.attempts >= j.max_attempts
        or (j.dedupe_key is not null and exists (select 1 from link.jobs q where q.dedupe_key = j.dedupe_key and q.status = 'queued')))`);
  await db.execute(sql`update link.jobs set status = 'queued', locked_at = null where status = 'running' and locked_at < now() - interval '10 minutes'`);
  let processed = 0;
  while (processed < limit && Date.now() < deadline) {
    const claimed = (await db.execute(sql`
      update link.jobs set status = 'running', locked_at = now(), attempts = attempts + 1
      where id = (
        select id from link.jobs j where status = 'queued' and run_after <= now()
          and (${opts.userId ?? null}::text is null or j.user_id = ${opts.userId ?? null})
          -- Jobs sharing a key (e.g. one connection's sync) never run concurrently.
          and (j.dedupe_key is null or not exists (select 1 from link.jobs r where r.dedupe_key = j.dedupe_key and r.status = 'running'))
        order by run_after, id for update skip locked limit 1
      )
      returning *`)) as unknown as { rows?: Record<string, unknown>[] } | Record<string, unknown>[];
    const rows = Array.isArray(claimed) ? claimed : (claimed.rows ?? []);
    const raw = rows[0];
    if (!raw) break;
    const job = {
      id: Number(raw.id),
      type: raw.type as JobType,
      userId: (raw.user_id as string | null) ?? null,
      payload: raw.payload as Record<string, unknown>,
      attempts: Number(raw.attempts),
      maxAttempts: Number(raw.max_attempts),
    } as typeof schema.jobs.$inferSelect;
    try {
      await h[job.type as JobType](job);
      await db.execute(sql`update link.jobs set status = 'done', finished_at = now(), last_error = null where id = ${job.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const backoffSeconds = Math.min(3600, 30 * 2 ** (job.attempts - 1));
      // Retry unless out of attempts or a newer copy is already queued (which supersedes this one).
      const rows = (await db.execute(sql`
        update link.jobs j set
          status = case when j.attempts >= j.max_attempts
            or (j.dedupe_key is not null and exists (select 1 from link.jobs q where q.dedupe_key = j.dedupe_key and q.status = 'queued' and q.id <> j.id))
            then 'failed' else 'queued' end,
          last_error = ${message.slice(0, 500)},
          run_after = now() + make_interval(secs => ${backoffSeconds}), locked_at = null
        where j.id = ${job.id}
        returning j.status`)) as unknown as { rows?: { status: string }[] } | { status: string }[];
      const status = (Array.isArray(rows) ? rows : (rows.rows ?? []))[0]?.status;
      if (status === "failed") await db.execute(sql`update link.jobs set finished_at = now() where id = ${job.id}`);
      const failed = status === "failed";
      log.error("job failed", err, { jobId: job.id, type: job.type, attempts: job.attempts, terminal: failed });
    }
    processed++;
  }
  return { processed };
}
