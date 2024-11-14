import * as crypto from 'crypto';

// Webhook signature verification
const verifyWebhookSignature = (signature: string, body: string) => {
  const plaidWebhookSecret = process.env.PLAID_WEBHOOK_SECRET;
  if (!plaidWebhookSecret) {
    throw new Error('Missing PLAID_WEBHOOK_SECRET environment variable');
  }

  // Create a SHA256 HMAC using the secret and body, and compare with the Plaid signature
  const expectedSignature = crypto
    .createHmac('sha256', plaidWebhookSecret)
    .update(body)
    .digest('base64');

  return signature === expectedSignature;
};

export default verifyWebhookSignature;
