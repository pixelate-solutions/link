import { clerkMiddleware } from '@hono/clerk-auth';
import { Hono } from 'hono';

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  try {
    const webhookData = await ctx.req.json();
    console.log('Received webhook:', webhookData);

    return ctx.text('Webhook received', 200);
  } catch (error) {
    console.error('Error processing webhook:', error);
    return ctx.text('Internal Server Error', 500);
  }
});

export default app;