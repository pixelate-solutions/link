import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { db } from '@/db/drizzle';
import { stripeCustomers, referrals } from '@/db/schema';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { createId } from '@paralleldrive/cuid2';

const app = new Hono();
const stripe = new Stripe(process.env.STRIPE_SECRET_TEST_KEY!);

const FF_PROMO_CODE = process.env.NEXT_PUBLIC_FF_PROMO_CODE;

const createCheckoutSession = async (
  userId: string,
  customerEmail: string,
  promoCode?: string
) => {
  const referralCouponId = process.env.STRIPE_REFERRAL_COUPON_ID;

  try {
    let customerRecord = await db
      .select({ stripeCustomerId: stripeCustomers.stripeCustomerId })
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, userId))
      .limit(1);

    let customerId = customerRecord[0]?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: customerEmail, metadata: { userId } });
      customerId = customer.id;
      await db.insert(stripeCustomers).values({
        id: createId(),
        userId,
        stripeCustomerId: customerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: process.env.NEXT_PUBLIC_STRIPE_MONTHLY_TEST_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/overview`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
      customer: customerId,
      discounts: referralCouponId ? [{ coupon: referralCouponId }] : undefined,
      metadata: { userId },
    });

    return { sessionId: session.id };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return { error: 'Internal Server Error' };
  }
};

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  if (!userId) return ctx.json({ error: 'Unauthorized.' }, 401);

  try {
    const { promoCode, customerEmail } = await ctx.req.json();
    const customerEmailAddress = customerEmail.emailAddress;

    if (promoCode === FF_PROMO_CODE) {
      await db.update(stripeCustomers).set({ lifetimePurchase: true }).where(eq(stripeCustomers.userId, userId));
      return ctx.json({ message: 'Friends and Family promo applied successfully, lifetime purchase granted!' });
    }

    const referringUserId = `user_${promoCode}`;
    if (userId === referringUserId) {
      return ctx.json({ error: 'Unable to apply promo code to self.' }, 400)
    }
    const [referringCustomer] = await db
      .select({ stripeCustomerId: stripeCustomers.stripeCustomerId })
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, referringUserId))
      .limit(1);

    if (!referringCustomer) return ctx.json({ error: 'Invalid promo code or referrer not found.' }, 400);

    const [pastReferral] = await db
      .select({ effectiveDate: referrals.effectiveDate })
      .from(referrals)
      .where(eq(referrals.userId, referringUserId))
      .limit(1);
    
    if (pastReferral) {
      const referralDate = new Date(pastReferral.effectiveDate);
      const currentDate = new Date();
      
      // Calculate the difference in months
      const diffInTime = currentDate.getTime() - referralDate.getTime();
      const diffInDays = diffInTime / (1000 * 3600 * 24); // Convert milliseconds to days
      
      if (diffInDays < 30) {
        return ctx.json({ error: 'You can only apply one referral per month.' }, 400);
      }
    }

    const sessionData = await createCheckoutSession(userId, customerEmailAddress, promoCode);
    if (sessionData.error) return ctx.json({ error: sessionData.error }, 500);

    return ctx.json({ sessionId: sessionData.sessionId });
  } catch (error) {
    console.error('Error handling promo code and checkout session:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
