import { Hono } from 'hono';
import { clerkMiddleware } from '@hono/clerk-auth';
import Stripe from 'stripe';
import { db } from '@/db/drizzle';
import { stripeCustomers } from '@/db/schema';
import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_TEST_KEY!);

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const { userId, customerEmail, priceId } = await ctx.req.json();

  try {
    let customerRecord;
    let customerId;

    // Check if the customer exists in the database
    [customerRecord] = await db
      .select({
        stripeCustomerId: stripeCustomers.stripeCustomerId,
      })
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, userId))
      .limit(1);

    if (!customerRecord) {
      // If customer doesn't exist, create a new one in Stripe
      const customer = await stripe.customers.create({
        email: customerEmail,
        metadata: { userId },
      });

      customerId = customer.id;

      // Save new customer to the database
      await db.insert(stripeCustomers).values({
        id: createId(),
        userId,
        stripeCustomerId: customerId,
      });
    } else {
      customerId = customerRecord.stripeCustomerId;
    }

    // Determine if this is a lifetime plan or subscription
    let stripeMode: 'payment' | 'subscription';
    let isLifetime = false;
    const lifetimePriceId = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
    ? process.env.NEXT_PUBLIC_STRIPE_LIFETIME_TEST_PRICE_ID
    : process.env.NEXT_PUBLIC_STRIPE_LIFETIME_PRICE_ID;

    if (priceId === lifetimePriceId) {
      stripeMode = 'payment';
      isLifetime = true;
    } else {
      stripeMode = 'subscription';
    }

    // Create a checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: stripeMode,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/overview`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
      customer: customerId,
      metadata: {
        userId: userId,
      },
    });

    // Mark the lifetime purchase in the database after session creation
    if (isLifetime && session.status !== 'expired') {
      await db.update(stripeCustomers)
        .set({ lifetimePurchase: true })
        .where(eq(stripeCustomers.userId, userId));
    }

    return ctx.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
