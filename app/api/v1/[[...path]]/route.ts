import { apiIndex, handleApiRequest, type Method } from "@/server/api/v1";
import { currentUserId, ensureUser } from "@/server/auth";
import { log } from "@/server/log";
import { bearerToken, verifyApiToken } from "@/server/services/api-tokens";

export const maxDuration = 60;

const MAX_BODY = 100_000;
const json = (body: unknown, status: number, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * REST API. Authenticated by a Link API token (`Authorization: Bearer link_…`) or, for
 * reads from the browser, the signed-in session. Changes need a token with write access,
 * never the session cookie, so another site can't make them on your behalf.
 * `GET /api/v1` describes every endpoint.
 */
async function handle(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  // Next routes HEAD to the GET handler; it's a read.
  const method = (req.method === "HEAD" ? "GET" : req.method) as Method;
  const segments = (await params).path ?? [];
  const url = new URL(req.url);
  if (!segments.length && method === "GET") return json(apiIndex(url.origin), 200);

  const token = bearerToken(req);
  const verified = token ? await verifyApiToken(token) : null;
  const userId = token ? (verified?.userId ?? null) : req.headers.has("authorization") || method !== "GET" ? null : await currentUserId();
  if (!userId) return json({ error: "Unauthorized. Send Authorization: Bearer <Link API token>." }, 401, { "WWW-Authenticate": "Bearer" });
  if (!token) await ensureUser(userId);

  const canWrite = verified?.access === "write";
  if (method !== "GET" && !canWrite) return json({ error: "This token is read-only. Create a read-and-change token in Account → API access." }, 403);

  let body: unknown = undefined;
  if (method !== "GET") {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "Request body is too large." }, 413);
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > MAX_BODY) return json({ error: "Request body is too large." }, 413);
    try {
      const text = new TextDecoder().decode(bytes);
      body = text.trim() ? JSON.parse(text) : {};
    } catch {
      return json({ error: "Request body must be JSON." }, 400);
    }
  }

  try {
    return await handleApiRequest({ userId, method, segments, query: url.searchParams, body, canWrite, tokenId: verified?.tokenId });
  } catch (err) {
    log.error("api.v1 failed", err, { method, path: segments.join("/") });
    return json({ error: "Something went wrong. Try again." }, 500);
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
