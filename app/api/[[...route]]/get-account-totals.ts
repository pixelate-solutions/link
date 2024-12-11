import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { subDays, startOfDay, endOfDay, parse } from "date-fns";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/drizzle";
import { accounts, transactions } from "@/db/schema";

const app = new Hono()
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        accountId: z.string().optional(),
      })
    ),
    clerkMiddleware(),
    async (ctx) => {
      const auth = getAuth(ctx);
      const { from, to, accountId } = ctx.req.valid("query");

      if (!auth?.userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      const defaultTo = new Date();
      const defaultFrom = subDays(defaultTo, 30);

      const startDate = from
        ? startOfDay(parse(from, "yyyy-MM-dd", new Date()))
        : startOfDay(defaultFrom);

      const endDate = to ? endOfDay(parse(to, "yyyy-MM-dd", new Date())) : endOfDay(defaultTo);

      try {
        // Fetch account category for the logged-in user
        const account = await db
          .select({ category: accounts.category })
          .from(accounts)
          .where(and(eq(accounts.id, accountId || ""), eq(accounts.userId, auth.userId)));

        if (!account.length) {
          return ctx.json({ error: "Account not found or unauthorized." }, 404);
        }

        const accountCategory = account[0]?.category;

        // Calculate total income for the logged-in user
        const totalIncomeResult = await db
          .select({ totalIncome: sql`SUM(CAST(amount AS FLOAT))` })
          .from(transactions)
          .where(
            and(
              eq(transactions.accountId, accountId || ""),
              eq(transactions.userId, auth.userId), // Ensure the transaction belongs to the logged-in user
              gte(transactions.amount, '0'),
              gte(transactions.date, startDate),
              lte(transactions.date, endDate)
            )
          );

        // Calculate total cost for the logged-in user
        const totalCostResult = await db
          .select({ totalCost: sql`SUM(CAST(amount AS FLOAT))` })
          .from(transactions)
          .where(
            and(
              eq(transactions.accountId, accountId || ""),
              eq(transactions.userId, auth.userId), // Ensure the transaction belongs to the logged-in user
              lte(transactions.amount, '0'),
              gte(transactions.date, startDate),
              lte(transactions.date, endDate)
            )
          );

        const totalIncome = (totalIncomeResult[0]?.totalIncome || 0);
        const totalCost = (totalCostResult[0]?.totalCost || 0);

        return ctx.json({
          totalIncome,
          totalCost,
          category: accountCategory || "Others",
        });
      } catch (error) {
        console.error(error);
        return ctx.json({ error: "Failed to calculate totals." }, 500);
      }
    }
  );

export default app;
