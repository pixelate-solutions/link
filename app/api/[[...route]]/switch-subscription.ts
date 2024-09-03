import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { stripe } from './stripe'; // Adjust the import path if needed
import { db } from '@/db/drizzle';
import { stripeCustomers } from '@/db/schema';
import { eq } from "drizzle-orm";

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);

  if (!auth?.userId) {
    return ctx.json({ error: 'Unauthorized.' }, 401);
  }

  const { newPriceId } = await ctx.req.json();

  try {
    // Fetch the Stripe customer ID from the database
    const [customerRecord] = await db
      .select({
        stripeCustomerId: stripeCustomers.stripeCustomerId,
      })
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, auth.userId));

    if (!customerRecord) {
      return ctx.json({ error: 'Customer not found.' }, 404);
    }

    const stripeCustomerId = customerRecord.stripeCustomerId;

    // Fetch the current subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active',
    });

    if (subscriptions.data.length > 0) {
      const subscription = subscriptions.data[0];

      // Cancel the current subscription at the end of the current period
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      });

      // Log cancelation success
      console.log(`Subscription ${subscription.id} scheduled for cancelation.`);

      // Create a new subscription starting immediately
      const newSubscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: newPriceId }],
        expand: ['latest_invoice.payment_intent'],
      });

      // Log new subscription creation
      console.log(`New subscription ${newSubscription.id} created successfully.`);

      return ctx.json({
        message: 'Subscription switched successfully.',
        newSubscriptionId: newSubscription.id,
      });
    } else {
      return ctx.json({ error: 'No active subscription found.' }, 404);
    }
  } catch (error) {
    console.error('Error switching subscription:', error.message);
    return ctx.json({ error: 'Internal Server Error', details: error.message }, 500);
  }
});

export default app;
