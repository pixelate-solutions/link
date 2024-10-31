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
import deletePlaidData from './delete-plaid';
import accountTotals from './get-account-totals';
import categoryTotals from './get-category-totals';
import plaidUpdateTransactions from './plaid-update-transactions';
import chatAccess from './chat-access-status';
import recurringTransactions from './upload-plaid-recurring-transactions';
import promoCode from './promo'
import sendEmail from './send-email'
import gatherInfo from './chat-info'

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
  .route('/plaid/delete-data', deletePlaidData)
  .route('/plaid/account-totals', accountTotals)
  .route('/plaid/category-totals', categoryTotals)
  .route('/plaid/update-transactions', plaidUpdateTransactions)
  .route('/chat-access', chatAccess)
  .route('/plaid/recurring', recurringTransactions)
  .route('/apply-promo-code', promoCode)
  .route('/send-email', sendEmail)
  .route('/chat/info', gatherInfo)
  
export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);

export type AppType = typeof routes;
