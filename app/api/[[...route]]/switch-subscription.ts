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

    const subscriptionId = subscriptions.data[0].id;

    // Retrieve the new price to check its type
    const newPrice = await stripe.prices.retrieve(newPriceId);

    if (newPrice.type === 'one_time') {
      // If the new price is a one-time payment, cancel the existing subscription
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      // Optionally, create a checkout session for the one-time payment
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: newPriceId,
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
      });

      return ctx.json({ success: true, sessionId: session.id });
    } else {
      // Otherwise, update the subscription with the new recurring price
      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: subscriptions.data[0].items.data[0].id,
          price: newPriceId,
        }],
      });

      return ctx.json({ success: true, subscription: updatedSubscription });
    }
  } catch (error) {
    console.error('Error in switch-subscription:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
