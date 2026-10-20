# Security

## Authorization

- **Identity is resolved on the server only** (`server/auth.ts → requireUser`). It comes from the Clerk session, or locally from a signed dev cookie. Client input never carries a user id.
- **Every service query filters by `user_id` in the same statement**: reads, updates and deletes by id included. This is enforced by convention and tested in `tests/security.test.ts`:
  - by-id reads and writes on transactions, goals, recommendations, scenarios, proposals, rules and recurring;
  - list and aggregate isolation;
  - ids smuggled into tool arguments;
  - MCP binding.
- **Link API tokens** (`server/services/api-tokens.ts`) authenticate `/api/v1/*` and `/api/mcp` for scripts and agents. A token is `link_` + 32 random bytes, shown once; only its SHA-256 hash is stored. Tokens are read-only: `/api/v1` has only GET endpoints that write nothing (pinned by a whole-database fingerprint in `tests/api.test.ts`), and a token MCP session gets only the read tools. Revoking takes effect on the next request.
- **Dev auth** (`LINK_DEV_AUTH=1`) is refused under `NODE_ENV=production`, with no override. Verified against `next start`: `/api/dev/session` returns 404, and protected pages redirect to sign-in.

**Verified unauthenticated responses (production build):**
- `/api/ask`, `/api/mcp`, `/api/export`, `/api/cron`, `/api/v1/*` (except the `/api/v1` index), and unsigned `/api/webhooks/plaid` → 401
- `/home` → redirect to sign-in

## Secrets

- **Plaid access tokens:**
  - Encrypted with AES-256-GCM (`server/crypto.ts`), using the item id as additional authenticated data, so a ciphertext can't be moved to another item.
  - The key comes from `LINK_ENCRYPTION_KEY` and is never stored in the database.
  - Tokens never leave the server. Exchange happens in `/api/plaid/exchange`.
  - Exports omit them.
  - On disconnect, the stored ciphertext is replaced.
- **Logging:** the logger (`server/log.ts`) redacts token-shaped strings and any `token|secret|password|authorization|cookie` keys. Tool and MCP output was checked to contain no tokens.

## Webhooks and cron

- **Plaid webhooks** are verified per Plaid's spec:
  - ES256 JWT, with the key fetched by `kid` and cached;
  - a 5-minute `iat` limit;
  - constant-time SHA-256 comparison of the raw body.
- **Deliveries are deduplicated** by body hash within a 5-minute window. Plaid bodies carry no event id and legitimately repeat, so later identical notifications still trigger a sync.
- **The cron endpoint** requires `Authorization: Bearer $CRON_SECRET`, compared in constant time.

## Errors

Errors returned to the browser, the model, or MCP clients pass through `publicError()`. Database and library errors are replaced with a generic message, so SQL, parameters and ids never leak.

## Idempotency

Applying a recommendation, accepting a scenario, and approving a proposal each claim the record's state atomically, so repeated or concurrent requests apply once.

## AI-specific

- Bank text is sanitized and marked untrusted in tool results.
- Tools act only as the session user.
- Consequential changes are proposals that need explicit approval, described by code from the actual payload. No tool can move money or act outside Link.
- Facts and memories are written only when grounded in the user's own message this turn. Otherwise they need approval or are refused.
- Assistant output is never rendered as HTML.
- Numeric claims are verified against tool output (see [AI_HARNESS.md](AI_HARNESS.md)).
- The data minimization:
  - the context block holds aggregates, not raw transactions;
  - classification sends only merchant text and rounded amounts;
  - `store: false` is set on model calls.

## User controls (account sheet)

- Disconnect: Plaid `/item/remove`; history kept or deleted.
- Export everything as JSON.
- View and delete planning facts and AI memories.
- Delete rules.
- Correct or undo any categorization.
- Delete account: removes Plaid items, cascades every row, and deletes the Clerk user.

## Headers

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a restrictive `Permissions-Policy`
- no `X-Powered-By`

## Known gaps

- **No per-user rate limiting** on `/api/ask` or `/api/v1`. Model cost is tracked per run but not capped.
- **MCP token scopes are not enforced per tool** for Clerk sessions, OAuth tokens and API keys: they get every tool (Link API tokens get only the read tools). Writes still go through in-app approval; scope enforcement comes with the OAuth setup.
- **Single-user ownership only.** Shared households are not implemented, so nothing can be shared by accident.
- **`npm audit` reports advisories in dev-only tooling**: drizzle-kit's bundled esbuild, and eslint-config-next's glob dependencies. They are not in the runtime bundle.
