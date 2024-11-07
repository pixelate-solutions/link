import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import Stripe from 'stripe';
import { db } from '@/db/drizzle';
import { stripeCustomers, accounts, transactions } from '@/db/schema';
import { config } from 'dotenv';
import { eq, and } from 'drizzle-orm';

config({ path: '.env.local' });

const stripe = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
  ? new Stripe(process.env.STRIPE_SECRET_TEST_KEY!)
  : new Stripe(process.env.STRIPE_SECRET_KEY!);

const AI_URL = process.env.NEXT_PUBLIC_AI_URL;
const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);

  if (!auth?.userId) {
    return ctx.json({ error: 'Unauthorized.' }, 401);
  }

  try {
    // Fetch the Stripe customer ID from the database
    const [customerRecord] = await db
      .select({
        stripeCustomerId: stripeCustomers.stripeCustomerId,
      })
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, auth.userId))
      .limit(1);

    if (!customerRecord) {
      return ctx.json({ error: 'Stripe customer not found.' }, 404);
    }

    const customerId = customerRecord.stripeCustomerId;

    // Fetch active subscriptions for the customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    const subscription = subscriptions.data[0];

    if (!subscription) {
      return ctx.json({ error: 'No active subscription found.' }, 404);
    }

    // Cancel the subscription immediately and apply proration
    await stripe.subscriptions.cancel(subscription.id, {
      prorate: true,
    });

    // Fetch all accounts for the user where isFromPlaid is True
    const accountsToDelete = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, auth.userId), eq(accounts.isFromPlaid, true)));

    // Make requests to delete resources from AI backend before deleting accounts
    for (const account of accountsToDelete) {
      const name = `Transactions from ${account.id} for ${auth.userId}`;
      try {
        const aiResponse = await fetch(`${AI_URL}/resources/delete/${encodeURIComponent(name)}`, {
          method: 'DELETE',
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`Failed to delete from AI backend: ${errorText}`);
        }
      } catch (error) {
        console.error(`Error deleting from AI backend for account ${account.id}:`, error);
      }
    }

    // Delete all accounts for the user where isFromPlaid is True
    await db.delete(accounts)
      .where(and(eq(accounts.userId, auth.userId), eq(accounts.isFromPlaid, true)));

    // Delete all transactions for the user where isFromPlaid is True
    await db.delete(transactions)
      .where(and(eq(transactions.userId, auth.userId), eq(transactions.isFromPlaid, true)));

    // Respond with a redirect URL
    return ctx.json({ message: 'Subscription canceled successfully.', redirectUrl: '/overview' });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
