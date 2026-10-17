import { authMode, currentUserId, ensureUser } from "@/server/auth";
import { mcpHandler } from "@/server/ai/mcp";

/**
 * MCP over Streamable HTTP. The caller must be authenticated (Clerk session,
 * OAuth token or API key; or the dev session locally). Tools run as that user only.
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
  const userId = await resolveUser(req);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  await ensureUser(userId);
  return mcpHandler.fetch(req, { authInfo: { token: "session", clientId: "link", scopes: ["link:read", "link:propose"], extra: { userId } } });
}

export { handle as GET, handle as POST, handle as DELETE };
