import { Hono } from 'hono';
import { db } from '@/db/drizzle';
import { recurringTransactions, categories, transactions } from "@/db/schema"; // Add transactions to import
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { subMonths, endOfToday, format, startOfDay, endOfDay, parse, subDays } from 'date-fns';
import { and, eq, gte, lte, sql } from "drizzle-orm";

const app = new Hono();

app.post('/upsert', clerkMiddleware(), async (c) => {
    // Define the RecurringTransaction type
    const auth = getAuth(c);
    const userId = auth?.userId;

    const todaysDate = new Date();
    const fromDate = format(subMonths(todaysDate, 1), 'yyyy-MM-dd'); // Last month
    const toDate = format(todaysDate, 'yyyy-MM-dd'); // Today

    type RecurringTransaction = {
        name: string;
        frequency: string;
        average_amount: string;
        last_amount: string | null;
        isActive: string;
        last_date: string;
    };

    // Define the CategoryData type
    type CategoryData = {
        name: string;
        totalSpent: string; // Updated to total spent
        monthlyBudget: string;
    };

    // Define the type for the category totals response
    type CategoryTotal = {
        categoryId: string; // Use the appropriate type based on your schema
        totalCost: string; // Use string if stored as a string in the database
    };

    // Function to fetch category totals
    const fetchCategoryTotals = async (from: string, to: string): Promise<CategoryTotal[]> => {
        const startDate = from ? startOfDay(parse(from, "yyyy-MM-dd", new Date())) : startOfDay(subDays(new Date(), 30));
        const endDate = to ? endOfDay(parse(to, "yyyy-MM-dd", new Date())) : endOfDay(new Date());

        try {
            // Fetch the results from the database
            const results = await db
                .select({
                    categoryId: categories.id,
                    categoryName: categories.name,
                    totalIncome: sql`SUM(CASE WHEN CAST(amount AS FLOAT) > 0 THEN CAST(amount AS FLOAT) ELSE 0 END)`.as('totalIncome'),
                    totalCost: sql`SUM(CASE WHEN CAST(amount AS FLOAT) < 0 THEN CAST(amount AS FLOAT) ELSE 0 END)`.as('totalCost'),
                })
                .from(categories)
                .leftJoin(transactions, eq(transactions.categoryId, categories.id))
                .where(
                    and(
                        gte(transactions.date, startDate),
                        lte(transactions.date, endDate)
                    )
                )
                .groupBy(categories.id, categories.name);

            // Map results to CategoryTotal type
            const categoryTotals: CategoryTotal[] = results.map(result => ({
                categoryId: result.categoryId,
                totalCost: (result.totalCost || 0).toString(), // Ensure it's a string
            }));
            return categoryTotals;
        } catch (error) {
            console.error('Error fetching category totals:', error);
            throw new Error("Failed to calculate totals.");
        }
    };

  try {
    const today = endOfToday();
    const lastMonthStart = subMonths(today, 1);
    const fromDate = format(lastMonthStart, 'yyyy-MM-dd');
    const toDate = format(today, 'yyyy-MM-dd');

    // Fetch category totals using the endpoint
    let categoryTotals: CategoryTotal[] = [];
    categoryTotals = await fetchCategoryTotals(fromDate, toDate);

    // Fetch recurring transactions from the database
    const recurringTransactionsList = await db
      .select()
      .from(recurringTransactions)
      .execute();

    const structuredRecurringData = recurringTransactionsList.reduce((acc: Record<string, RecurringTransaction>, transaction: any) => {
      acc[transaction.streamId] = {
        name: transaction.name,
        frequency: transaction.frequency,
        average_amount: transaction.averageAmount,
        last_amount: transaction.lastAmount,
        isActive: transaction.isActive,
        last_date: transaction.date,
      };
      return acc;
    }, {});

    // Fetch category data from the database
    const categoryInfo = await db
      .select()
      .from(categories)
      .execute();

    const structuredCategoryData = categoryInfo.reduce((acc: Record<string, CategoryData>, category: any) => {
      const totalSpent = parseFloat(categoryTotals.find(total => total.categoryId === category.id)?.totalCost || '0');
      acc[category.id] = {
        name: category.name,
        totalSpent: totalSpent.toFixed(2), // Use fetched total
        monthlyBudget: category.budgetAmount || '0',
      };
      return acc;
    }, {});

    // Construct the prompt string
    let prompt = `Here is the breakdown of each category as of ${todaysDate}: `;
    Object.values(structuredCategoryData).forEach((category) => {
      const cat = category as CategoryData;
      prompt += `For the category ${cat.name}, I have spent a total of $${cat.totalSpent} in the last month, with a monthly budget of $${cat.monthlyBudget}. `;
    });

    prompt += `Here is the information on each recurring transaction as of ${todaysDate}: `;
    Object.values(structuredRecurringData).forEach((transaction) => {
      const trans = transaction as RecurringTransaction;
      prompt += `The recurring transaction ${trans.name} occurs ${trans.frequency}, with an average amount of $${trans.average_amount}. `;
      if (trans.last_amount) {
        prompt += `The last transaction amount was $${trans.last_amount}. `;
      }
      prompt += `This transaction is currently ${trans.isActive ? "active" : "inactive"}. `;
      prompt += `The last date for this transaction was ${trans.last_date}. `;
    });

    // Upsert the prompt
    const response = await fetch(`${process.env.NEXT_PUBLIC_AI_URL}/resource/upsert_text?user_id=${userId}&name=Chat info as of ${todaysDate}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: prompt,
    });

    if (!response.ok) {
      throw new Error('Failed to upsert chat info');
    }

    return c.json({ message: 'Chat info upserted successfully' });
  } catch (error) {
    console.error('Error fetching data or upserting chat info:', error);
    return c.json({ error: 'Internal Server Error' });
  }
});

export default app;
