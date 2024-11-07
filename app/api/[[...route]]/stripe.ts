import Stripe from 'stripe';

export const stripe = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
  ? new Stripe(process.env.STRIPE_SECRET_TEST_KEY!)
  : new Stripe(process.env.STRIPE_SECRET_KEY!);
