import { Hono } from 'hono';
import { handle } from 'hono/vercel';

import accounts from './accounts';
import categories from './categories';
import summary from './summary';
import transactions from './transactions';
import subscriptionStatus from './subscription-status'; // Import the new route
import createCheckoutSession from './create-checkout-session'; // Import the new route

const app = new Hono().basePath('/api');

const routes = app
.route('/accounts', accounts)
.route('/categories', categories)
.route('/summary', summary)
.route('/transactions', transactions)

// Register the new routes
.route('/subscription-status', subscriptionStatus)
.route('/create-checkout-session', createCheckoutSession)

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);

export type AppType = typeof routes;
