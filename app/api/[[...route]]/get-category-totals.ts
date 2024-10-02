import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { subDays, startOfDay, endOfDay, parse } from "date-fns";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/drizzle";
import { categories, transactions } from "@/db/schema";

const app = new Hono()
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
      })
    ),
    clerkMiddleware(),
    async (ctx) => {
      const auth = getAuth(ctx);
      const { from, to } = ctx.req.valid("query");

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
        const results = await db
          .select({
            categoryId: categories.id,
            categoryName: categories.name,
            totalIncome: sql`SUM(CASE WHEN CAST(amount AS FLOAT) > 0 THEN CAST(amount AS FLOAT) ELSE 0 END)`,
            totalCost: sql`SUM(CASE WHEN CAST(amount AS FLOAT) < 0 THEN CAST(amount AS FLOAT) ELSE 0 END)`,
          })
          .from(categories)
          .leftJoin(transactions, eq(transactions.categoryId, categories.id))  // Ensure proper join condition
          .where(
            and(
              gte(transactions.date, startDate),
              lte(transactions.date, endDate)
            )
          )
          .groupBy(categories.id, categories.name);

        return ctx.json(results);
      } catch (error) {
        console.error('Error:', error);
        return ctx.json({ error: "Failed to calculate totals." }, 500);
      }
    }
  );

export default app;
