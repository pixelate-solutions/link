import { Hono } from 'hono';
import plaidClient from './plaid';
import { userTokens } from '@/db/schema';
import { db } from '@/db/drizzle';
import { eq, and } from 'drizzle-orm';
import { clerkMiddleware } from '@hono/clerk-auth';
import { createId } from '@paralleldrive/cuid2';

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  try {
    const { public_token, userId } = await ctx.req.json();

    // Exchange the public_token for an access_token and item_id
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const access_token = response.data.access_token;
    const item_id = response.data.item_id;

    await plaidClient.itemWebhookUpdate({
      access_token: access_token,
      webhook: `https://link-jomo125s-projects.vercel.app/api/plaid/update-transactions/`,
    });

    // Check if this item_id already exists for the user
    const existingToken = await db
      .select()
      .from(userTokens)
      .where(and(eq(userTokens.userId, userId), eq(userTokens.itemId, item_id)))
      .limit(1);

    if (existingToken.length > 0) {
      return ctx.json({
        success: false,
        message: 'This account has already been linked.'
      });
    }

    // Insert the new access token
    await db.insert(userTokens).values({
      id: createId(),
      userId,
      accessToken: access_token,
      itemId: item_id,
      createdAt: new Date(),
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
