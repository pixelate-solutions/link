import Stripe from 'stripe';
import { config } from "dotenv";

config({ path: ".env.local" });

const stripe = new Stripe(process.env.STRIPE_SECRET_TEST_KEY);

export const getSubscriptionStatus = async (customerId) => {
  try {
    // Fetch all subscriptions for the customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
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

      return {
        status,
        plan,
      };
    } else {
      return {
        status: 'Free',
        plan: 'Free',
      };
    }
  } catch (error) {
    console.error('Error retrieving subscription status:', error);
    throw error;
  }
};
