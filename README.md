# Link

Tell Link what you want out of life. Link figures out how your money gets you there.

Link connects to your bank accounts, sorts every transaction automatically, and turns a goal stated in plain words ("retire as soon as possible without giving up my lifestyle") into a projected plan. It shows one clear number, one next step, and evidence-backed answers.

- **Home**: Safe to Spend, your goal's projected window, and the single most valuable next step.
- **Activity**: the ledger, with automatic categories, transfer matching, recurring detection, and one-tap corrections that Link learns from.
- **Plan**: an interactive projection, what-if scenarios, goals in priority order, the lifestyle-vs-speed dial, an optional spending plan, and a 90-day cash forecast.
- **Ask Link** (⌘K, or the tab bar on mobile): answers questions using the same tools and numbers as the rest of the app.

## Quick start (local)

```bash
# Secrets live in Infisical (Pixelate Solutions → project "Link", envs dev/prod):
infisical export --projectId=e68bf85b-33eb-4d06-9578-0f7ca42ca9ce --env=dev --format=dotenv > .env.local
npm install
npm run db:migrate
npm run dev                     # http://localhost:3000
```

- Without Clerk keys, `LINK_DEV_AUTH=1` enables a name-only sign-in. It is refused when `NODE_ENV=production`.
- Without Plaid keys, onboarding offers **demo data**: a synthetic household loaded through the real sync pipeline and labeled as demo throughout the UI.
- Without `OPENAI_API_KEY`, Ask Link answers common questions with a deterministic planner that uses the same tools.

## Commands

| | |
|---|---|
| `npm test` | Unit, integration, acceptance, security, MCP, agent and AI-eval suites (in-process Postgres via PGlite) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Static checks and production build |
| `npm run ai:eval` | Evaluation suite against the configured model (or the deterministic planner) |
| `npm run ui:screens` | Playwright visual pass: every screen, phone/tablet/desktop, light/dark (needs a running dev server) |
| `npm run db:generate` / `npm run db:migrate` | Drizzle migrations for the `link` schema |
| `npm run jobs:work` | Drain the background job queue locally |

## Documentation

- [Rebuild audit](docs/REBUILD_AUDIT.md): what was wrong with the old app, and why it was replaced
- [Architecture](docs/ARCHITECTURE.md)
- [Financial calculations](docs/FINANCIAL_CALCULATIONS.md)
- [AI harness](docs/AI_HARNESS.md) and [MCP tools](docs/MCP_TOOLS.md)
- [Database](docs/DATABASE_MIGRATION.md)
- [Security](docs/SECURITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md): what is done, verified, and blocked

Projections are estimates under stated assumptions, not guarantees, and not investment advice.
