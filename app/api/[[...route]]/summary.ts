import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { differenceInDays, parse, subDays, isSameDay, addDays } from "date-fns";
import { and, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "@/db/drizzle";
import { accounts, categories, transactions } from "@/db/schema";
import { calculatePercentageChange, fillMissingDays } from "@/lib/utils";

const app = new Hono().get(
  "/",
  clerkMiddleware(),
  zValidator(
    "query",
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      accountId: z.string().optional(),
    })
  ),
  async (ctx) => {
    const auth = getAuth(ctx);
    const { from, to, accountId } = ctx.req.valid("query");
      if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized." }, 401);
    }

    const defaultTo = subDays(new Date(), 1);
    defaultTo.setUTCHours(23, 59, 59, 999);
    const defaultFrom = subDays(defaultTo, 30);
    defaultFrom.setUTCHours(0, 0, 0, 0);

    const startDate = from
      ? parse(from, "yyyy-MM-dd", new Date())
      : defaultFrom;
    const endDate = to ? parse(to, "yyyy-MM-dd", new Date()) : defaultTo;


    const normalizedStartDate = new Date(startDate);
    normalizedStartDate.setUTCHours(0, 0, 0, 0); // Start of the day in UTC

    const normalizedEndDate = new Date(endDate);
    normalizedEndDate.setUTCHours(23, 59, 59, 999); // End of the day in UTC


    const periodLength = differenceInDays(endDate, startDate) + 1;
    const lastPeriodStart = subDays(startDate, periodLength);
    const lastPeriodEnd = subDays(endDate, periodLength);

    // Fetch financial data (income, expenses, remaining)
    async function fetchFinancialData(
      userId: string,
      startDate: Date,
      endDate: Date
    ) {
      return await db
        .select({
          income: sql`
            SUM(CAST(CASE WHEN ${transactions.amount} >= '0' THEN ${transactions.amount} ELSE '0' END AS numeric))
          `.mapWith(Number),
          expenses: sql`
            SUM(CAST(CASE WHEN ${transactions.amount} < '0' THEN ${transactions.amount} ELSE '0' END AS numeric))
          `.mapWith(Number),
          remaining: sum(
            sql`CAST(${transactions.amount} AS numeric)`
          ).mapWith(Number),
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(
          and(
            accountId ? eq(transactions.accountId, accountId) : undefined,
            eq(accounts.userId, userId),
            gte(sql`DATE(${transactions.date})`, sql`DATE(${normalizedStartDate.toISOString()})`),
            lte(sql`DATE(${transactions.date})`, sql`DATE(${normalizedEndDate.toISOString()})`)
          )
        );
    }

    const [currentPeriod] = await fetchFinancialData(
      auth.userId,
      startDate,
      endDate
    );
    const [lastPeriod] = await fetchFinancialData(
      auth.userId,
      lastPeriodStart,
      lastPeriodEnd
    );

    const incomeChange = calculatePercentageChange(
      currentPeriod.income,
      lastPeriod.income
    );

    const expensesChange = calculatePercentageChange(
      currentPeriod.expenses,
      lastPeriod.expenses
    );

    const remainingChange = calculatePercentageChange(
      currentPeriod.remaining,
      lastPeriod.remaining
    );

    // Fetch categories with their budget amounts
    const categoriesWithBudget = await db
      .select({
        name: categories.name,
        budgetAmount: categories.budgetAmount, // Assuming budgetAmount exists in the schema
      })
      .from(categories)
      .where(eq(categories.userId, auth.userId));

    // Calculate total monthly budget
    const totalMonthlyBudget = categoriesWithBudget.reduce(
      (sum, category) => sum + parseFloat(category.budgetAmount || "0"),
      0
    );

    // Prorate the budget over the selected date range
    const budgetPerDay = totalMonthlyBudget / 30.44; // Average days in a month
    const daysInRange = differenceInDays(endDate, startDate) + 1;

    const dailyBudgets = Array.from({ length: daysInRange }).map((_, index) => {
     
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      
      return {
        date: date.toISOString().split("T")[0],
        budget: budgetPerDay * (index + 1),
      };
    });


    // Fetch category spending and group by categories
    const category = await db
      .select({
        name: categories.name,
        value: sql`
          SUM(CAST(ABS(CAST(${transactions.amount} AS numeric)) AS numeric))
        `.mapWith(Number),
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          accountId ? eq(transactions.accountId, accountId) : undefined,
          eq(accounts.userId, auth.userId),
          gte(sql`DATE(${transactions.date})`, sql`DATE(${normalizedStartDate.toISOString()})`),
          lte(sql`DATE(${transactions.date})`, sql`DATE(${normalizedEndDate.toISOString()})`),
          sql`CAST(${transactions.amount} AS numeric) < 0`
        )
      )
      .groupBy(categories.name)
      .orderBy(desc(sql`SUM(CAST(ABS(CAST(${transactions.amount} AS numeric)) AS numeric))`));

    const topCategories = category.slice(0, 3);
    const otherCategories = category.slice(3);
    const otherSum = otherCategories.reduce(
      (sum, current) => sum + current.value,
      0
    );

    const finalCategories = topCategories;

    if (otherCategories.length > 0)
      finalCategories.push({ name: "Other", value: otherSum });

    // Fetch daily income and expenses, fill missing days
    const activeDays = await db
      .select({
        date: transactions.date,
        income: sql`
          SUM(CAST(CASE WHEN ${transactions.amount} >= '0' THEN ${transactions.amount} ELSE '0' END AS numeric))
        `.mapWith(Number),
        expenses: sql`
          SUM(CAST(CASE WHEN ${transactions.amount} < '0' THEN ABS(CAST(${transactions.amount} AS numeric)) ELSE '0' END AS numeric))
        `.mapWith(Number),
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(
        and(
          accountId ? eq(transactions.accountId, accountId) : undefined,
          eq(accounts.userId, auth.userId),
          gte(sql`DATE(${transactions.date})`, sql`DATE(${normalizedStartDate.toISOString()})`),
          lte(sql`DATE(${transactions.date})`, sql`DATE(${normalizedEndDate.toISOString()})`)
        )
      )
      .groupBy(transactions.date)
      .orderBy(transactions.date);

    const days = fillMissingDays(activeDays, startDate, endDate);

    // Merge the budget data with the daily expenses data
    const daysWithBudget = days.map((day) => {
      const budgetData = dailyBudgets.find((d) => isSameDay(d.date, day.date));
      return {
        ...day,
        budget: budgetData ? budgetData.budget : 0,
      };
    });

    const { liabilities, assets, availableAssets } = await db
      .select({
        liabilities: sql`
          SUM(CAST(CASE WHEN ${accounts.currentBalance} < '0' THEN ${accounts.currentBalance} ELSE '0' END AS numeric))
        `.mapWith(Number),
        assets: sql`
          SUM(CAST(CASE WHEN ${accounts.currentBalance} >= '0' THEN ${accounts.currentBalance} ELSE '0' END AS numeric))
        `.mapWith(Number),
        availableAssets: sql`
          SUM(CAST(CASE WHEN ${accounts.currentBalance} >= '0' THEN ${accounts.availableBalance} ELSE '0' END AS numeric))
        `.mapWith(Number),
      })
      .from(accounts)
      .where(eq(accounts.userId, auth.userId))
      .then(([result]) => ({
        liabilities: (result.liabilities || 0).toString(),
        assets: (result.assets || 0).toString(),
        availableAssets: (result.availableAssets || 0).toString(),
      }));


    return ctx.json({
      data: {
        monthlyBudget: totalMonthlyBudget,
        liabilities: liabilities,
        assets: assets,
        availableAssets: availableAssets,
        remainingAmount: currentPeriod.remaining,
        remainingChange,
        incomeAmount: currentPeriod.income,
        incomeChange,
        expensesAmount: currentPeriod.expenses,
        expensesChange,
        categories: finalCategories,
        days: daysWithBudget,
      },
    });
  }
);

export default app;
