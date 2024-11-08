import { Hono } from "hono";
import { clerkMiddleware } from "@hono/clerk-auth";
// import { db } from "@/db/drizzle";
// import { accounts, transactions, userTokens, categories, transactionUpdates } from "@/db/schema";
// import { createId } from "@paralleldrive/cuid2";
// import plaidClient from "./plaid";
// import { eq, and, desc } from "drizzle-orm";
// import { isSameDay } from "date-fns";

const app = new Hono();

// const AI_URL = process.env.NEXT_PUBLIC_AI_URL;

// const checkOrUpdateLastRunDate = async (userId: string) => {
//   const today = new Date();
//   const [lastUpdate] = await db
//     .select({ lastUpdated: transactionUpdates.lastUpdated })
//     .from(transactionUpdates)
//     .where(eq(transactionUpdates.userId, userId))
//     .execute();

//   if (lastUpdate && isSameDay(new Date(lastUpdate.lastUpdated), today)) {
//     return false;
//   }

//   await db
//     .insert(transactionUpdates)
//     .values({
//       id: createId(),
//       userId: userId,
//       lastUpdated: today,
//     })
//     .onConflictDoUpdate({
//       target: transactionUpdates.userId,
//       set: { lastUpdated: today },
//     })
//     .execute();

//   return true;
// };

app.post('/', clerkMiddleware(), async (ctx) => {
  console.log("PASS");
  // const auth = getAuth(ctx);
  // const userId = auth?.userId;
  // const { item_id } = await ctx.req.json(); // Extract item_id from request body
  // console.log("obtained item id");

  // if (!userId || !item_id) {
  //   return ctx.json({ error: "Unauthorized or missing item_id" }, 401);
  // }

  // const shouldProceed = await checkOrUpdateLastRunDate(userId);
  // if (!shouldProceed) {
  //   return ctx.json({ message: 'Already processed today' });
  // }

  // // Retrieve the access token for the specific item_id
  // const result = await db
  //   .select({ accessToken: userTokens.accessToken })
  //   .from(userTokens)
  //   .where(and(eq(userTokens.userId, userId), eq(userTokens.itemId, item_id)))
  //   .orderBy(desc(userTokens.createdAt));

  // const accessToken = result[0]?.accessToken;
  
  // console.log("Got access token: ", accessToken);

  // if (!accessToken) {
  //   return ctx.json({ error: "Access token not found" }, 404);
  // }

  // const startDate = new Date();
  // startDate.setFullYear(startDate.getFullYear() - 10);
  // const endDate = new Date();

  // const plaidTransactionsResponse = await plaidClient.transactionsGet({
  //   access_token: accessToken,
  //   start_date: startDate.toISOString().split('T')[0],
  //   end_date: endDate.toISOString().split('T')[0],
  // });
  // const plaidTransactions = plaidTransactionsResponse.data.transactions;

  // const dbAccounts = await db
  //   .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
  //   .from(accounts)
  //   .where(eq(accounts.userId, userId));

  // const accountIdMap = dbAccounts.reduce((map, account) => {
  //   if (account.plaidAccountId) {
  //     map[account.plaidAccountId] = account.id;
  //   }
  //   return map;
  // }, {} as Record<string, string>);

  // const dbCategories = await db
  //   .select({ id: categories.id, name: categories.name })
  //   .from(categories)
  //   .where(eq(categories.userId, userId));
  // const categoryOptions = dbCategories.map(category => category.name);

  // const transactionCategories = plaidTransactions.map(transaction => 
  //   transaction.personal_finance_category?.detailed || transaction.personal_finance_category?.primary || ""
  // );

  // const query = 
  //     `Here is a list of categories from recurring transactions: [${transactionCategories}]
  //     Categorize each of these into one of the following categories: [${categoryOptions.join(", ")}] and
  //     respond as a list with brackets "[]" and comma-separated values with NO other text than that list.
  //     You MUST categorize each of these [${transactionCategories}] as one of these: [${categoryOptions.join(", ")}].
  //   `;

  // const data = {
  //   user_id: userId,
  //   query: query,
  //   allow_access: false,
  //   using_user_id: true,
  // };
  // console.log("set query");

  // const aiResponse = await fetch(`${AI_URL}/finance/categorize`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(data),
  // });

  // if (!aiResponse.ok) {
  //   const errorText = await aiResponse.text();
  //   console.error('Error from AI API:', errorText);
  //   return ctx.json({ error: 'Failed to categorize transactions' }, 500);
  // }

  // const aiData = await aiResponse.json();
  // const categorizedResults = JSON.parse(aiData);

  // await Promise.all(
  //   plaidTransactions.map(async (transaction, index) => {
  //     const accountId = accountIdMap[transaction.account_id];
  //     if (!accountId) return;
      
  //     const plaidTransactionId = transaction.transaction_id;
  //     const amount = transaction.amount.toString();
  //     const categoryId = dbCategories.find(category => category.name === categorizedResults[index])?.id;
  //     if (!categoryId) return;

  //     const existingTransaction = await db
  //       .select({ plaidTransactionId: transactions.plaidTransactionId })
  //       .from(transactions)
  //       .where(and(eq(transactions.userId, userId), eq(transactions.plaidTransactionId, plaidTransactionId)));

  //     if (existingTransaction.length > 0) return;

  //     await db.insert(transactions).values({
  //       id: createId(),
  //       userId: userId,
  //       amount: amount,
  //       payee: transaction.name,
  //       date: new Date(transaction.date),
  //       accountId: accountId,
  //       categoryId: categoryId,
  //       isFromPlaid: true,
  //       plaidTransactionId: plaidTransactionId,
  //     }).execute();
  //   })
  // );

  // console.log("FINISHED");

  // return ctx.json({ message: 'Transactions processed successfully' });
});

export default app;
