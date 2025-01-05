import { Hono } from "hono";
import plaidClient from "./plaid";
import { clerkMiddleware } from "@hono/clerk-auth";

const app = new Hono();

app.post("/", clerkMiddleware(), async (ctx) => {
    await plaidClient.itemRemove({ access_token: "access-production-dec42db6-ec88-4d5f-803f-b31b13a185f7" });
    return ctx.json({ message: "Deletion Successful" }, 200);
});

export default app;