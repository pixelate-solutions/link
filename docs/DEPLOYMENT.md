# Deployment

Link is one Next.js 16 app plus Postgres. Vercel with Neon is the reference setup; any Node 22+ host with Postgres 14+ works.

## Environment

See `.env.example`. The source of truth is Infisical: Pixelate Solutions org → project **Link** (`e68bf85b-33eb-4d06-9578-0f7ca42ca9ce`), with environments `dev` (local, Plaid sandbox) and `prod` (Vercel, Plaid production).

**Required in production:**
- `DATABASE_URL`
- `LINK_ENCRYPTION_KEY` (32 bytes, base64)
- `LINK_PUBLIC_URL`
- Clerk keys
- Plaid keys and `PLAID_ENV`
- `CRON_SECRET`

**Optional:**
- `OPENAI_API_KEY` and `LINK_AI_MODEL` (default `gpt-6-luna`)

`LINK_DEV_AUTH` must not be set in production; it is refused there regardless.

**Rotating `LINK_ENCRYPTION_KEY`** makes every stored Plaid token unreadable. Rotate by re-encrypting the tokens with a migration script. Never just swap the value.

## Steps

1. `npm ci && npm run typecheck && npm run lint && npm test`
2. `npm run db:migrate` against the target database. It only creates and alters the `link` schema.
3. Deploy. `vercel.json` schedules:
   - `/api/cron` every 15 minutes, which drains the job queue;
   - `/api/cron?review=1` daily, the scheduled review: re-sync stale connections and recompute every user.
4. Set the Plaid webhook to `${LINK_PUBLIC_URL}/api/webhooks/plaid`. New items get it from the link token automatically.

## Function durations

- `/api/ask`: 60s
- `/api/cron`: 300s
- Webhook and token-exchange handlers return quickly and use `after()` to run up to 3 jobs.

## Verification checklist after deploy

- [ ] Sign up through Clerk, then reach `/welcome`.
- [ ] Connect a Plaid sandbox institution (`user_good` / `pass_good`). The connection appears with status *active*, and Home shows "Reading your accounts" followed by "What Link learned".
- [ ] Fire a sandbox webhook (`/sandbox/item/fire_webhook`) and confirm a `plaid_sync` job runs.
- [ ] `/api/mcp` returns 401 without auth and lists tools with it.
- [ ] With `OPENAI_API_KEY` set, `npm run ai:eval` passes, and `link.agent_runs` shows `model = gpt-6-luna`.
