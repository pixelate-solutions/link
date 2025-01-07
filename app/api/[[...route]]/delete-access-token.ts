import { Hono } from "hono";
import plaidClient from "./plaid";
import { clerkMiddleware } from "@hono/clerk-auth";

const app = new Hono();

app.post("/", clerkMiddleware(), async (ctx) => {
    await plaidClient.itemRemove({ access_token: "access-production-3824d75e-0c7c-44f7-8ad5-43ee3d1ff0ee" });
    return ctx.json({ message: "Deletion Successful" }, 200);
});

export default app;