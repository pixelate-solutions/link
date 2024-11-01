import { Hono } from 'hono';
import { db } from '@/db/drizzle';
import { recurringTransactions, categories, transactions } from "@/db/schema";
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { subMonths, format, startOfDay, endOfDay, parse, subDays } from 'date-fns';
import { and, eq, gte, lte, sql } from "drizzle-orm";

const app = new Hono();

const deleteChatInfo = async (name: string) => {
  try {
    const aiResponse = await fetch(`${process.env.NEXT_PUBLIC_AI_URL}/resources/delete/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`Failed to delete chat info from AI backend: ${errorText}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error deleting chat info from AI backend', error);
    return false;
  }
};

const upsertChatInfo = async (userId: string, prompt: string) => {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_AI_URL}/resource/upsert_text?user_id=${userId}&name=Chat Info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: prompt,
    });

    if (!response.ok) {
      throw new Error('Failed to upsert chat info');
    }
    return true;
  } catch (error) {
    console.error('Error upserting chat info:', error);
    return false;
  }
};

app.post('/upsert', clerkMiddleware(), async (c) => {
  try {
    const auth = getAuth(c);
    const userId = auth?.userId;
    const todaysDate = new Date();

    if (!userId) {
      return c.json({ error: 'User not authenticated' }, 401);
    }

    // Define types
    type RecurringTransaction = {
      name: string;
      frequency: string;
      average_amount: string;
      last_amount: string | null;
      isActive: string;
      last_date: string;
    };

    type CategoryData = {
      name: string;
      totalSpent: string;
      monthlyBudget: string;
    };

    type CategoryTotal = {
      categoryId: string;
      totalCost: string;
    };

    // Function to fetch category totals
    const fetchCategoryTotals = async (from: string, to: string): Promise<CategoryTotal[]> => {
      const startDate = from ? startOfDay(parse(from, "yyyy-MM-dd", new Date())) : startOfDay(subDays(new Date(), 30));
      const endDate = to ? endOfDay(parse(to, "yyyy-MM-dd", new Date())) : endOfDay(new Date());

      try {
        const results = await db
          .select({
            categoryId: categories.id,
            categoryName: categories.name,
            totalIncome: sql`SUM(CASE WHEN CAST(amount AS FLOAT) > 0 THEN CAST(amount AS FLOAT) ELSE 0 END)`.as('totalIncome'),
            totalCost: sql`SUM(CASE WHEN CAST(amount AS FLOAT) < 0 THEN CAST(amount AS FLOAT) ELSE 0 END)`.as('totalCost'),
          })
          .from(categories)
          .leftJoin(transactions, and(
            eq(transactions.categoryId, categories.id),
            eq(transactions.userId, userId)  // Filter by current user
          ))
          .where(
            and(
              gte(transactions.date, startDate),
              lte(transactions.date, endDate)
            )
          )
          .groupBy(categories.id, categories.name);

        return results.map(result => ({
          categoryId: result.categoryId,
          totalCost: (result.totalCost || 0).toString(),
        }));
      } catch (error) {
        console.error('Error fetching category totals:', error);
        throw new Error("Failed to calculate totals.");
      }
    };

    // Fetch category totals
    const fromDate = format(subMonths(todaysDate, 1), 'yyyy-MM-dd');
    const toDate = format(todaysDate, 'yyyy-MM-dd');
    const categoryTotals = await fetchCategoryTotals(fromDate, toDate);

    // Fetch recurring transactions from the database for the current user
    const recurringTransactionsList = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.userId, userId))  // Filter by current user
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

    // Fetch category data from the database for the current user
    const categoryInfo = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))  // Filter by current user
      .execute();

    const structuredCategoryData = categoryInfo.reduce((acc: Record<string, CategoryData>, category: any) => {
      const totalSpent = parseFloat(categoryTotals.find(total => total.categoryId === category.id)?.totalCost || '0');
      acc[category.id] = {
        name: category.name,
        totalSpent: totalSpent.toFixed(2),
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

    const isDeleted = await deleteChatInfo("Chat Info");
    if (!isDeleted) {
      console.error('Failed to delete existing chat info');
    }
    
    const isUpserted = await upsertChatInfo(userId || "", prompt);
    if (!isUpserted) {
      console.error('Failed to upsert new chat info' );
    }

    return c.json({ message: 'Chat info upserted successfully' });
  } catch (error) {
    console.error('Error in /upsert handler:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
