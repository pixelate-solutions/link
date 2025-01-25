import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { recurringTransactions, transactions } from "@/db/schema"; // Import your standard transactions schema

const recurring = new Hono();

recurring.get(
  "/:id",
  clerkMiddleware(),
  zValidator("param", z.object({ id: z.string() })),
  async (ctx) => {
    const auth = getAuth(ctx);
    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized" }, 401);
    }

    const { id } = ctx.req.valid("param");

    // 1. Fetch the single recurring transaction
    const [recurringTx] = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, id));

    if (!recurringTx) {
      return ctx.json({ error: "Not found" }, 404);
    }

    // 2. Fetch siblings from the standard `transactions` table by `streamId`
    //    Make sure to filter by userId as well if your transactions table has userId
    const siblings = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.payee, recurringTx.name), eq(transactions.userId, recurringTx.userId)));

    return ctx.json({ data: { recurringTx, siblings } });
  }
);

/**
 * PATCH /api/recurring/:id
 * Update a recurring transaction.
 */
recurring.patch(
  "/:id",
  clerkMiddleware(),
  // Validate URL param
  zValidator("param", z.object({ id: z.string() })),
  // Validate request body
  zValidator(
    "json",
    z.object({
      // All fields optional so you can patch only what you need
      name: z.string().optional(),
      payee: z.string().optional(),
      accountId: z.string().optional(),
      categoryId: z.string().optional(),
      frequency: z.string().optional(),
      averageAmount: z.string().optional(),
      lastAmount: z.string().optional(),
      date: z.string().optional(),     // e.g. "YYYY-MM-DD"
      isActive: z.string().optional(), // store "true"/"false" as text if your DB column is text
    })
  ),
  async (ctx) => {
    const auth = getAuth(ctx);
    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized" }, 401);
    }

    const { id } = ctx.req.valid("param");
    const patchData = ctx.req.valid("json");

    // 1. Ensure this transaction exists and belongs to the user
    const [existing] = await db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.id, id),
          eq(recurringTransactions.userId, auth.userId)
        )
      );

    if (!existing) {
      return ctx.json({ error: "Not found or not authorized." }, 404);
    }

    // 2. Perform the update
    const [updated] = await db
      .update(recurringTransactions)
      .set({
        ...(patchData.name !== undefined && { name: patchData.name }),
        ...(patchData.payee !== undefined && { payee: patchData.payee }),
        ...(patchData.accountId !== undefined && {
          accountId: patchData.accountId,
        }),
        ...(patchData.categoryId !== undefined && {
          categoryId: patchData.categoryId === "" ? null : patchData.categoryId,
        }),
        ...(patchData.frequency !== undefined && {
          frequency: patchData.frequency,
        }),
        ...(patchData.averageAmount !== undefined && {
          averageAmount: patchData.averageAmount,
        }),
        ...(patchData.lastAmount !== undefined && {
          lastAmount: patchData.lastAmount,
        }),
        ...(patchData.date !== undefined && {
          date: new Date(patchData.date), // or keep as string if your column is date text
        }),
        ...(patchData.isActive !== undefined && {
          isActive: patchData.isActive, // "true"/"false" as text
        }),
      })
      .where(
        and(
          eq(recurringTransactions.id, id),
          eq(recurringTransactions.userId, auth.userId)
        )
      )
      .returning();

    if (!updated) {
      return ctx.json({ error: "Failed to update transaction." }, 500);
    }

    return ctx.json({ data: updated });
  }
);

export default recurring;
