import { Hono } from "hono";
import plaidClient from "./plaid";
import { clerkMiddleware } from "@hono/clerk-auth";

const app = new Hono();

app.post("/", clerkMiddleware(), async (ctx) => {
    await plaidClient.itemRemove({ access_token: "access-production-c19ac662-cc0a-4b55-be9a-c6bf499c1f56" });
    return ctx.json({ message: "Deletion Successful" }, 200);
});

export default app;