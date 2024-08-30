// create-checkout-session.js
import Stripe from 'stripe';
import { config } from 'dotenv';
import { storeStripeCustomerId } from '@/app/services/stripe-service';

config({ path: ".env.local" });

const stripe = new Stripe(process.env.STRIPE_SECRET_TEST_KEY);

export const createCheckoutSession = async ({ userId, customerEmail }) => {
  try {
    // Create a Stripe customer if not already created
    const customer = await stripe.customers.create({
      email: customerEmail,
    });

    // Store the Stripe customer ID in the database
    await storeStripeCustomerId(userId, customer.id);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_TEST_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
      customer: customer.id,
      metadata: {
        userId: userId,
      },
    });

    return session.id;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};
