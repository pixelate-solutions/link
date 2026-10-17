import { timingSafeEqual } from "node:crypto";
import { enqueue, runJobs } from "@/server/jobs";

export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * Scheduled entry point (e.g. Vercel Cron every 15 minutes): drains the job
 * queue; with ?review=1 (daily) it also schedules a refresh for every user.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (new URL(req.url).searchParams.get("review") === "1") {
    await enqueue({ type: "refresh_all", dedupeKey: `refresh_all:${new Date().toISOString().slice(0, 10)}` });
  }
  const r = await runJobs({ limit: 50, timeBudgetMs: 280_000 });
  return Response.json(r);
}
