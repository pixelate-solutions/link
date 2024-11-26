import { Hono } from "hono";
import plaidClient from "./plaid";
import { clerkMiddleware } from "@hono/clerk-auth";

const app = new Hono();

app.post("/", clerkMiddleware(), async (ctx) => {
    await plaidClient.itemRemove({ access_token: "access-production-37afbf52-900c-4a5a-bab3-5f5e43f4ec60" }); // delta card
    await plaidClient.itemRemove({ access_token: "access-production-1a593dd5-bce7-41b7-9d05-e6d8b7fcb035" }); // checking
    return ctx.json({ message: "Deletion Successful" }, 200);
});

export default app;