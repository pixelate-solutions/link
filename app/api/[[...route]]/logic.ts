import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/db/drizzle";
import { eq, and } from "drizzle-orm";
import { accounts, transactions, categories, chatResponses } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";

const app = new Hono();

// Validate that the POST body includes a "question" string.
const requestSchema = z.object({
  question: z.string(),
});

app.post(
  "/",
  clerkMiddleware(),
  zValidator("json", requestSchema),
  async (ctx) => {
    const auth = getAuth(ctx);
    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized." }, 401);
    }
    const { question } = ctx.req.valid("json");

    const now = new Date();

    // Check if there's a cached response for this question for the current user.
    const cachedResponseArr = await db
      .select()
      .from(chatResponses)
      .where(
        and(
          eq(chatResponses.userId, auth.userId),
          eq(chatResponses.question, question)
        )
      )
      .limit(1);

    if (cachedResponseArr.length > 0) {
      const cached = cachedResponseArr[0];
      const cachedDate = new Date(cached.responseDate);
      const diffTime = now.getTime() - cachedDate.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);

      // If cached response is less than 7 days old, return it.
      if (diffDays < 7) {
        return new Response(cached.response, {
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
    }

    // Query the user's accounts with only the needed fields.
    const userAccounts = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        category: accounts.category,
        currentBalance: accounts.currentBalance,
        availableBalance: accounts.availableBalance,
      })
      .from(accounts)
      .where(eq(accounts.userId, auth.userId));

    // Query the user's most recent 100 transactions with only the needed fields.
    const userTransactions = await db
      .select({
        amount: transactions.amount,
        payee: transactions.payee,
        date: transactions.date,
        account_id: transactions.accountId,
        category_id: transactions.categoryId,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(eq(accounts.userId, auth.userId))
      .limit(100);

    // Query the user's categories with only the needed fields.
    const userCategories = await db
      .select({
        id: categories.id,
        name: categories.name,
        budget_amount: categories.budgetAmount,
      })
      .from(categories)
      .where(eq(categories.userId, auth.userId));

    // Build the full query string with pretty JSON.
    const fullQuery = `User Data:
Accounts: ${JSON.stringify(userAccounts, null, 2)}
Transactions: ${JSON.stringify(userTransactions, null, 2)}
Categories: ${JSON.stringify(userCategories, null, 2)}

Question: ${question}`;

    const AI_URL = process.env.NEXT_PUBLIC_AI_URL;
    const aiRes = await fetch(`${AI_URL}/finance/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: auth.userId,
        query: fullQuery,
        allow_access: true,
        using_user_id: true,
      }),
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      return ctx.json({ error: errorText }, 500);
    }

    if (!aiRes.body) {
      return ctx.text("No response from AI backend");
    }

    // Instead of streaming, accumulate the full response text.
    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let newResponseText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      newResponseText += decoder.decode(value);
    }

    // Save the new response in the database.
    if (cachedResponseArr.length > 0) {
      // Update existing record.
      await db
        .update(chatResponses)
        .set({
          response: newResponseText,
          responseDate: new Date(),
        })
        .where(
          and(
            eq(chatResponses.userId, auth.userId),
            eq(chatResponses.question, question)
          )
        );
    } else {
      // Insert new record.
      await db.insert(chatResponses).values({
        id: createId(),
        userId: auth.userId,
        question: question,
        response: newResponseText,
        responseDate: new Date(),
      });
    }

    // Return the new response.
    return new Response(newResponseText, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
);

export default app;
