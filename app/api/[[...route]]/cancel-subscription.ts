import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import Stripe from 'stripe';
import { db } from '@/db/drizzle';
import { stripeCustomers, accounts, transactions, recurringTransactions, userTokens } from '@/db/schema';
import { config } from 'dotenv';
import { eq, and } from 'drizzle-orm';
import plaidClient from "./plaid";

config({ path: '.env.local' });

const stripe = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
  ? new Stripe(process.env.STRIPE_SECRET_TEST_KEY!)
  : new Stripe(process.env.STRIPE_SECRET_KEY!);

const AI_URL = process.env.NEXT_PUBLIC_AI_URL;
const app = new Hono();

// Endpoint to cancel the Stripe subscription (set to cancel at period end)
app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  if (!auth?.userId) {
    return ctx.json({ error: 'Unauthorized.' }, 401);
  }
  try {
    // Fetch the Stripe customer ID from the database
    const [customerRecord] = await db
      .select({ stripeCustomerId: stripeCustomers.stripeCustomerId })
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
    // Update the subscription to cancel at period end so the user retains access until then.
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });
    return ctx.json({
      message: 'Subscription cancellation scheduled. Your paid features will remain active until the end of your current period.',
      redirectUrl: '/overview',
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

// Endpoint to clean up premium (Plaid) data after the pay period ends
app.post('/cleanup', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  if (!auth?.userId) {
    return ctx.json({ error: 'Unauthorized.' }, 401);
  }
  try {
    // Fetch all accounts for the user where isFromPlaid is true
    const accountsToDelete = await db
      .select({ id: accounts.id, accessToken: accounts.plaidAccessToken })
      .from(accounts)
      .where(and(eq(accounts.userId, auth.userId), eq(accounts.isFromPlaid, true)));
    
    // For each account, remove recurring transactions, Plaid item, and related user tokens
    for (const account of accountsToDelete) {
      const { id, accessToken } = account;
      await db.delete(recurringTransactions)
        .where(and(eq(recurringTransactions.userId, auth.userId), eq(recurringTransactions.accountId, id)));
      try {
        await plaidClient.itemRemove({ access_token: accessToken || "" });
        await db.delete(userTokens)
          .where(and(eq(userTokens.userId, auth.userId), eq(userTokens.accessToken, accessToken || "")));
      } catch (error) {
        console.error(`Failed to delete Plaid item for access token ${accessToken}:`, error);
      }
    }
    // Delete all accounts and transactions for the user where isFromPlaid is true
    await db.delete(accounts)
      .where(and(eq(accounts.userId, auth.userId), eq(accounts.isFromPlaid, true)));
    await db.delete(transactions)
      .where(and(eq(transactions.userId, auth.userId), eq(transactions.isFromPlaid, true)));
    
    return ctx.json({
      message: 'Premium features and associated data have been cleaned up successfully.'
    });
  } catch (error) {
    console.error('Error cleaning up premium features:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
