import { cookies } from "next/headers";
import { z } from "zod";
import { authMode, DEV_COOKIE, devSessionValue, ensureUser } from "@/server/auth";

/** Local development sign-in. Refuses to run unless dev auth is explicitly enabled outside production. */
export async function POST(req: Request) {
  if (authMode() !== "dev") return Response.json({ error: "Not available" }, { status: 404 });
  const body = z.object({ name: z.string().trim().min(1).max(40) }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "Enter a name" }, { status: 400 });
  const userId = `dev_${body.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}`;
  await ensureUser(userId, { name: body.data.name, email: null });
  (await cookies()).set(DEV_COOKIE, devSessionValue(userId), { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 60 * 60 * 24 * 30 });
  return Response.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(DEV_COOKIE);
  return Response.json({ ok: true });
}
