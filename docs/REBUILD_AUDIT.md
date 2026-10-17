# Link 2.0 — Rebuild Audit

Audited: `origin/main` @ `f9af8fd` (2025-08-27), the last published state of the old app. The local
working copy was identical to `e259cb4`, an ancestor of that commit. Audit date: 2026-10-17.

Every claim below comes from reading the code. File references point at the **old** tree (recoverable
with `git show f9af8fd:<path>`).

## Summary

The old app was a fork of a generic finance tutorial template, with Plaid, Stripe and an external AI
service added on top. It has **critical security defects**: any signed-in user could delete another user's
data, read their goals and balances, inject transactions into their accounts, or grant themselves lifetime
access. Plaid access tokens were stored in plaintext, returned to the browser, logged and emailed. The
financial core is also **numerically unreliable**: money stored as text, compared lexicographically in SQL,
summed as floats, with credit-card payments double counted and pending transactions never reconciled.

**Decision: replace, not refactor.** The rebuild keeps the domain knowledge (Clerk identities, Plaid as the
provider, the historical user data) and nothing else structurally. The legacy tables are left untouched in
the `public` schema; the new system lives in a separate `link` Postgres schema and imports legacy data with
a tested, idempotent, non-destructive migration (see `DATABASE_MIGRATION.md`).

| Subsystem | Decision |
|---|---|
| Framework (Next 14, React 18) | Replace → Next 16 / React 19 |
| API layer (Hono catch-all, 29 routers) | Remove → server components + server actions + a few route handlers |
| Auth (Clerk v5, path-matcher middleware) | Keep Clerk, upgrade to v7; authorize inside every server entry point |
| DB schema (text money, no FKs/indexes) | Replace → new `link` schema, integer minor units |
| Migrations (71, non-replayable) | Freeze legacy history; new versioned migrations for `link` schema |
| Plaid integration | Replace → `/transactions/sync` job with cursor, verified webhooks, encrypted tokens |
| Categorization | Replace → fixed taxonomy + layered deterministic classifier + rules + learning |
| Transfers / card payments | Replace → pairing algorithm, kinds separate from categories |
| Recurring detection | Replace → local cadence detector over normalized merchants |
| Aggregation / summaries | Replace → pure engines in `lib/finance`, cached snapshots |
| Forecast | Replace → event-based cash-flow projection with uncertainty |
| Goals | Replace → natural-language goals + interpretation + projections |
| AI chat (external service) | Replace → in-repo agent harness, tool registry, MCP server |
| Stripe billing | Remove (insecure, see below); re-add later with webhook-verified entitlements |
| Email (nodemailer) | Remove (open relay, HTML injection) |
| UI (dashboard, 53 components, Montserrat ×20) | Replace entirely |
| CSV import | Remove (broken: milliunits, failing validation, hidden) |

---

## 1. Framework and packages

**Current.** Next 14.2, React 18, TypeScript 5, Tailwind 3, Clerk 5 (plus unused `@clerk/backend`, `@clerk/clerk-sdk-node`, `@clerk/express`), drizzle-orm 0.30 / drizzle-kit 0.21, Plaid 27, Stripe 16, framer-motion 11, 81 runtime dependencies.

**Problems.**
- Dependencies that are never imported: `typewriter-effect`, `embla-carousel-autoplay`, `react-code-blocks`, `marked`, `simple-statistics`, `@clerk/clerk-sdk-node`, `@clerk/backend`. Others are only used by dead components: `embla-carousel-react`, `react-syntax-highlighter`, `react-copy-to-clipboard`.
- Three Clerk SDKs, two spinner libraries, two typewriter libraries, and both `bun.lockb` and `package-lock.json`.
- No CI, no tests (the only test-related artifact is `@types/jest`), no lint pipeline.

**Decision.** Replace with a minimal current stack: Next 16.4, React 19.3, TypeScript 6.0 (7.x lacks the JS API that typescript-eslint needs), Tailwind 4, Clerk 7, Drizzle 0.45, Plaid 48, Motion 14, openai 7, MCP SDK v2, zod 4, Vitest 5, Playwright. Single lockfile (npm).

**Validation.** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## 2. Authentication and authorization

**Current.** `middleware.ts` protects every path except a public list. Most Hono routes call `getAuth()`. Many do not use it, and instead trust a `userId` from the request body.

**Problems (all exploitable by any signed-up user):**
- `POST /api/plaid/delete-data` (`delete-plaid.ts:12`) deletes **any** user's accounts, transactions, Stripe mapping and tokens, taking `userId` from the body.
- `POST /api/plaid/set-access-token` attaches the caller's Plaid item to any `userId`.
- `GET/PATCH/DELETE /api/goals/:id` (`goals.ts:171,196,210`) have no owner filter (IDOR). `goal-progress` sums balances of arbitrary account ids (`goals.ts:47-52`), which leaks other users' balances.
- `POST /api/transactions` and `/bulk-create` spread a client-supplied `userId`/`accountId` into the insert. `PATCH /api/transactions/:id` can move a row into another user's account.
- `GET /api/recurring-page/:id` (`recurring-transactions.ts:25`) has an IDOR, plus a sibling-transaction leak.
- `GET /api/plaid/category-totals` (`get-category-totals.ts:83`) has **no user filter at all** and returns every user's totals.
- `POST /api/accounts/bulk-delete` deletes recurring rows for account ids the caller does not own.
- `POST /api/send-email` is an open mail relay. `POST /api/plaid/webhook/email` emails arbitrary HTML to any user.
- `POST /api/delete-token` removes a hard-coded Plaid item.
- The browser calls the external AI service directly with `user_id` in the path (`app/api/routes.tsx`): chat history read and clear for any user.

**Decision.** Keep Clerk (v7). Each server action, route handler and MCP tool resolves the user through `requireUser()` on the server and passes `userId` into a service. **Every** query in the service layer filters by `user_id` in the same statement. Client input never carries a user id. A dev-only auth mode (refused when `NODE_ENV=production`) enables local testing without Clerk keys.

**Validation.** Authorization tests that attempt cross-user reads and writes through services, actions and MCP tools (`tests/security.test.ts`).

## 3. Database schema and migrations

**Current.** 15 tables in `public`. There is no users table, no indexes beyond PKs, and almost no FKs.
- Money is stored as `text`: `transactions.amount`, `accounts.current_balance` and `available_balance`, `categories.budget_amount`, `recurring_transactions.average_amount`, `goals.target_amount`.
- Booleans are stored as text in places (`recurring_transactions.is_active`), so the string `"false"` is truthy (`chat-info.ts:171`).
- `chat_access` has no primary key. `transaction_updates` is never used.
- `goals.account_ids` is JSON stored as text.
- 71 migrations. 16 SQL files are empty, the history includes hand-edited SQL, and 0046 drops a constraint that no migration creates. **The history cannot be replayed on a fresh database.** 0030 dropped and recreated `transactions`, which lost all data at that point.

**Data integrity risks.**
- **Mixed units.** Plaid and manual rows hold dollar strings, while seed and CSV rows hold milliunits (×1000).
- **Lexicographic comparisons.** `summary.ts` compares `amount >= '0'` on text.
- **Float casts.** `CAST(... AS FLOAT)` appears across totals.
- **Duplicates.** No unique constraints on `user_tokens`, `stripe_customers` or `item_id`.
- **Unsafe seed.** `scripts/seed.ts` deletes **all rows for all users** in four tables.

**Decision.** New `link` schema (see `DATABASE_MIGRATION.md`):
- All money is `bigint` minor units.
- Explicit sign convention: + means inflow.
- Currency stored per row.
- Provider ids are kept separate from internal ids.
- Unique constraints for idempotent ingestion; FKs with cascade; indexes on every `(user_id, …)` access path.
- The legacy `public` tables are not modified or dropped.

**Migration implications.**
- Accounts, transactions, user-created rules, goals and recurring streams are imported. Amounts are parsed as decimal strings, and suspected milliunit rows are flagged rather than silently divided.
- Plaid tokens are re-encrypted into the new connections table.
- Legacy billing and notification rows remain in place for a future billing rebuild.

**Validation.** The migration test (`tests/legacy-migration.test.ts`) builds the old schema, loads fixture data with known totals, runs the import twice (to check idempotency), and checks that row counts and per-account sums reconcile.

## 4. Financial transaction storage and precision

**Current.** JS `parseFloat` and `Number` are used on the server and in more than 15 client components. Totals are re-stringified with `toFixed(2)`. `convertAmountFromMilliunits` rounds to whole dollars.

**Decision.** `lib/finance/money.ts`: integers only, decimal-string parsing without float drift, and rounding in one place. All engines take and return minor units. Formatting happens only at the edge.

**Validation.** Money unit tests: parsing, sign, rounding and large values.

## 5. Plaid connection, sync and webhooks

**Current problems.**
- **Tokens:**
  - Access tokens are stored in plaintext in two tables.
  - They are returned to the browser (`set-access-token.ts:52`, `GET /api/accounts`).
  - They are logged (`accounts.ts:43,239,361`) and emailed to support (`plaid-update-transactions.ts:274`).
  - A sandbox token is hard-coded in the source.
- **Link flow:**
  - The link token is created with a client-supplied `client_user_id`.
  - The webhook URL is hard-coded to production.
  - There is no update mode, so a broken login can never be repaired.
- **Webhooks:** unverified (no `Plaid-Verification` JWT). Anyone who knows an `item_id` can trigger syncs or delete transactions.
- **Sync data handling:**
  - `/transactions/sync` ignores `removed`. `modified` is treated as new: on link it fails on a unique violation; on webhook it is skipped, so updates are lost.
  - Pending→posted is never handled, so **both legs are kept and double counted**.
  - The cursor is saved before the insert, so a failed insert permanently skips data.
  - On retry, the cursor is not reset to its original value.
- **Execution:**
  - Link and webhook can sync concurrently with the same cursor.
  - Sync runs inside the HTTP request, with no job queue, no retry and no cron.
  - `ITEM_LOGIN_REQUIRED`, `PENDING_EXPIRATION` and `USER_PERMISSION_REVOKED` are unhandled (they only email support).
- **Removal:** `delete-plaid.ts` deletes rows without calling `/item/remove`.

**Decision.** Rebuild:
- **Token storage:** AES-256-GCM encrypted tokens (`server/crypto.ts`), with a key from the environment.
- **Linking:** `link/token/create` with a server-derived user id and update mode for reauth.
- **Webhooks:** verification (ES256 JWT, `kid` key cache, `iat` freshness, body SHA-256) and dedupe in `webhook_events`.
- **Sync:**
  - Done in a job: page through until `has_more` is false, restart from the original cursor on mutation, and apply `added`/`modified`/`removed` in one DB transaction together with the new cursor.
  - Pending→posted is reconciled through `pending_transaction_id`.
  - Connection health is tracked from item errors.

**Migration implications.** Existing items need their webhook URL updated (`/item/webhook/update`) on first sync. Legacy tokens are encrypted during import.

**Validation.** Webhook verification tests with locally generated ES256 keys. The sync applier is tested against Plaid-shaped fixtures (added, modified, removed, pending→posted, duplicate delivery, mutation during pagination). **Live sandbox connectivity requires `PLAID_CLIENT_ID`/`PLAID_SECRET`, which were not available.**

## 6. Duplicate and pending transactions

**Current.**
- Re-linking the same institution creates a new `item_id`, which duplicates every account and transaction.
- Pending and posted legs are both kept.
- The webhook path uses check-then-insert without a transaction.

**Decision.**
- Unique `(account_id, provider_transaction_id)`; idempotent upserts.
- A posted transaction that carries `pending_transaction_id` replaces its pending row and inherits any user edits.
- Duplicate institution links are detected by `(institution_id, account mask, name)`, and the user is offered a reconnect instead.

## 7. Transfer detection

**Current.**
- Anything with "transfer" in its Plaid category is dropped at import, unless the name contains "check" or "pay". That matches "checking", "payroll" and "paypal", so the rule is effectively random.
- Uncategorized (null) transfers are counted in income and expense.

**Decision.** Kinds (`income`, `expense`, `refund`, `transfer`, `card_payment`, `investment_transfer`, `loan_payment`, `fee`) are separate from categories. A pairing algorithm (`lib/finance/transfers.ts`) matches equal-and-opposite legs across the user's own accounts within 5 days. Only `expense`, `refund`, `fee` and `loan_payment` count as spending; only `income` counts as income.

## 8. Credit-card repayments

**Current.**
- **Counted twice.** The checking-side payment maps to "Loan Payments" (an expense), on top of the card purchases.
- The card-side credit is classified as income or expense **by sign only**.

**Decision.** Card payments are a `card_payment` kind on both legs and never count as spending or income. Spending is recognized when the card purchase happens.

## 9. Category assignment and overrides

**Current.**
- The categorization logic is copy-pasted three times.
- Plaid categories are mapped **by category name** to the user's categories, and a name mismatch ("Government/Non Profit" vs "Government/Non-Profit") silently uncategorizes.
- Auto-created rules lock every merchant to its first category, and accumulate duplicates.
- Manual corrections create rules that can never match (digits are not stripped).
- The "recategorize" endpoints the UI calls do not exist.
- Default categories are re-inserted on every page load.

**Decision.**
- A fixed taxonomy (`lib/finance/categories.ts`) and one layered classifier (`lib/finance/classify.ts`), in priority order: rules, learned corrections, structural detection, provider category, merchant dictionary, history, then uncertain.
- Corrections are stored with before/after values and are reversible. They teach the merchant mapping, and can optionally be generalized into a rule.
- Natural-language rules ("Costco is groceries unless it's gas") are parsed into structured `when`/`unless` rules.

**Migration implications.**
- Legacy categories are mapped to taxonomy ids by name. Unmapped categories go to `general`, and the original name is kept on the transaction.
- Legacy categorization rules are imported only when they were user-created (priority ≥ 2 or a manual match type).

## 10. Recurring detection

**Current.**
- Uses only Plaid `/transactions/recurring/get`, and overwrites user edits on every webhook.
- `is_active` is stored as text, so every stream reports as active.

**Decision.** A local detector (`lib/finance/recurring.ts`) groups transactions by merchant and amount band, then infers cadence (weekly, biweekly, semimonthly, monthly, quarterly, annual) from interval statistics, with a confidence score and the next expected date. User confirmations and ignores persist.

## 11. Aggregation and cash flow

**Current.**
- `summary.ts`: text comparisons. The period-over-period change is always 0% because the function ignores its date arguments. The budget sum includes income and transfer categories.
- Net worth is computed on the client with `Number()`. Non–Sallie Mae student loans count as assets, and a $0 credit card adds its available credit to assets.
- `forecast.ts`: a moving average of net flow, labelled "net worth", that ignores its `weeks` parameter.

**Decision.** Pure, unit-tested engines (`lib/finance/*`) feed a per-user snapshot (`link.snapshots`). The snapshot is recomputed by a job after each data change and read by Home, Plan, the recommendation engine and the AI tools, so every surface uses the same numbers.

## 12. AI implementation

**Current.**
- There is no LLM in the repo. The browser calls an external service at `NEXT_PUBLIC_AI_URL` with no auth.
- `/api/logic` pastes JSON for 100 unordered transactions, plus balances, into a prompt.
- The `allow_access` toggle is ignored.
- `deleteChatInfo` deletes a resource by name for every user.
- Output is rendered with `rehype-raw` and no sanitizer, an XSS and data-exfiltration path for prompt-injected payee strings.

**Decision.** In-repo harness (`server/ai`), documented in `AI_HARNESS.md`:
- **Model:** a model adapter on the OpenAI Responses API. The model id comes from env (`LINK_AI_MODEL`, default `gpt-6-luna`).
- **Tools:** a typed tool registry that is also served as an MCP server. Tools are read-only by default; mutating tools produce proposals that the user confirms.
- **Data handling:** context is assembled from the snapshot, not raw dumps. Transaction text is fenced and marked as untrusted. Output is plain-text markdown with no raw HTML.
- **Record keeping:** runs and tool executions are recorded.

## 13. Subscription and billing

**Current (insecure):**
- No Stripe webhook exists.
- Checkout marks lifetime access **before payment**, for a body-supplied `userId`. `priceId` is not allow-listed.
- The promo code is shipped in a `NEXT_PUBLIC_` variable.
- Referral credit can be applied repeatedly to any customer.
- Gating is client-side only.
- When a price id is unknown, the plan maps to "Free" and **client pages call an endpoint that deletes all of the user's Plaid data**.

**Decision.** Remove billing from the rebuild. A correct implementation needs webhook-confirmed entitlements and a pricing decision for the new product. That is a business decision, recorded as an open item in `IMPLEMENTATION_STATUS.md`. Legacy `stripe_customers` and `lifetime_purchases` rows are preserved untouched.

## 14. State management

**Current.** react-query and zustand sheet stores, plus a hand-rolled event bus (`shared-transactions-state.tsx`, unused). Many pages are `"use client"` and fetch everything on mount.

**Decision.** Server components read from services. Mutations are server actions followed by `revalidatePath`. There is a small amount of client state for UI only. react-query, zustand and Hono are removed.

## 15. UI, responsive layout and accessibility

**Current.**
- Nine routes plus a landing page. The dashboard shows six cards and four chart variants (pie, radar, radial, area, bar, line). There are walkthrough videos, typewriter effects, blurred gradient blobs, and Montserrat instantiated separately in 20 files.
- Dark mode is not wired up (the Toaster is forced to light).
- Tables are used on mobile.
- `<div onClick>` controls are common. There is no reduced-motion handling.
- About 9 MB of unreferenced images and videos in `public/`.

**Decision.** Full redesign: Home, Activity and Plan, with an account sheet and contextual "Ask". There is a single type family (Geist) with tabular figures, OKLCH tokens, light and dark themes, a motion system with reduced-motion support, and semantic, keyboard-navigable controls. Unreferenced assets are removed.

## 16. Error handling and observability

**Current.** `console.log` and `console.error` are scattered through the code, sometimes printing tokens. Errors are emailed to a support inbox. Handlers sometimes never return a response.

**Decision.**
- A structured logger with redaction for tokens, account numbers and amounts in errors.
- `jobs` and `webhook_events` tables record failures with attempts and the last error.
- `agent_runs` records model, latency, token usage and cost.
- A connection health state is visible to the user.

## 17. Privacy and data retention

**Current.**
- The privacy policy says the service does not monitor balances, but balances are sent to the AI.
- There is no export, no account deletion, and no AI-memory controls.

**Decision.** The account sheet provides:
- Export (JSON of all `link` rows for the user).
- Disconnect, which calls `/item/remove` and keeps history unless deletion is requested.
- Delete account, which removes Plaid items and cascades all user rows.
- A view and delete control for AI memories.

Only aggregates and minimal transaction fields are sent to the model.

## 18. Testing infrastructure

**Current.** None.

**Decision.**
- Vitest unit tests for every engine.
- Integration tests on PGlite (in-process Postgres) using the same Drizzle schema and migrations.
- An AI evaluation suite with deterministic datasets.
- Playwright screenshots at mobile, tablet and desktop sizes in both themes.

## 19. Dead code and unused assets (removed)

- **Components:** `app-sidebar`, `ui/sidebar`, `hooks/use-mobile`, `code-block`, `coming-soon`, `forecast-chart`, `goal-grid`, `goal-chart`, `goal-planner-form`, `header copy.tsx`, `header-logo-large`, `header-logo-landing`, `ui/carousel`.
- **Unused file:** `app/api/shared-transactions-state.tsx`.
- **Pages:** `/train-assistant` (a toy notes page).
- **Demo-site content:** `demo-popup`.
- **Media:** walkthrough and demo videos.
- **Images (unreferenced):** `Categories.png`, `Chat.png`, `ChatMockUp.png`, `ConnectedAccounts.png`, `Link_Logo_Black.png`, `Link_Logo_Gradient.png`, `OverviewMockUp.png`, `OverviewTop.png`, `Transactions.png`, `demo.mp4`.
- **Template leftovers:** `.gitpod.yml` and the template `.github` funding and issue files.

In practice, the old `app/`, `components/`, `features/`, `providers/`, `hooks/`, `config/`, `scripts/seed.ts` and `styles.css` trees are replaced wholesale.
