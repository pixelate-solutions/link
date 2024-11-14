import { Hono } from 'hono';

const app = new Hono();

app.post('/transactions', async (ctx) => {
  const plaidWebhookSignature = ctx.req.header('Plaid-Webhook-Signature');
  
  if (plaidWebhookSignature) {
    try {
      const webhookData = await ctx.req.json();
      console.log('Received webhook:', webhookData);

      if (webhookData.webhook_code === 'DEFAULT_UPDATE') {
        console.log(`Item ID: ${webhookData.item_id}`);
        console.log(`New Transactions: ${webhookData.new_transactions}`);
      }

      return ctx.text('Webhook received', 200);
    } catch (error) {
      console.error('Error processing webhook:', error);
      return ctx.text('Internal Server Error', 500);
    }
  } else {
    return ctx.text('Webhook signature missing', 400);
  }
}).get('/transactions', async (ctx) => {
    return ctx.text('PLAID TRANSACTIONS WEBHOOK PAGE', 200);
});

export default app;
