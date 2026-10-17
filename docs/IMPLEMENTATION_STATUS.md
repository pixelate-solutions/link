# Implementation status

Branch: `link-2.0`. This file is the resumable checklist; keep it current.
Legend: [x] done and tested · [~] implemented, partially verified · [ ] not done

## 1. Data infrastructure
- [x] Audit (`docs/REBUILD_AUDIT.md`)
- [x] New `link` Postgres schema, integer minor units, ownership on every row, indexes (`server/db/schema.ts`, migration `0000_init`)
- [x] AES-256-GCM secret envelope for Plaid tokens (`server/crypto.ts`)
- [x] Postgres job queue with dedupe, SKIP LOCKED, backoff, terminal failures (`server/jobs.ts`)
- [ ] Legacy data import script + reconciliation test (`scripts/import-legacy.ts`)

## 2. Sync
- [x] `/transactions/sync` applier: idempotent upserts, modified, removed, pending→posted (keeps edits), cursor in same DB transaction
- [x] Pagination restart on `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`
- [~] Live Plaid calls (link token, exchange, sync, liabilities, item/remove): written against plaid-node 48, **not run: no Plaid credentials**
- [ ] Webhook route with ES256 JWT verification + dedupe

## 3. Categorization
- [x] Layered classifier, merchant normalization, transfer pairing, recurring detection
- [x] Corrections (reversible, learned per merchant), NL rules, splits
- [x] Accuracy on synthetic household: ≥98% kind / ≥95% category on unambiguous records (`tests/pipeline.test.ts`)
- [~] AI classification of review items (batched, ≥0.8 confidence only) — code path tested with a scripted model only

## 4. Planning engines
- [x] Baseline, budget, cash-flow forecast, Safe to Spend, debt, FI (deterministic + Monte Carlo), scenarios, allocation, recommendations
- [ ] Dedicated unit tests per engine (pipeline test covers them end to end)

## 5. Goals & recommendations
- [x] Natural-language goal interpretation (rules) + AI refinement path
- [x] Recommendation lifecycle (dedupe, dismiss/resurface on material change, apply/done)

## 6. AI harness / MCP
- [x] Model adapter (OpenAI Responses API, `LINK_AI_MODEL`, default `gpt-6-luna`)
- [x] Tool registry (read / record / propose), proposals requiring approval
- [x] Agent loop with numeric verification + repair round
- [x] Deterministic planner when no model is configured
- [x] MCP server (per-request, user-bound)
- [ ] Tests: agent with scripted model, MCP in-memory client, prompt-injection eval
- [ ] **GPT-6 Luna connectivity: not verified (no `OPENAI_API_KEY` available in this environment)**

## 7. Proactive intelligence
- [x] Pipeline recomputes snapshot + recommendations after every sync/correction
- [ ] Cron route for scheduled review (`refresh_all`)

## 8. Interface
- [ ] Design system, Home, Activity, Plan, Ask, onboarding, account sheet

## 9. Cleanup & validation
- [x] Legacy tree removed (recoverable from git history at `f9af8fd`)
- [ ] Docs: README, ARCHITECTURE, AI_HARNESS, MCP_TOOLS, FINANCIAL_CALCULATIONS, DATABASE_MIGRATION, SECURITY, DEPLOYMENT
- [ ] Lint, typecheck, unit/integration tests, production build, Playwright screenshots

## Blockers needing credentials or decisions
- Plaid sandbox keys (`PLAID_CLIENT_ID`, `PLAID_SECRET`) to verify live sync
- `OPENAI_API_KEY` to verify GPT-6 Luna end to end
- Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) for real auth; local dev uses `LINK_DEV_AUTH=1`
- Billing: the old Stripe flow was removed as insecure; pricing for Link 2.0 is a business decision
- Production legacy-data import requires an authorized run against Neon with a backup
