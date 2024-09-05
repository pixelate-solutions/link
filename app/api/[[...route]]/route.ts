import { Hono } from 'hono';
import { handle } from 'hono/vercel';

import accounts from './accounts';
import categories from './categories';
import summary from './summary';
import transactions from './transactions';
import subscriptionStatus from './subscription-status';
import createTestCheckoutSession from './create-checkout-session';
import cancelSubscription from './cancel-subscription';
import switchSubscription from './switch-subscription';

const app = new Hono().basePath('/api');

const routes = app
  .route('/accounts', accounts)
  .route('/categories', categories)
  .route('/summary', summary)
  .route('/transactions', transactions)
  .route('/subscription-status', subscriptionStatus)
  .route('/create-test-checkout-session', createTestCheckoutSession)
  .route('/cancel-subscription', cancelSubscription)
  .route('/switch-subscription', switchSubscription);

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);

export type AppType = typeof routes;
