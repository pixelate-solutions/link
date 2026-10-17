import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { runJobs } from "@/server/jobs";
import { log } from "@/server/log";
import { plaidErrorCode } from "@/server/plaid/client";
import { exchangePublicToken } from "@/server/plaid/sync";

const Body = z.object({ publicToken: z.string().min(10).max(200), institution: z.object({ id: z.string().nullable().optional(), name: z.string().nullable().optional() }).optional() });

/** Exchange happens server-side; the access token never reaches the browser. */
export async function POST(req: Request) {
  const userId = await requireUser().catch(() => null);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  try {
    const connectionId = await exchangePublicToken(userId, body.data.publicToken, body.data.institution ?? {});
    after(() => runJobs({ limit: 3, timeBudgetMs: 55_000 }));
    return Response.json({ connectionId });
  } catch (err) {
    log.error("exchange failed", err, { code: plaidErrorCode(err) });
    return Response.json({ error: "Couldn't finish connecting. Try again." }, { status: 502 });
  }
}
