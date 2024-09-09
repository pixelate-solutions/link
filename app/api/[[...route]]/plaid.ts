import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Load environment variables with validation
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  throw new Error("Missing Plaid environment variables: PLAID_CLIENT_ID or PLAID_SECRET");
}

// Plaid Client Configuration
const config = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
  },
});

// Create the Plaid client
const plaidClient = new PlaidApi(config);

export default plaidClient;
