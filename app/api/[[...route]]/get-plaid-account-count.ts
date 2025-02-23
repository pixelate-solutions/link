import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { userTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

const app = new Hono();

app.get('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  const connectionsList = await db
    .select()
    .from(userTokens)
    .where(eq(userTokens.userId, userId));

  const count = connectionsList.length;

  return ctx.json({ count: count });
});

export default app;
