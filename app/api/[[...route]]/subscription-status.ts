import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { stripe } from './stripe'; // Adjust the import path if needed
import { db } from '@/db/drizzle'; // Import your database instance
import { stripeCustomers } from '@/db/schema'; // Import your schema
import { eq } from "drizzle-orm";


const app = new Hono()
  .get(
    '/',
    clerkMiddleware(),
    async (ctx) => {
      const auth = getAuth(ctx);

      if (!auth?.userId) {
        return ctx.json({ error: 'Unauthorized.' }, 401);
      }

      try {
        // Fetch the Stripe customer ID from the database using the userId
        const [customerRecord] = await db
          .select({
            stripeCustomerId: stripeCustomers.stripeCustomerId,
          })
          .from(stripeCustomers)
          .where(eq(stripeCustomers.userId, auth.userId));

        if (!customerRecord) {
          return ctx.json({ status: 'Free', plan: 'Free' });
        }

        const stripeCustomerId = customerRecord.stripeCustomerId;

        // Fetch subscriptions for the customer using their Stripe customer ID
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
        });

        if (subscriptions.data.length > 0) {
          const subscription = subscriptions.data[0];
          const status = subscription.status;
          const items = subscription.items.data;

          // Determine the subscription plan
          let plan = 'Free';
          if (items.length > 0) {
            const priceId = items[0].price.id;
            switch (priceId) {
              case process.env.STRIPE_MONTHLY_PRICE_ID:
                plan = 'Monthly';
                break;
              case process.env.STRIPE_ANNUAL_PRICE_ID:
                plan = 'Annual';
                break;
              case process.env.STRIPE_LIFETIME_PRICE_ID:
                plan = 'Lifetime';
                break;
              default:
                plan = 'Test';
            }
          }

          return ctx.json({ status, plan });
        } else {
          return ctx.json({ status: 'Free', plan: 'Free' });
        }
      } catch (error) {
        console.error('Error retrieving subscription status:', error);
        return ctx.json({ error: 'Internal Server Error' }, 500);
      }
    }
  );

export default app;
