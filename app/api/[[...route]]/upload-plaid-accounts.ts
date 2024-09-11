import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { eq, and } from "drizzle-orm";
import { accounts, userTokens } from "@/db/schema";
import plaidClient from "./plaid";
import { createId } from "@paralleldrive/cuid2";

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch all access tokens associated with the user
  const accessTokens = await db
    .select({ accessToken: userTokens.accessToken })
    .from(userTokens)
    .where(eq(userTokens.userId, userId));

  if (accessTokens.length === 0) {
    return ctx.json({ error: "No access tokens found" }, 404);
  }

  for (const token of accessTokens) {
    const accessToken = token.accessToken;

    // Use Plaid to fetch accounts for each access token
    const plaidResponse = await plaidClient.accountsGet({ access_token: accessToken });
    const plaidAccounts = plaidResponse.data.accounts;

    for (const account of plaidAccounts) {
      // Check if the account already exists in the database
      const existingAccount = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.plaidAccountId, account.account_id), eq(accounts.userId, userId)));

      if (existingAccount.length === 0) {
        // Insert the new account if it doesn't exist
        await db.insert(accounts).values({
          id: createId(),
          userId: userId,
          plaidAccountId: account.account_id, // Use plaidAccountId
          name: account.name,
          isFromPlaid: true,
        }).returning();
      }
    }
  }

  return ctx.json({ message: "Accounts uploaded successfully" });
});

export default app;
