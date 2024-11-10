import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { stripe } from './stripe'; // Adjust the import path if needed
import { db } from '@/db/drizzle';
import { stripeCustomers, lifetimePurchases } from '@/db/schema';
import { eq } from "drizzle-orm";


const app = new Hono();

app.get('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);

  if (!auth?.userId) {
    return ctx.json({ error: 'Unauthorized.' }, 401);
  }

  try {
    // Fetch the Stripe customer ID and lifetime purchase status from the database
    const [stripeRecord] = await db
      .select({
        stripeCustomerId: stripeCustomers.stripeCustomerId,
      })
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, auth.userId));

    // Fetch the isLifetime value from the lifetimePurchases table
    const [lifetimeRecord] = await db
      .select({
        lifetimePurchase: lifetimePurchases.isLifetime,
      })
      .from(lifetimePurchases)
      .where(eq(lifetimePurchases.userId, auth.userId));

    // Combine the results into a single object
    const customerRecord = {
      stripeCustomerId: stripeRecord?.stripeCustomerId || null,
      lifetimePurchase: lifetimeRecord?.lifetimePurchase || false, // default to false if no record exists
    };

    if (customerRecord.lifetimePurchase) {
      return ctx.json({ status: 'Paid', plan: 'Lifetime' });
    }

    if (!customerRecord.stripeCustomerId) {
      return ctx.json({ status: 'Free', plan: 'Free' });
    }

    const stripeCustomerId = customerRecord.stripeCustomerId;
    const lifetimePurchase = customerRecord.lifetimePurchase;

    // Check if the customer has active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId || "",
    });

    if (subscriptions.data.length > 0) {
      const subscription = subscriptions.data[0];
      const status = subscription.status;
      const items = subscription.items.data;
      const cancelAtPeriodEnd = subscription.cancel_at_period_end;
      const cancelAt = subscription.cancel_at;
      const canceledAt = subscription.canceled_at;

      // Determine the subscription plan
      let plan = 'Free';
      if (items.length > 0) {
        const priceId = items[0].price.id;
        const monthlyPriceId = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
        ? process.env.NEXT_PUBLIC_STRIPE_MONTHLY_TEST_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID;
        
        const annualPriceId = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
        ? process.env.NEXT_PUBLIC_STRIPE_ANNUAL_TEST_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID;
        
        switch (priceId) {
          case monthlyPriceId:
            plan = 'Monthly';
            break;
          case annualPriceId:
            plan = 'Annual';
            break;
          default:
            plan = 'Free';
        }
      }

      return ctx.json({ status, plan, cancelAtPeriodEnd, cancelAt, canceledAt });
    } else if (lifetimePurchase) {
      // If no active subscriptions but lifetime purchase exists
      return ctx.json({ status: 'Paid', plan: 'Lifetime' });
    } else {
      return ctx.json({ status: 'Free', plan: 'Free' });
    }
  } catch (error) {
    console.error('Error retrieving subscription status:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
