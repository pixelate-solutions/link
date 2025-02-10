import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { notifications } from "@/db/schema";

const app = new Hono();

app.post("/", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Check if any notification entries exist for this user.
  const existingNotifications = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId));

  // If no notifications exist, insert the default "BudgetExceeded" notification.
  if (existingNotifications.length === 0) {
    await db.insert(notifications).values({
      id: createId(),
      userId,
      name: "BudgetExceeded",
      toggled: true,
    });
  }

  return ctx.json({ message: "Default notifications checked and updated." }, 200);
}).post("/on", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Update the "BudgetExceeded" notification to toggled = true
  await db
    .update(notifications)
    .set({ toggled: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.name, "BudgetExceeded")));

  return ctx.json({ message: "Notification enabled." }, 200);
}).post("/off", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Update the "BudgetExceeded" notification to toggled = false
  await db
    .update(notifications)
    .set({ toggled: false })
    .where(and(eq(notifications.userId, userId), eq(notifications.name, "BudgetExceeded")));

  return ctx.json({ message: "Notification disabled." }, 200);
});

export default app;
