import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import Stripe from 'stripe';
import { db } from '@/db/drizzle';
import { stripeCustomers } from '@/db/schema';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

config({ path: '.env.local' });

const stripe = new Stripe(process.env.STRIPE_SECRET_TEST_KEY!);

const app = new Hono()
  .post(
    '/',
    clerkMiddleware(),
    async (ctx) => {
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

        // Schedule the subscription to cancel at the end of the current period
        const canceledSubscription = await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: true,
        });

        return ctx.json({ message: 'Subscription cancellation scheduled successfully.', canceledSubscription });
      } catch (error) {
        console.error('Error canceling subscription:', error);
        return ctx.json({ error: 'Internal Server Error' }, 500);
      }
    }
  );

export default app;
