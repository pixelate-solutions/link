import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { eq } from "drizzle-orm";
import { accounts } from "@/db/schema";
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

  const insertedAccounts = await Promise.all(
    plaidAccounts.map(async (account) => {
        try {
        return await db.insert(accounts).values({
            id: account.account_id,
            userId: userId,
            name: account.name,
            isFromPlaid: true,
        }).returning();
        } catch (error: unknown) {
        if (error instanceof Error) {
            // Parse the error message to extract the code, if needed
            const errorMessage = error.message;
            
            // Example: Checking for a specific PostgreSQL error code in the message
            if (errorMessage.includes('23505')) {
            // Handle duplicate record case
            return { error: `Account ${account.account_id} already exists` };
            }

            // Log other errors
            console.error('Database error:', errorMessage);
        } else {
            // Handle unknown errors
            console.error('Unknown error occurred:', error);
        }
        
        // Re-throw the error if it's not handled
        throw error;
        }
    })
    );


  return ctx.json({ accounts: insertedAccounts });
});

export default app;
