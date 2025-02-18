// create-checkout-session.ts
import { Hono } from 'hono';
import { clerkMiddleware } from '@hono/clerk-auth';
import Stripe from 'stripe';
import { db } from '@/db/drizzle';
import { stripeCustomers, lifetimePurchases } from '@/db/schema';
import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';

const stripe = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
  ? new Stripe(process.env.STRIPE_SECRET_TEST_KEY!)
  : new Stripe(process.env.STRIPE_SECRET_KEY!);

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const { userId, customerEmail, priceId } = await ctx.req.json();

  try {
    let customerId: string | undefined;

    // First, try to fetch an existing customer record for this user.
    const existingCustomers = await db
      .select({ stripeCustomerId: stripeCustomers.stripeCustomerId })
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, userId))
      .limit(1);
    
    if (existingCustomers.length > 0) {
      customerId = existingCustomers[0].stripeCustomerId;
    } else {
      // If no customer exists, create a new customer in Stripe.
      const customer = await stripe.customers.create({
        email: customerEmail,
        metadata: { userId },
      });
      customerId = customer.id;

      // Insert the new customer into the database.
      // Ensure that the `userId` column is unique in your schema.
      try {
        await db.insert(stripeCustomers).values({
          id: createId(),
          userId,
          stripeCustomerId: customerId,
        }).onConflictDoNothing();
      } catch (insertError) {
        console.error('Error on insert (conflict may have occurred):', insertError);
      }
      // Re-select the customer record (this ensures that if a concurrent insert happened,
      // you get the correct record).
      const reselected = await db
        .select({ stripeCustomerId: stripeCustomers.stripeCustomerId })
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, userId))
        .limit(1);
      if (reselected.length > 0) {
        customerId = reselected[0].stripeCustomerId;
      }
    }

    if (!customerId) {
      throw new Error("Could not determine a Stripe customer ID.");
    }

    // Determine if this is a lifetime plan or a recurring subscription.
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

    // Create the Stripe checkout session.
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: stripeMode,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/overview`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/overview`,
      customer: customerId,
      metadata: { userId },
    });

    // For lifetime subscriptions, update (or insert) the lifetimePurchases record.
    if (isLifetime && session.status !== 'expired') {
      const existingLifetime = await db
        .select()
        .from(lifetimePurchases)
        .where(eq(lifetimePurchases.userId, userId))
        .limit(1);
      if (existingLifetime.length > 0) {
        await db.update(lifetimePurchases)
          .set({ isLifetime: true })
          .where(eq(lifetimePurchases.userId, userId));
      } else {
        await db.insert(lifetimePurchases).values({
          id: createId(),
          userId,
          isLifetime: true,
        });
      }
    }

    return ctx.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
