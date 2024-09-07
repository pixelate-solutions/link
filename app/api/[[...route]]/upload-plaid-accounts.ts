import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { eq } from "drizzle-orm";
import { accounts } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { userTokens } from "@/db/schema";

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch the user's access token from the database
  const result = await db
    .select({ accessToken: userTokens.accessToken })
    .from(userTokens)
    .where(eq(userTokens.userId, userId));

  // Ensure that the result exists and has a valid accessToken
  const accessToken = result[0]?.accessToken;

  if (!accessToken) {
    return ctx.json({ error: "Access token not found" }, 404);
  }

  // Use Plaid to fetch accounts
  const plaidResponse = await plaidClient.accountsGet({ access_token: accessToken });
  const plaidAccounts = plaidResponse.data.accounts;

  // Insert each account into the accounts table
  const insertedAccounts = await Promise.all(
    plaidAccounts.map(async (account) => {
      return db.insert(accounts).values({
        id: createId(),
        userId: userId,
        name: account.name,
        isFromPlaid: true,
      }).returning();
    })
  );

  return ctx.json({ accounts: insertedAccounts });
});

export default app;
