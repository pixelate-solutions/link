import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { subDays, startOfDay, endOfDay, parse } from "date-fns";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/drizzle";
import { transactions } from "@/db/schema";

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
        // Calculate total income
        const totalIncomeResult = await db
          .select({ totalIncome: sql`SUM(CAST(amount AS FLOAT))` })
          .from(transactions)
          .where(
            and(
              eq(transactions.accountId, accountId || ""),
              gte(transactions.amount, '0'),
              gte(transactions.date, startDate),
              lte(transactions.date, endDate)
            )
          );

        // Calculate total cost
        const totalCostResult = await db
          .select({ totalCost: sql`SUM(CAST(amount AS FLOAT))` })
          .from(transactions)
          .where(
            and(
              eq(transactions.accountId, accountId || ""),
              lte(transactions.amount, '0'),
              gte(transactions.date, startDate),
              lte(transactions.date, endDate)
            )
          );

        const totalIncome = (totalIncomeResult[0]?.totalIncome || 0);
        const totalCost = (totalCostResult[0]?.totalCost || 0);

        return ctx.json({ totalIncome, totalCost });
      } catch (error) {
        console.error(error);
        return ctx.json({ error: "Failed to calculate totals." }, 500);
      }
    }
  );

export default app;
