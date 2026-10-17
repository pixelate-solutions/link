# MCP tools

Link serves its tool registry over the Model Context Protocol, using MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, Streamable HTTP).

- **Endpoint:** `POST/GET/DELETE /api/mcp`.
- **Auth:** a Clerk session, an OAuth token or an API key (`auth({ acceptsToken: [...] })`). Locally, the dev session. The route resolves the user and builds a server bound to that user for the request (`buildMcpServer(userId)`). Unauthenticated requests get `401` with `WWW-Authenticate: Bearer`.
- **Annotations:** read tools carry `readOnlyHint: true`. Propose and record tools don't.
- **Approval:** propose-tools only create approval requests, which the user approves inside Link. An MCP client cannot change goals, preferences, budgets or rules on its own.
- **Money units:** dollars with 2 decimals at this boundary. Internally, Link uses cents.

| Tool | Effect | Purpose |
|---|---|---|
| `get_financial_overview` | read | Position, typical month, Safe to Spend with breakdown, freshness, coverage, open questions |
| `get_goals` | read | Goals with projections (scenarios, simulated window, sensitivity), allocations, preferences |
| `get_recommendations` | read | Ranked recommendations with evidence, impact, assumptions, tradeoffs |
| `get_cash_forecast` | read | `days` 1–120: lowest point, shortfall, predicted events |
| `get_spending` | read | Baseline by category, monthly history, this month, budget |
| `search_transactions` | read | Filters: text, category, dates, minimum amount, review flag (bank text sanitized) |
| `explain_transaction` | read | Classification source, confidence, reason, correction history |
| `get_businesses` | read | The user's businesses: revenue, expenses, profit, margin, draws, cash, runway, top and recurring costs, tax set-aside estimate |
| `get_recurring` | read | Detected income, bills, subscriptions, transfers |
| `run_scenario` | read* | What-if changes, returning before/after per goal and assumptions. *Saves a draft scenario row; never changes the plan |
| `check_affordability` | read | Purchase against Safe to Spend, forecast, and goals (if monthly) |
| `debt_payoff` | read | Avalanche vs. snowball; unknown rates excluded |
| `get_memories` | read | Stated memories and planning facts |
| `save_fact` | record | A planning fact the user explicitly stated; requires the user's words |
| `remember` | record | A durable preference or constraint the user stated |
| `propose_preferences` | propose | Lifestyle weight, protected categories, travel budget |
| `propose_goal` | propose | Create, update or archive a goal |
| `propose_budget_change` | propose | One category's monthly amount |
| `propose_rule` | propose | Natural-language categorization rule |

Every call is logged in `link.tool_calls` with the channel (`agent` or `mcp`), arguments, ok/error and duration.

Tested in `tests/mcp.test.ts` with the in-memory transport. The tests cover listing, annotations, and per-user binding.
