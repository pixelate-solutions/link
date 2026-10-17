# Implementation status

Branch `link-2.0`. This is the resumable checklist; keep it current.

**Legend:**
- [x] done and verified (automated test or rendered UI)
- [~] implemented, verification blocked or partial
- [ ] not done

## 1. Data infrastructure
- [x] Audit (`docs/REBUILD_AUDIT.md`)
- [x] `link` Postgres schema: integer cents, ownership on every row, idempotency constraints, migration `0000_init`. Applied to local Postgres 17 and to PGlite in tests.
- [x] AES-256-GCM token encryption with the item id as AAD
- [x] Postgres job queue: dedupe, SKIP LOCKED, backoff, terminal failures, stuck-job recovery

## 2. Sync
- [x] `/transactions/sync` applier: atomic, idempotent, modified, removed, pending→posted keeping user edits, unchanged redeliveries are no-ops
- [x] Pagination restart on mutation during pagination
- [x] Webhook ES256 verification, dedupe, item health (login required, revoked, repaired)
- [~] Live Plaid calls (link token, exchange, sync, liabilities, item/remove, update mode). Written against plaid-node 48 and typechecked. **Not run: no Plaid credentials.**

## 3. Categorization
- [x] Layered classifier, merchant normalization, transfer and card-payment pairing, recurring detection
- [x] Corrections (reversible, learned per merchant), natural-language rules, splits, notes
- [x] Synthetic household: ≥98% kind and ≥95% category accuracy on unambiguous records. Spending reconciles exactly to ground truth.
- [~] AI classification of review items. Tested with a scripted model only.

## 4. Planning engines
- [x] Baseline, budget (versioned, user-locked items), cash forecast, Safe to Spend, debt, financial independence (deterministic, Monte Carlo, sequence risk, sensitivity), allocation, scenarios, recommendations with lifecycle
- [x] Unit tests (`tests/engines.test.ts`) and end-to-end tests (`tests/pipeline.test.ts`, `tests/acceptance.test.ts`)

## 5. AI harness and MCP
- [x] Responses API adapter (`LINK_AI_MODEL`, default `gpt-6-luna`), cost and latency tracking
- [x] Tool registry (read / record / propose), proposals require approval
- [x] Agent loop with numeric verification and a repair round. Tested with a scripted model, including prompt injection.
- [x] Deterministic planner when no model is configured
- [x] MCP server (per-request, user-bound). Tested with the in-memory client.
- [x] Evaluation suite: 10/10 on the deterministic planner (`npm test`)
- [x] **GPT-6 Luna end to end: 10/10** with `npm run ai:eval` (live API, 2026-10-17), including a prompt injection planted in a transaction description

## 6. Proactive intelligence
- [x] Pipeline recomputes the snapshot, recommendations and goal progress after every sync, correction or plan change
- [x] Cron route: queue drain plus daily review (`vercel.json`)
- [x] A material new obligation surfaces; a $4 coffee does not (`tests/acceptance.test.ts`)
- [ ] Outbound notifications (email or push). The table and preference exist; no delivery channel yet.

## 7. Interface
- [x] Design system: tokens, light and dark, Geist with tabular figures, Motion springs, reduced motion
- [x] Onboarding: goal question, connect, demo data. Home is adaptive (empty, syncing, shortfall, new, steady).
- [x] Activity: search, filters, recurring view, detail sheet with correction, scope, split, note and undo
- [x] Plan: interactive projection in the browser, what-if with accept, goals ordering, lifestyle dial, spending plan, cash flow, net worth
- [x] Ask panel: streaming, tool status, inline approvals. Account sheet: connections, preferences, facts, memories, rules, theme, export, delete.
- [x] Playwright visual pass (`npm run ui:screens`) at phone, tablet and desktop in light and dark, with no console errors
- [~] Progressive Web App: installable manifest is done. No offline shell or service worker; stale balances are labeled "As of …"

## 8. Cleanup and validation
- [x] Legacy tree removed (recoverable from git at `f9af8fd`). Runtime dependencies cut from 77 to 19.
- [x] Docs: README, ARCHITECTURE, AI_HARNESS, MCP_TOOLS, FINANCIAL_CALCULATIONS, DATABASE_MIGRATION, SECURITY, DEPLOYMENT
- [x] `npm run typecheck`, `npm run lint`, `npm test` (all green), `npm run build` (production build succeeds). Unauthenticated access checked against `next start`.

## Blockers needing credentials or decisions
- **Plaid** sandbox or production keys (`PLAID_CLIENT_ID`, `PLAID_SECRET`), to verify live sync and webhooks.
- **Clerk keys**, for real auth. Local development uses `LINK_DEV_AUTH=1`.
- **Shared households.** Needs a consent and permissions design before implementation.
