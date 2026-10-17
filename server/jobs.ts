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
      await syncConnection(String((j.payload as { connectionId: string }).connectionId), j.userId!);
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

export async function runJobs(opts: { limit?: number; timeBudgetMs?: number } = {}) {
  const db = await getDb();
  const limit = opts.limit ?? 10;
  const deadline = Date.now() + (opts.timeBudgetMs ?? 50_000);
  const h = await handlers();
  // Recover jobs whose worker died mid-run.
  await db.execute(sql`update link.jobs set status = 'queued', locked_at = null where status = 'running' and locked_at < now() - interval '10 minutes'`);
  let processed = 0;
  while (processed < limit && Date.now() < deadline) {
    const claimed = (await db.execute(sql`
      update link.jobs set status = 'running', locked_at = now(), attempts = attempts + 1
      where id = (
        select id from link.jobs where status = 'queued' and run_after <= now()
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
      const failed = job.attempts >= job.maxAttempts;
      const backoffSeconds = Math.min(3600, 30 * 2 ** (job.attempts - 1));
      await db.execute(sql`
        update link.jobs set status = ${failed ? "failed" : "queued"}, last_error = ${message.slice(0, 500)},
          run_after = now() + make_interval(secs => ${backoffSeconds}), locked_at = null,
          finished_at = ${failed ? sql`now()` : sql`null`}
        where id = ${job.id}`);
      log.error("job failed", err, { jobId: job.id, type: job.type, attempts: job.attempts, terminal: failed });
    }
    processed++;
  }
  return { processed };
}
