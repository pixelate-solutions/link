import { Hono } from "hono";
import plaidClient from "./plaid";
import { clerkMiddleware } from "@hono/clerk-auth";

const app = new Hono();

app.post("/", clerkMiddleware(), async (ctx) => {
    await plaidClient.itemRemove({ access_token: "access-sandbox-166cdc35-9f15-49cb-a969-3fd8b78c3a25" });
    return ctx.json({ message: "Deletion Successful" }, 200);
});


export default app;