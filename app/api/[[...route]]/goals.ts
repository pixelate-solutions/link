import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/db/drizzle";
import { goals, insertGoalSchema, accounts, transactions } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { eq, inArray, sql, and } from "drizzle-orm";

const app = new Hono();
const updateGoalSchema = insertGoalSchema.partial();

// -------------------------------------------------------------------
// New: Goal Progress Endpoint
// This endpoint expects a query parameter "goalId" and must be defined 
// before dynamic routes (like "/:id") to avoid route matching conflicts.
// -------------------------------------------------------------------
app.get("/goal-progress", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  if (!auth?.userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Expect the goalId as a query parameter.
  const goalId = ctx.req.query("goalId");
  if (!goalId) {
    return ctx.json({ error: "Missing goalId" }, 400);
  }

  // Retrieve the goal record for this user.
  const [goal] = await db
    .select()
    .from(goals)
    .where(
      and(eq(goals.id, goalId), eq(goals.userId, auth.userId))
    );
  if (!goal) return ctx.json({ error: "Goal not found" }, 404);

  // Parse account IDs from the goal.
  let accountIds: string[] = [];
  try {
    accountIds = JSON.parse(goal.accountIds);
  } catch (err) {
    return ctx.json({ error: "Invalid accountIds format" }, 500);
  }

  // Sum the current balances for the selected accounts.
  const accountResult = await db
    .select({
      total: sql`COALESCE(SUM(CAST(${accounts.currentBalance} AS FLOAT)), 0)`.mapWith(Number),
    })
    .from(accounts)
    .where(inArray(accounts.id, accountIds));
  const currentAmount = accountResult[0]?.total || 0;

  // Calculate the average daily deposit over the last 30 days.
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const depositResult = await db
    .select({
      totalDeposits: sql`COALESCE(SUM(CAST(${transactions.amount} AS FLOAT)), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, accountIds),
        eq(transactions.userId, auth.userId),
        // Only include positive (deposit) transactions.
        sql`CAST(${transactions.amount} AS FLOAT) > 0`,
        // Consider only transactions in the last 30 days.
        sql`DATE(${transactions.date}) >= DATE(${thirtyDaysAgo.toISOString()})`
      )
    );
  const totalDeposits = depositResult[0]?.totalDeposits || 0;
  const averageDailyDeposit = totalDeposits / 30;

  // Calculate the number of days left until the goal date.
  const goalDate = new Date(goal.goalDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.ceil((goalDate.getTime() - today.getTime()) / msPerDay);

  // Compute the percentage of the goal achieved.
  const targetAmount = Number(goal.targetAmount);
  const percentage = targetAmount > 0 ? Math.min((currentAmount / targetAmount) * 100, 100) : 0;

  // Project the total amount at the goal date, assuming the current deposit rate continues.
  const projectedAdditional = averageDailyDeposit * (daysLeft > 0 ? daysLeft : 0);
  const projectedTotal = currentAmount + projectedAdditional;

  // Generate advice based on current progress and projection.
  let advice = "";
  if (currentAmount >= targetAmount) {
    advice = "Congratulations! You've reached your goal.";
  } else if (daysLeft <= 0) {
    advice = "The goal date has passed. Consider updating your goal.";
  } else {
    const neededPerDay = (targetAmount - currentAmount) / daysLeft;
    if (averageDailyDeposit >= neededPerDay) {
      advice = "Great job! At your current deposit rate, you're on track to meet your goal.";
    } else {
      const extraNeeded = neededPerDay - averageDailyDeposit;
      advice = `You need to save an additional $${extraNeeded.toFixed(
        2
      )} per day to reach your goal by the target date.`;
    }
  }

  // Return the computed progress data.
  return ctx.json({
    data: {
      currentAmount,
      targetAmount,
      percentage,
      averageDailyDeposit,
      daysLeft,
      projectedTotal,
      advice,
      chartData: null, // Placeholder: add chart data here if needed.
    },
  });
});

// Get all goals for the logged-in user.
app.get("/", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  if (!auth?.userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }
  const data = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, auth.userId));
  return ctx.json({ data });
});

// Create a new goal.
app.post(
  "/",
  clerkMiddleware(),
  zValidator("json", insertGoalSchema),
  async (ctx) => {
    const auth = getAuth(ctx);
    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized" }, 401);
    }
    const values = ctx.req.valid("json");
    const [goal] = await db
      .insert(goals)
      .values({
        id: createId(),
        userId: auth.userId,
        goalName: values.goalName,
        targetAmount: values.targetAmount,
        startDate: new Date(values.startDate),
        goalDate: new Date(values.goalDate),
        // Stringify the array of account IDs before storing.
        accountIds: JSON.stringify(values.accountIds),
      })
      .returning();
    return ctx.json({ data: goal });
  }
);

// Get a single goal.
app.get("/:id", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  if (!auth?.userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }
  const id = ctx.req.param("id");
  const [goal] = await db.select().from(goals).where(eq(goals.id, id));
  if (!goal) return ctx.json({ error: "Goal not found" }, 404);
  return ctx.json({ data: goal });
});

// Update a goal.
app.patch(
  "/:id",
  clerkMiddleware(),
  zValidator("json", updateGoalSchema),
  async (ctx) => {
    const auth = getAuth(ctx);
    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized" }, 401);
    }
    const id = ctx.req.param("id");
    const values = ctx.req.valid("json");
    const [goal] = await db
      .update(goals)
      .set({
        ...values,
        startDate: values.startDate ? new Date(values.startDate) : undefined,
        goalDate: values.goalDate ? new Date(values.goalDate) : undefined,
        accountIds: values.accountIds ? JSON.stringify(values.accountIds) : undefined,
      })
      .where(eq(goals.id, id))
      .returning();
    if (!goal) return ctx.json({ error: "Goal not found" }, 404);
    return ctx.json({ data: goal });
  }
);

// Delete a goal.
app.delete("/:id", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  if (!auth?.userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }
  const id = ctx.req.param("id");
  const [goal] = await db.delete(goals).where(eq(goals.id, id)).returning();
  if (!goal) return ctx.json({ error: "Goal not found" }, 404);
  return ctx.json({ data: goal });
});

export default app;
