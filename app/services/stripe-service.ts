import { createId } from '@paralleldrive/cuid2';
import { db } from '../../db/drizzle';
import { stripeCustomers } from '../../db/schema';

export const storeStripeCustomerId = async (userId: string, stripeCustomerId: string) => {
  try {
    // Log the incoming values for debugging
    console.log(`Storing Stripe customer ID: ${stripeCustomerId} for userId: ${userId}`);

    const result = await db.insert(stripeCustomers).values({
      id: createId(),
      userId: userId,
      stripeCustomerId: stripeCustomerId,
    });

    // Log the result to verify if the insert was successful
    console.log('Insert result:', result);

  } catch (error) {
    console.error('Error storing Stripe customer ID:', error);
    throw error;
  }
};
