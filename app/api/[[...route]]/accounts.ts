import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "@/db/drizzle";
import { accounts, insertAccountSchema, recurringTransactions, userTokens } from "@/db/schema";
import plaidClient from "./plaid";

const AI_URL = process.env.NEXT_PUBLIC_AI_URL;

const app = new Hono()
  .get("/", clerkMiddleware(), async (ctx) => {
    const auth = getAuth(ctx);

    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized." }, 401);
    }

    // Fetch query parameter for isFromPlaid (optional)
    const isFromPlaidParam = ctx.req.query("isFromPlaid");

    // Validate isFromPlaid parameter (should be "true" or "false")
    const isFromPlaid = isFromPlaidParam === "true" ? true : isFromPlaidParam === "false" ? false : null;

    if (isFromPlaid === null) {
      return ctx.json({ error: "Invalid query parameter." }, 400);
    }

    const data = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        isFromPlaid: accounts.isFromPlaid,  // Select this for debugging
      })
      .from(accounts)
      .where(
        and(eq(accounts.userId, auth.userId), eq(accounts.isFromPlaid, isFromPlaid)) // Filter by isFromPlaid
      );

    return ctx.json({ data });
  })
  .get(
    "/:id",
    zValidator(
      "param",
      z.object({
        id: z.string().optional(),
      })
    ),
    clerkMiddleware(),
    async (ctx) => {
      const auth = getAuth(ctx);
      const { id } = ctx.req.valid("param");

      if (!id) {
        return ctx.json({ error: "Missing id." }, 400);
      }

      if (!auth?.userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      const [data] = await db
        .select({
          id: accounts.id,
          name: accounts.name,
        })
        .from(accounts)
        .where(and(eq(accounts.userId, auth.userId), eq(accounts.id, id)));

      if (!data) {
        return ctx.json({ error: "Not found." }, 404);
      }

      return ctx.json({ data });
    }
  )
  .post(
    "/",
    clerkMiddleware(),
    zValidator(
      "json",
      insertAccountSchema.pick({
        name: true,
        isFromPlaid: true,  // Ensure that isFromPlaid is included
      })
    ),
    async (ctx) => {
      const auth = getAuth(ctx);
      const values = ctx.req.valid("json");

      if (!auth?.userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      const [data] = await db
        .insert(accounts)
        .values({
          id: createId(),
          userId: auth.userId,
          ...values,
        })
        .returning();

      return ctx.json({ data });
    }
  )
  .post(
    "/bulk-delete",
    clerkMiddleware(),
    zValidator(
      "json",
      z.object({
        ids: z.array(z.string()),
      })
    ),
    async (ctx) => {
      const auth = getAuth(ctx);
      const values = ctx.req.valid("json");

      if (!auth?.userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      // Fetch the accounts to be deleted
      const accountsToDelete = await db
        .select({ id: accounts.id, accessToken: accounts.plaidAccessToken, isFromPlaid: accounts.isFromPlaid })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, auth.userId),
            inArray(accounts.id, values.ids)
          )
        );

      // Delete recurring transactions associated with the accounts
      await db
        .delete(recurringTransactions)
        .where(inArray(recurringTransactions.accountId, values.ids));

      // Map to keep track of access tokens for Plaid accounts being deleted
      const plaidAccessTokens = new Map<string, string>();

      // Identify Plaid accounts and their access tokens
      for (const account of accountsToDelete) {
        if (account.isFromPlaid && account.accessToken) {
          plaidAccessTokens.set(account.accessToken, account.id);
        }
      }

      // Delete the accounts from the database
      const data = await db
        .delete(accounts)
        .where(
          and(
            eq(accounts.userId, auth.userId),
            inArray(accounts.id, values.ids)
          )
        )
        .returning({
          id: accounts.id,
        });

      // Check remaining accounts for each access token
      for (const [accessToken, accountId] of plaidAccessTokens.entries()) {
        const remainingAccounts = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(
            eq(accounts.userId, auth.userId),
            eq(accounts.plaidAccessToken, accessToken),
            eq(accounts.isFromPlaid, true)
          ));

        if (remainingAccounts.length === 0) {
          // If no other accounts with this access token, delete Plaid item and remove row from user_tokens
          try {
            await plaidClient.itemRemove({ access_token: accessToken });

            // Delete the access token from the user_tokens table
            await db
              .delete(userTokens)
              .where(and(eq(userTokens.userId, auth.userId), eq(userTokens.accessToken, accessToken)));
          } catch (error) {
            console.error(`Failed to delete Plaid item for access token ${accessToken}:`, error);
          }
        }
      }

      // Make requests to delete resources from AI backend
      for (const account of accountsToDelete) {
        const name = `Transactions from ${account.id} for ${auth.userId}`;
        try {
          const aiResponse = await fetch(`${AI_URL}/resources/delete/${encodeURIComponent(name)}`, {
            method: 'DELETE',
          });

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error(`Failed to delete from AI backend: ${errorText}`);
          }
        } catch (error) {
          console.error(`Error deleting from AI backend for account ${account.id}:`, error);
        }
      }

      return ctx.json({ data });
    }
  )
  .patch(
    "/:id",
    clerkMiddleware(),
    zValidator(
      "param",
      z.object({
        id: z.string().optional(),
      })
    ),
    zValidator(
      "json",
      insertAccountSchema.pick({
        name: true,
        isFromPlaid: true,  // Ensure isFromPlaid can be updated if needed
      })
    ),
    async (ctx) => {
      const auth = getAuth(ctx);
      const { id } = ctx.req.valid("param");
      const values = ctx.req.valid("json");

      if (!id) {
        return ctx.json({ error: "Missing id." }, 400);
      }

      if (!auth?.userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      const [data] = await db
        .update(accounts)
        .set(values)
        .where(and(eq(accounts.userId, auth.userId), eq(accounts.id, id)))
        .returning();

      if (!data) {
        return ctx.json({ error: "Not found." }, 404);
      }

      return ctx.json({ data });
    }
  )
  .delete(
    "/:id",
    clerkMiddleware(),
    zValidator(
      "param",
      z.object({
        id: z.string().optional(),
      })
    ),
    async (ctx) => {
      const auth = getAuth(ctx);
      const { id } = ctx.req.valid("param");

      if (!id) {
        return ctx.json({ error: "Missing id." }, 400);
      }

      if (!auth?.userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      // Fetch the account and check if it has an access token
      const [account] = await db
        .select({ id: accounts.id, accessToken: accounts.plaidAccessToken, isFromPlaid: accounts.isFromPlaid })
        .from(accounts)
        .where(and(eq(accounts.userId, auth.userId), eq(accounts.id, id)));

      if (!account) {
        return ctx.json({ error: "Not found." }, 404);
      }

      const { accessToken, isFromPlaid } = account;

      // Delete associated recurring transactions
      await db
        .delete(recurringTransactions)
        .where(eq(recurringTransactions.accountId, account.id));

      // Delete the account from the database
      const [deletedAccount] = await db
        .delete(accounts)
        .where(and(eq(accounts.userId, auth.userId), eq(accounts.id, id)))
        .returning({
          id: accounts.id,
        });

      // If the account is from Plaid, check for remaining accounts with the same access token
      if (isFromPlaid && accessToken) {
        const remainingAccounts = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(
            eq(accounts.userId, auth.userId),
            eq(accounts.plaidAccessToken, accessToken),
            eq(accounts.isFromPlaid, true)
          ));

        if (remainingAccounts.length === 0) {
          // If no other accounts with this access token, delete Plaid item and remove row from user_tokens
          try {
            await plaidClient.itemRemove({ access_token: accessToken });
            await plaidClient.itemRemove({ access_token: "access-sandbox-e140993d-2675-424e-9e0f-745454fe7c41" });
            
            // Delete the access token from the user_tokens table
            await db
              .delete(userTokens)
              .where(and(eq(userTokens.userId, auth.userId), eq(userTokens.accessToken, accessToken)));
          } catch (error) {
            console.error(`Failed to delete Plaid item for access token ${accessToken}:`, error);
          }
        }
      }

      // Make request to AI backend to delete the corresponding resource
      const name = `Transactions from ${account.id} for ${auth.userId}`;
      try {
        const aiResponse = await fetch(`${AI_URL}/resources/delete/${encodeURIComponent(name)}`, {
          method: 'DELETE',
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`Failed to delete from AI backend: ${errorText}`);
        }
      } catch (error) {
        console.error(`Error deleting from AI backend for account ${account.id}:`, error);
      }

      return ctx.json({ data: deletedAccount });
    }
);

export default app;
