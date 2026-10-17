import { z } from "zod";
import { requireUser } from "@/server/auth";
import { log } from "@/server/log";
import { plaidConfigured, plaidErrorCode } from "@/server/plaid/client";
import { createLinkToken } from "@/server/plaid/sync";

export async function POST(req: Request) {
  const userId = await requireUser().catch(() => null);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return Response.json({ error: "Bank connections aren't configured on this server yet." }, { status: 503 });
  const body = z.object({ connectionId: z.string().uuid().optional() }).safeParse(await req.json().catch(() => ({})));
  try {
    const linkToken = await createLinkToken(userId, body.success ? body.data.connectionId : undefined);
    return Response.json({ linkToken });
  } catch (err) {
    log.error("link-token failed", err, { code: plaidErrorCode(err) });
    return Response.json({ error: "Couldn't start the bank connection. Try again." }, { status: 502 });
  }
}
