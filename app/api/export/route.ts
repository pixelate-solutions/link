import { requireUser } from "@/server/auth";
import { audit } from "@/server/services/audit";
import { exportUserData } from "@/server/services/account";

export async function GET() {
  const userId = await requireUser().catch(() => null);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const data = await exportUserData(userId);
  await audit(userId, "user", "account.export");
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="link-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
