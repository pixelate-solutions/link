import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let client: PlaidApi | null = null;

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function plaidEnv(): string {
  return process.env.PLAID_ENV ?? "sandbox";
}

export function plaid(): PlaidApi {
  if (!plaidConfigured()) throw new Error("Plaid is not configured (PLAID_CLIENT_ID / PLAID_SECRET)");
  client ??= new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[plaidEnv()] ?? PlaidEnvironments.sandbox,
      baseOptions: { headers: { "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!, "PLAID-SECRET": process.env.PLAID_SECRET! } },
    }),
  );
  return client;
}

/** Extract Plaid's error code from an axios error without leaking request bodies. */
export function plaidErrorCode(err: unknown): string | null {
  const data = (err as { response?: { data?: { error_code?: string } } })?.response?.data;
  return data?.error_code ?? null;
}

export function webhookUrl(): string | undefined {
  const base = process.env.LINK_PUBLIC_URL;
  return base ? `${base.replace(/\/$/, "")}/api/webhooks/plaid` : undefined;
}
