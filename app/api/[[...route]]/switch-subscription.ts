import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { stripe } from './stripe';
import { db } from '@/db/drizzle';
import { stripeCustomers } from '@/db/schema';
import { eq } from "drizzle-orm";

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  try {
    const auth = getAuth(ctx);
    const userId = auth?.userId;
    const { newPriceId } = await ctx.req.json();

    if (!userId || !newPriceId) {
      return ctx.json({ error: 'Missing user ID or new price ID' }, 400);
    }

    const customerRecord = await db.select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, userId))
      .limit(1);
    
    if (customerRecord.length === 0) {
      return ctx.json({ error: 'Customer not found' }, 404);
    }

    const customerId = customerRecord[0].stripeCustomerId;

    // Retrieve the customer's active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return ctx.json({ error: 'Active subscription not found' }, 404);
    }

    const currentSubscription = subscriptions.data[0];

    // Cancel the current subscription immediately
    await stripe.subscriptions.cancel(currentSubscription.id, {
      prorate: true,
    });

    // Create the new subscription with the specified price ID
    const newSubscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: newPriceId }],
      proration_behavior: 'create_prorations', // Apply proration if applicable
      expand: ['latest_invoice.payment_intent'],
    });

    let sessionId;
    // Return the session ID for redirecting to the checkout
    if (typeof newSubscription.latest_invoice === 'object' && newSubscription.latest_invoice?.payment_intent) {
      sessionId = newSubscription.latest_invoice.payment_intent;
      // Continue with your logic here
    } else {
      return ctx.json({ error: 'Failed to switch subscription' }, 500);
    }


    return ctx.json({ sessionId });
  } catch (error) {
    console.error('Error switching subscription:', error);
    return ctx.json({ error: 'Failed to switch subscription' }, 500);
  }
});

export default app;
