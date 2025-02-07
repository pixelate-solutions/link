import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { subDays, parse } from "date-fns";
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
        ? new Date(
            Date.UTC(
              parse(from, "yyyy-MM-dd", new Date()).getFullYear(),
              parse(from, "yyyy-MM-dd", new Date()).getMonth(),
              parse(from, "yyyy-MM-dd", new Date()).getDate(),
              0,
              0,
              0,
              0 // Start of the day in UTC
            )
          )
        : new Date(
            Date.UTC(
              defaultFrom.getFullYear(),
              defaultFrom.getMonth(),
              defaultFrom.getDate(),
              0,
              0,
              0,
              0 // Start of the day in UTC
            )
          );

      const endDate = to
        ? new Date(
            Date.UTC(
              parse(to, "yyyy-MM-dd", new Date()).getFullYear(),
              parse(to, "yyyy-MM-dd", new Date()).getMonth(),
              parse(to, "yyyy-MM-dd", new Date()).getDate(),
              23,
              59,
              59,
              999 // End of the day in UTC
            )
          )
        : new Date(
            Date.UTC(
              defaultTo.getFullYear(),
              defaultTo.getMonth(),
              defaultTo.getDate(),
              23,
              59,
              59,
              999 // End of the day in UTC
            )
          );

      try {
        const results = await db
          .select({
            categoryId: categories.id,
            categoryName: categories.name,
            totalIncome: sql`SUM(CASE WHEN CAST(transactions.amount AS FLOAT) > 0 THEN CAST(transactions.amount AS FLOAT) ELSE 0 END)`,
            totalCost: sql`SUM(CASE WHEN CAST(transactions.amount AS FLOAT) < 0 THEN CAST(transactions.amount AS FLOAT) ELSE 0 END)`,
          })
          .from(categories)
          .leftJoin(transactions, eq(transactions.categoryId, categories.id))
          .where(
            and(
              gte(sql`DATE(${transactions.date})`, sql`DATE(${startDate.toISOString()})`),
              lte(sql`DATE(${transactions.date})`, sql`DATE(${endDate.toISOString()})`),
              // Exclude categories where the type is "transfer"
              sql`COALESCE(LOWER(${categories.type}), '') <> 'transfer'`
            )
          )
          .groupBy(categories.id, categories.name);

        return ctx.json(results);
      } catch (error) {
        console.error("Error:", error);
        return ctx.json({ error: "Failed to calculate totals." }, 500);
      }
    }
  );

export default app;
