import { after } from "next/server";
import { runJobs } from "@/server/jobs";
import { log } from "@/server/log";
import { handlePlaidWebhook, verifyPlaidWebhook } from "@/server/plaid/webhook";

/** Public endpoint: every request must carry a valid Plaid signature over the exact body. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyPlaidWebhook(raw, req.headers.get("plaid-verification")))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    const r = await handlePlaidWebhook(raw);
    if (r.status === "ok") after(() => runJobs({ limit: 3, timeBudgetMs: 55_000 }));
    return Response.json({ received: true });
  } catch (err) {
    log.error("webhook handling failed", err);
    return Response.json({ error: "Temporary failure" }, { status: 500 });
  }
}
