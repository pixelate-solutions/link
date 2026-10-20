import { apiIndex, handleApiRequest } from "@/server/api/v1";
import { currentUserId, ensureUser } from "@/server/auth";
import { log } from "@/server/log";
import { bearerToken, verifyApiToken } from "@/server/services/api-tokens";

export const maxDuration = 60;

/**
 * Read-only REST API. Authenticated by a Link API token (`Authorization: Bearer link_…`)
 * or, from the browser, the signed-in session. `GET /api/v1` describes every endpoint.
 */
export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const segments = (await params).path ?? [];
  const url = new URL(req.url);
  if (!segments.length) return Response.json(apiIndex(url.origin), { headers: { "Cache-Control": "no-store" } });

  const token = bearerToken(req);
  const userId = token ? await verifyApiToken(token) : req.headers.has("authorization") ? null : await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized. Send Authorization: Bearer <Link API token>." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  if (!token) await ensureUser(userId);

  try {
    return await handleApiRequest(userId, segments, url.searchParams);
  } catch (err) {
    log.error("api.v1 failed", err, { path: segments.join("/") });
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
