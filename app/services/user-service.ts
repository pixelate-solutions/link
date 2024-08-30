import { db } from '@/db/drizzle';
import { stripeCustomers } from '@/db/schema';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';

export const getSubscriptionStatus = async (userId: string): Promise<string> => {
  const stripe = new Stripe(process.env.NEXT_PUBLIC_STRIPE_SECRET_TEST_KEY!);

  try {
    const results = await db.select({
      stripeCustomerId: stripeCustomers.stripeCustomerId,
    })
    .from(stripeCustomers)
    .where(eq(stripeCustomers.userId, userId))
    .limit(1);

    const customer = results[0];

    if (!customer) {
      return "No Stripe customer found";
    }

    const stripeCustomerId = customer.stripeCustomerId;

    if (stripeCustomerId) {
      // Retrieve subscriptions from Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all', // to get all subscriptions, regardless of status
      });

      if (subscriptions.data.length > 0) {
        // Assuming you want to return the ID of the first subscription found
        const subscription = subscriptions.data[0];
        return subscription.items.data.map((item: Stripe.SubscriptionItem) => item.price.id).join(', ');
      } else {
        return "No subscription found";
      }
    }

    return "Free";
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    throw error;
  }
};
