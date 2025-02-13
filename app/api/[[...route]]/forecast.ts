import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { addDays, parseISO, format, endOfDay } from "date-fns";
import { db } from "@/db/drizzle";
import { transactions } from "@/db/schema";
import { and, asc, eq, gte } from "drizzle-orm";

/**
 * A recursive moving average forecast.
 *
 * @param historical - Array of historical weekly net values.
 * @param horizon - Number of future weeks to forecast.
 * @param windowSize - Number of weeks to average over.
 * @returns An array of forecast net values.
 */
function recursiveMovingAverageForecast(
  historical: number[],
  horizon: number,
  windowSize: number
): number[] {
  const series = [...historical];
  const forecasts: number[] = [];
  for (let i = 0; i < horizon; i++) {
    const window = series.slice(-windowSize);
    const forecast = window.reduce((sum, val) => sum + val, 0) / window.length;
    forecasts.push(forecast);
    series.push(forecast);
  }
  return forecasts;
}

const app = new Hono()
  .get("/", clerkMiddleware(), async (ctx) => {
    const auth = getAuth(ctx);
    const userId = auth?.userId;
    if (!userId) {
      return ctx.json({ error: "Unauthorized" }, 401);
    }

    // Get the forecast horizon (number of weeks to forecast).
    const weeksParam = ctx.req.query("weeks");
    const forecastWeeks = weeksParam ? parseInt(weeksParam) : 3;
    if (isNaN(forecastWeeks) || forecastWeeks <= 0) {
      return ctx.json({ error: "Invalid weeks parameter." }, 400);
    }

    // Get the monthlyBudget parameter.
    const monthlyBudgetParam = ctx.req.query("monthlyBudget");
    if (!monthlyBudgetParam) {
      return ctx.json({ error: "Missing monthlyBudget parameter." }, 400);
    }
    const monthlyBudget = parseFloat(monthlyBudgetParam);
    if (isNaN(monthlyBudget) || monthlyBudget <= 0) {
      return ctx.json({ error: "Invalid monthlyBudget parameter." }, 400);
    }

    // (Optional) Compute weekly budgets if needed.
    const baseWeeklyBudget = (monthlyBudget / 30.44) * 7;

    const now = new Date();
    const defaultStartDate = addDays(now, -7 * 52);

    // Get the earliest transaction date for this user.
    const firstTransactionResult = await db
      .select({ date: transactions.date })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(asc(transactions.date))
      .limit(1);

    let startDate = defaultStartDate;
    if (firstTransactionResult.length > 0) {
      const firstTransactionDate = firstTransactionResult[0].date;
      if (firstTransactionDate > defaultStartDate) {
        startDate = firstTransactionDate;
      }
    }

    // Query transactions for this user over the defined period.
    const rawData = await db
      .select({
        date: transactions.date,
        amount: transactions.amount, // Assume positive for income, negative for expense.
      })
      .from(transactions)
      .where(
        and(
          gte(transactions.date, startDate),
          eq(transactions.userId, userId)
        )
      )
      .orderBy(asc(transactions.date));

    // Convert raw data to daily records using 'net' (the sum of amounts).
    let historicalData: { date: string; net: number }[] = [];
    if (rawData.length === 0) {
      // Simulate 10 weeks with a starting net of 25.
      for (let i = 0; i < 10; i++) {
        const simulatedDate = format(addDays(startDate, i * 7), "yyyy-MM-dd");
        historicalData.push({ date: simulatedDate, net: 25 });
      }
    } else {
      historicalData = rawData.map((item) => ({
        date: format(item.date, "yyyy-MM-dd"),
        net: parseFloat(item.amount),
      }));
    }

    // Aggregate daily data into weekly intervals (summing net values).
    const sortedData = [...historicalData].sort(
      (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()
    );
    const weeklyAggregates: Array<{ weekStart: Date; weekEnd: Date; net: number }> = [];
    let cursor = parseISO(sortedData[0].date);
    let idx = 0;
    while (idx < sortedData.length) {
      const weekStart = cursor;
      const weekEnd = endOfDay(addDays(weekStart, 6));
      let sumNet = 0;
      while (
        idx < sortedData.length &&
        parseISO(sortedData[idx].date).getTime() <= weekEnd.getTime()
      ) {
        sumNet += sortedData[idx].net;
        idx++;
      }
      weeklyAggregates.push({ weekStart, weekEnd, net: sumNet });
      cursor = addDays(weekEnd, 1);
    }

    // Limit to a maximum of 52 weeks (if more, keep the most recent 52).
    if (weeklyAggregates.length > 52) {
      weeklyAggregates.splice(0, weeklyAggregates.length - 52);
    }

    // Extract historical weekly net values.
    const historicalWeeklyNets = weeklyAggregates.map((week) => week.net);

    // Set forecast horizon as the number of historical weeks (capped at 52).
    const horizon = Math.min(weeklyAggregates.length, 52);
    const windowSize = Math.min(3, historicalWeeklyNets.length);
    const forecastNets = recursiveMovingAverageForecast(historicalWeeklyNets, horizon, windowSize);

    const lastWeekEnd = weeklyAggregates[weeklyAggregates.length - 1].weekEnd;
    const forecast = [];
    for (let i = 0; i < forecastNets.length; i++) {
      const forecastDate = format(addDays(lastWeekEnd, (i + 1) * 7), "yyyy-MM-dd");
      forecast.push({
        date: forecastDate,
        forecastNet: forecastNets[i],
      });
    }

    return ctx.json(forecast);
  });

export default app;
