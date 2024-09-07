import { Hono } from 'hono';
import plaidClient from './plaid';  // Initialize the Plaid client
import { userTokens } from '@/db/schema'; // Database schema
import { db } from '@/db/drizzle';        // Database connection

const app = new Hono();

app.post('/', async (ctx) => {
  try {
    const { public_token, userId } = await ctx.req.json();

    // Exchange the public_token for an access_token and item_id
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    // Store the access_token and item_id securely in your database
    await db.insert(userTokens).values({
      userId,
      accessToken: access_token,
      itemId: item_id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Respond with success
    return ctx.json({
      success: true,
      message: 'Access token stored successfully.',
    });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    return ctx.json({
      success: false,
      error: 'Failed to exchange public token.',
    });
  }
});

export default app;
