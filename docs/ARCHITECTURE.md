# Architecture

One Next.js 16 application: no microservices, one database, one job queue, one agent.

```
                 ┌──────────── app/ (Next.js App Router) ────────────┐
 browser ──────▶ │ pages (server components) · actions.ts · api/*     │
                 └───────────────┬───────────────────────────────────┘
                                 │ requireUser() → userId (server-side only)
                 ┌───────────────▼────────────── server/ ─────────────┐
 Plaid ─webhook▶ │ plaid/ (sync applier, webhook verify)               │
                 │ pipeline/ (classify → pair transfers → recurring)   │
                 │ services/ (activity, plan, picture, proposals, …)   │
                 │ ai/ (provider, tools, agent, offline, mcp, eval)    │
                 │ jobs.ts (Postgres queue)  db/ (Drizzle, link schema) │
                 └───────────────┬────────────────────────────────────┘
                                 │ pure functions, integer cents
                 ┌───────────────▼──────── lib/finance/ ──────────────┐
                 │ money · categories · merchants · classify ·        │
                 │ transfers · recurring · analysis · budget ·        │
                 │ cashflow · debt · fi · goals · plan · scenario ·   │
                 │ recommend · rules                                  │
                 └────────────────────────────────────────────────────┘
```

## Layers

- **`lib/finance`** is pure TypeScript with no I/O. Every number in the product comes from here: Home, Plan, recommendations, AI tools and MCP. The server runs it, and so does the browser, for the instant projection sliders on Plan. Money is always an integer number of cents. Positive means money into the user's account.
- **`server/`** owns state.
  - Every service function takes `userId` as its first argument and filters by it in the same query.
  - Plaid sync, the processing pipeline and recommendation lifecycle live here.
  - The AI harness lives here too.
- **`app/`** is thin. Server components read services. Mutations go through `app/actions.ts`, which resolves the user, validates with zod, and calls a service. Route handlers cover streaming (`/api/ask`), Plaid, webhooks, cron, MCP and export.

## Data flow

1. **Ingest.** Plaid sync is triggered by a webhook, a cron job, or a manual refresh. `/transactions/sync` is paged through, and the result is applied atomically by `applySyncBatch`, which covers accounts, upserts, pending→posted, removals and the cursor. Each new row is classified by the layered classifier on insert.
2. **Process.** The `process_user` job:
   - re-runs low-confidence defaults with the user's history;
   - pairs transfers and card payments;
   - persists recurring series;
   - recomputes the **picture**.
3. **Picture.** `computeAll()` produces one JSON snapshot that drives every surface: position, baseline, flows, Safe to Spend, 90-day forecast, budget, goal projections and allocations. It is stored in `link.snapshots`.
4. **Recommend.** `generateRecommendations()` ranks candidates. `syncRecommendations()` handles dedupe, dismissal and resurfacing.
5. **Ask.** The agent and the MCP server call the same tool registry, which calls the same services and engines.

## Background work

`link.jobs` is a Postgres queue:
- idempotent enqueue (one queued copy per dedupe key);
- `FOR UPDATE SKIP LOCKED` claiming;
- exponential backoff and a terminal `failed` state;
- recovery of stuck jobs.

The queue is drained by:
- `after()` following webhooks and token exchange;
- `/api/cron`, every 15 minutes, plus a daily review that refreshes every user;
- `npm run jobs:work` locally.

## Auth

Clerk v7 when keys are present: `proxy.ts` attaches the session, and `requireUser()` authorizes inside every page, action and route.

Locally, `LINK_DEV_AUTH=1` enables a signed-cookie dev session. It is refused in production; this was verified against `next start`, where every protected route returned 401 or a redirect.

## Key decisions

| Decision | Why |
|---|---|
| New `link` Postgres schema beside the legacy `public` tables | Lets the import be non-destructive and verifiable before anything old is dropped |
| Fixed category taxonomy | Users correct transactions and write rules; they never maintain category lists |
| Transaction *kind* separate from *category* | Transfers and card payments can never be double counted as spending |
| Deterministic engines; AI only for language | Numbers are reproducible and testable. The model interprets, explains and plans tool use |
| One agent, one tool registry, also served over MCP | One source of truth; no separate logic for chat |
| Mutations by the agent are proposals | Nothing consequential changes without the user's explicit approval |
| Server actions instead of the old Hono API | Fewer layers. Typed end to end, and auth sits at the call site |
