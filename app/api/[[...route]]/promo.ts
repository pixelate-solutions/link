import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { db } from '@/db/drizzle';
import { stripeCustomers } from '@/db/schema';
import { eq } from 'drizzle-orm';

const app = new Hono();

const VALID_PROMO_CODE = process.env.NEXT_PUBLIC_FF_PROMO_CODE

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);

  if (!auth?.userId) {
    return ctx.json({ error: 'Unauthorized.' }, 401);
  }

  try {
    const { promoCode } = await ctx.req.json();

    if (promoCode !== VALID_PROMO_CODE) {
      return ctx.json({ error: 'Invalid promo code.' }, 400);
    }

    // Fetch the Stripe customer by userId
    const [customerRecord] = await db
      .select({
        stripeCustomerId: stripeCustomers.stripeCustomerId,
        lifetimePurchase: stripeCustomers.lifetimePurchase,
      })
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, auth.userId))
      .limit(1);

    if (!customerRecord) {
      return ctx.json({ error: 'Stripe customer not found.' }, 404);
    }

    // Update the lifetime_purchase value for the customer
    await db
      .update(stripeCustomers)
      .set({ lifetimePurchase: true })
      .where(eq(stripeCustomers.userId, auth.userId));

    return ctx.json({ message: 'Promo code applied successfully, lifetime purchase granted!' });
  } catch (error) {
    console.error('Error applying promo code:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
