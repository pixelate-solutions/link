import { Hono } from "hono";
import plaidClient from "./plaid";
import { clerkMiddleware } from "@hono/clerk-auth";

const app = new Hono();

app.post("/", clerkMiddleware(), async (ctx) => {
    await plaidClient.itemRemove({ access_token: "access-sandbox-8a0a7b32-5352-42c0-90eb-1cd977b84287" });
    return ctx.json({ message: "Deletion Successful" }, 200);
});


export default app;