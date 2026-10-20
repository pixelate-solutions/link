import { authMode, currentUserId, ensureUser } from "@/server/auth";
import { mcpHandler } from "@/server/ai/mcp";
import { bearerToken, verifyApiToken } from "@/server/services/api-tokens";

/**
 * MCP over Streamable HTTP. The caller must be authenticated (a Link API token,
 * Clerk session, OAuth token or API key; or the dev session locally). Tools run as that user only.
 */
async function resolveUser(req: Request): Promise<string | null> {
  if (authMode() === "clerk") {
    const { auth } = await import("@clerk/nextjs/server");
    const a = await auth({ acceptsToken: ["session_token", "oauth_token", "api_key"] });
    return a.isAuthenticated ? ((a as { userId?: string; subject?: string }).userId ?? (a as { subject?: string }).subject ?? null) : null;
  }
  void req;
  return currentUserId();
}

async function handle(req: Request) {
  // A read-only Link token gets the read tools and nothing that records or proposes;
  // a write token gets every tool, like a signed-in session.
  const token = bearerToken(req);
  const verified = token ? await verifyApiToken(token) : null;
  const userId = token ? (verified?.userId ?? null) : await resolveUser(req);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  await ensureUser(userId);
  const readOnly = Boolean(token) && verified?.access !== "write";
  const scopes = readOnly ? ["link:read"] : ["link:read", "link:propose"];
  return mcpHandler.fetch(req, { authInfo: { token: token ? "api_token" : "session", clientId: "link", scopes, extra: { userId, readOnly } } });
}

export { handle as GET, handle as POST, handle as DELETE };
