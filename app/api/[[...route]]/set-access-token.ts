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
    const { access_token, item_id } = response.data;

    // Check if a record already exists for this userId and itemId
    const existingToken = await db
      .select()
      .from(userTokens)
      .where(and((eq(userTokens.userId, userId)), (eq(userTokens.accessToken, access_token))))
      .limit(1);

    if (existingToken.length > 0) {
      return ctx.json({
        success: true,
        message: 'Access token already exists for this user and item.',
      });
    }

    // Store the access_token and item_id securely in your database
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
