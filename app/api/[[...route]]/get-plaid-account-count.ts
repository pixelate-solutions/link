import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const app = new Hono();

app.get('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  const accountList = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isFromPlaid, true)));

  const count = accountList.length;

  return ctx.json({ count: count });
});

export default app;
