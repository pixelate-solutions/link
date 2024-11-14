import { Hono } from 'hono';
import { clerkMiddleware } from '@hono/clerk-auth';
import plaidClient from './plaid';
import { CountryCode, Products } from 'plaid';

const app = new Hono();

app.post("/", clerkMiddleware(), async (ctx) => {
  const { userId } = await ctx.req.json();

  const request = {
    user: {
      client_user_id: userId,
    },
    client_name: 'LinkLogic',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    webhook: `https://webhook.site/ffe42768-f126-4118-9fca-11b2cc94a949`,
  };

  try {
    const createTokenResponse = await plaidClient.linkTokenCreate(request);
    return ctx.json({ link_token: createTokenResponse.data.link_token });
  } catch (error) {
    console.error("Failed to create link token:", error);
    return ctx.json({
      success: false,
      error: "Plaid connection failed",
    });
  }
});

export default app;
