import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { walkthrough_status } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

const app = new Hono();

// GET endpoint: Retrieves the walkthrough status for the logged-in user.
// If no record exists, it creates one with hidden set to false.
app.get("/", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  if (!auth?.userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  const [entry] = await db
    .select()
    .from(walkthrough_status)
    .where(eq(walkthrough_status.userId, auth.userId));

  if (!entry) {
    const newEntry = {
      id: createId(),
      userId: auth.userId,
      hidden: false,
    };
    await db.insert(walkthrough_status).values(newEntry);
    return ctx.json({ hidden: false });
  }

  return ctx.json({ hidden: entry.hidden });
});

// POST endpoint: Updates the walkthrough status to hidden (true) for the logged-in user.
// If no record exists, it creates one with hidden set to true.
app.post("/hide-walkthrough", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  if (!auth?.userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  const [entry] = await db
    .select()
    .from(walkthrough_status)
    .where(eq(walkthrough_status.userId, auth.userId));

  if (!entry) {
    const newEntry = {
      id: createId(),
      userId: auth.userId,
      hidden: true,
    };
    await db.insert(walkthrough_status).values(newEntry);
    return ctx.json({ hidden: true });
  }

  await db
    .update(walkthrough_status)
    .set({ hidden: true })
    .where(eq(walkthrough_status.userId, auth.userId));

  return ctx.json({ hidden: true });
});

export default app;
