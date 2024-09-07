import { Hono } from 'hono';
import plaidClient from './plaid';
import { userTokens } from '@/db/schema';
import { db } from '@/db/drizzle';
import { clerkMiddleware } from '@hono/clerk-auth';
import { createId } from '@paralleldrive/cuid2';

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  try {
    const { public_token, userId } = await ctx.req.json();

    // Exchange the public_token for an access_token and item_id
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    // Store the access_token and item_id securely in your database
    await db.insert(userTokens).values({
      id: createId(),
      userId,
      accessToken: access_token,
      itemId: item_id,
      createdAt: new Date(),
    });

    // Respond with success
    console.log("set success")
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
