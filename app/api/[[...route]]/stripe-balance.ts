import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { db } from '@/db/drizzle';
import { stripeCustomers, referrals } from '@/db/schema'; // assuming referrals schema is correct
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { createId } from '@paralleldrive/cuid2';

const app = new Hono();
const stripe = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
  ? new Stripe(process.env.STRIPE_SECRET_TEST_KEY!)
  : new Stripe(process.env.STRIPE_SECRET_KEY!);

app.get('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: 'Unauthorized.' }, 401);
  }

  try {
    // Fetch the stripeCustomerId from the stripeCustomers table based on userId
    const stripeCustomer = await db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, userId))
      .limit(1)
      .execute();

    if (stripeCustomer.length === 0) {
      return ctx.json({ error: 'Stripe customer not found for this user' }, 404);
    }

    const customerId = stripeCustomer[0].stripeCustomerId;

    // Retrieve the customer data from Stripe using the customer ID
    const customer = await stripe.customers.retrieve(customerId);

    // Check if the customer is not deleted and has a balance property
    if ('balance' in customer) {
      // Return the balance in dollars (dividing by 100 to convert from cents)
      return ctx.json({ balance: customer.balance / 100 });
    } else {
      return ctx.json({ error: 'No balance found for this customer' }, 404);
    }
  } catch (error) {
    console.error('Error fetching Stripe balance:', error);
    return ctx.json({ error: 'Error fetching balance' }, 500);
  }
});

app.post('/credit-referral', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const { referringUserId } = await ctx.req.json(); // Corrected here

  // Ensure the referringUserId is provided
  if (!referringUserId) {
    return ctx.json({ error: 'Referred user ID is required' }, 400);
  }

  try {
    // Fetch the stripeCustomerId of the referred user
    const stripeCustomer = await db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, referringUserId))
      .limit(1)
      .execute();

    if (stripeCustomer.length === 0) {
      return ctx.json({ error: 'Stripe customer not found for the referred user' }, 404);
    }

    const customerId = stripeCustomer[0].stripeCustomerId;

    // Retrieve the customer data from Stripe
    const customer = await stripe.customers.retrieve(customerId);

    if ('balance' in customer) {
      // Credit the user with $5 (500 cents)
      const amountToCredit = 500; // $5 in cents
      await stripe.customers.update(customerId, {
        balance: customer.balance + amountToCredit,
      });

      // Check if the referred user already has a referral record
      const [existingReferral] = await db
        .select()
        .from(referrals)
        .where(eq(referrals.userId, referringUserId))
        .limit(1)
        .execute();

      if (existingReferral) {
        // Update the effective date if the referral exists
        await db
          .update(referrals)
          .set({ effectiveDate: new Date().toString(), applied: true })
          .where(eq(referrals.id, existingReferral.id))
          .execute();
      } else {
        // Create a new referral record if it doesn't exist
        await db.insert(referrals).values({
          id: createId(),
          userId: referringUserId,
          effectiveDate: new Date().toString(),
          amount: 500,
          applied: true,
        });
      }

      return ctx.json({ success: `Successfully credited $5 to ${referringUserId}` });
    } else {
      return ctx.json({ error: 'No balance found for this customer' }, 404);
    }
  } catch (error) {
    console.error('Error crediting referral:', error);
    return ctx.json({ error: 'Error crediting referral' }, 500);
  }
});

export default app;
