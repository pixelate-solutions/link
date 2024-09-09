import { Hono } from 'hono';
import { handle } from 'hono/vercel';

import accounts from './accounts';
import summary from './summary';
import transactions from './transactions';
import categories from './categories';
import subscriptionStatus from './subscription-status';
import createCheckoutSession from './create-checkout-session';
import cancelSubscription from './cancel-subscription';
import connectPlaid from './plaid-route';
import setAccessToken from './set-access-token';
import uploadPlaidAccounts from './upload-plaid-accounts';
import uploadPlaidTransactions from './upload-plaid-transactions';

const app = new Hono().basePath('/api');

const routes = app
  .route('/accounts', accounts)
  .route('/categories', categories)
  .route('/summary', summary)
  .route('/transactions', transactions)
  .route('/subscription-status', subscriptionStatus)
  .route('/create-checkout-session', createCheckoutSession)
  .route('/cancel-subscription', cancelSubscription)
  .route('/plaid/connect', connectPlaid)
  .route('/plaid/set-access-token', setAccessToken)
  .route('/plaid/upload-accounts', uploadPlaidAccounts)
  .route('/plaid/upload-transactions', uploadPlaidTransactions)

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);

export type AppType = typeof routes;
