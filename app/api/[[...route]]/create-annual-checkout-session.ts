import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import Stripe from 'stripe';
import { db } from '@/db/drizzle';
import { stripeCustomers } from '@/db/schema';
import { createId } from '@paralleldrive/cuid2';
import { config } from 'dotenv';

config({ path: '.env.local' });

const stripe = new Stripe(process.env.STRIPE_SECRET_TEST_KEY!);

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);

  if (!auth?.userId) {
    return ctx.json({ error: 'Unauthorized.' }, 401);
  }

  const { customerEmail } = await ctx.req.json();

  try {
    // Create a Stripe customer
    const customer = await stripe.customers.create({
      email: customerEmail,
    });

    // Store the Stripe customer ID in the database
    await db.insert(stripeCustomers).values({
      id: createId(),
      userId: auth.userId,
      stripeCustomerId: customer.id,
    });

    // Create a checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID!,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/`,
      customer: customer.id,
      metadata: {
        userId: auth.userId,
      },
    });

    return ctx.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
