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

    // Cancel the current subscription immediately and apply proration
    await stripe.subscriptions.update(currentSubscription.id, {
      cancel_at_period_end: false,
      proration_behavior: 'create_prorations',
    });

    // Wait a moment to ensure the cancellation and proration are fully processed
    // before creating a new subscription. 
    await new Promise((resolve) => setTimeout(resolve, 500)); // 0.5 second delay

    // Create the new subscription with the specified price ID
    const newSubscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: newPriceId }],
      proration_behavior: 'create_prorations', // Apply proration if applicable
      expand: ['latest_invoice.payment_intent'],
    });

    let sessionId;
    // Check if latest_invoice is an object and has payment_intent
    if (newSubscription.latest_invoice && typeof newSubscription.latest_invoice === 'object') {
      const invoice = newSubscription.latest_invoice;
      if (invoice.payment_intent && typeof invoice.payment_intent === 'object') {
        sessionId = invoice.payment_intent.id; // Extract PaymentIntent ID
      } else if (typeof invoice.payment_intent === 'string') {
        sessionId = invoice.payment_intent; // PaymentIntent ID as a string
      } else {
        return ctx.json({ error: 'Payment intent not found' }, 500);
      }
    } else {
      return ctx.json({ error: 'Latest invoice not found or invalid' }, 500);
    }

    return ctx.json({ sessionId });
  } catch (error) {
    console.error('Error switching subscription:', error);
    return ctx.json({ error: 'Failed to switch subscription' }, 500);
  }
});

export default app;
