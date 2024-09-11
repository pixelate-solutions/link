import { Hono } from 'hono';
import { clerkMiddleware } from '@hono/clerk-auth';
import { db } from '@/db/drizzle'; // Adjust path as necessary
import { categories, transactions, accounts, stripeCustomers, userTokens } from '@/db/schema'; // Adjust paths
import { eq, and } from 'drizzle-orm';

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const { userId } = await ctx.req.json();

  try {
    // Delete from categories where isFromPlaid is TRUE and userId matches
    await db.delete(categories)
      .where(and(eq(categories.userId, userId), eq(categories.isFromPlaid, true)));

    // Delete from transactions where isFromPlaid is TRUE and userId matches
    await db.delete(transactions)
      .where(and(eq(transactions.id, userId), eq(transactions.isFromPlaid, true)));

    // Delete from accounts where isFromPlaid is TRUE and userId matches
    await db.delete(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isFromPlaid, true)));

    // Delete from stripe_customers where userId matches
    await db.delete(stripeCustomers)
      .where(eq(stripeCustomers.userId, userId));

    // Delete from user_tokens where userId matches
    await db.delete(userTokens)
      .where(eq(userTokens.userId, userId));

    return ctx.json({ message: 'Plaid-related data and customer info deleted successfully.' }, 200);
  } catch (error) {
    console.error('Error deleting Plaid-related data:', error);
    return ctx.json({ error: 'Failed to delete Plaid-related data.' }, 500);
  }
});

export default app;
