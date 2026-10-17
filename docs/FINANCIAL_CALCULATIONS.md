# Financial calculations

All engines live in `lib/finance/`. They are pure, deterministic, unit-tested, and work in **integer cents**.

## Conventions

- **Sign:** `+` means money into the user's account, `−` means money out. Plaid's opposite convention is flipped once, in `server/plaid/map.ts`.
- **Account balances** follow the provider: for credit and loan accounts, positive means owed. `netWorthValue()` negates them, so a card with a credit balance (negative) adds to net worth.
- **Kinds vs. categories.** A kind is one of `income`, `expense`, `refund`, `transfer`, `card_payment`, `investment_transfer`, `loan_payment` or `fee`.
  - **Spending** is `expense + refund + fee + loan_payment`. Refunds net against spending.
  - **Income** is `income` only.
  - Transfers, card payments and investment transfers are neither.
- **Splits** replace the parent line in every aggregate.
- **Other currencies:** transactions not in the user's currency are excluded from aggregates and counted in `coverage.otherCurrencyTxns`. No FX rates are invented.

## Classification (`classify.ts`)

Layers are tried in this order. The first match wins:
1. User rules (with `unless` exceptions).
2. Learned corrections for the merchant.
3. Structural detection: payroll, card payments (by account side), mortgage and loan payments, transfers, fees.
4. Merchant dictionary.
5. Plaid personal-finance category: v1 and v2 names, weighted by Plaid's confidence.
6. The user's own history with the merchant.

Anything else is marked uncertain. Uncertain items of **$50 or more** go to review; smaller ones don't interrupt the user. With a model configured, review items are batched to it, and suggestions under 0.8 confidence stay in review.

**Transfer pairing (`transfers.ts`)** matches equal-and-opposite amounts across the user's own accounts within 5 days.
- The receiving account decides the label: credit means `card_payment`, loan means `loan_payment` (a mortgage maps to housing), and investment means `investment_transfer`.
- At least one leg must already look like a movement, so a refund is never paired with an unrelated purchase.
- Unpaired transfers of $250 or more, older than 5 days, are sent to review.

## Recurring (`recurring.ts`)

Transactions are grouped by merchant, direction and account, then clustered by amount (±20% or $5).

**Cadence** comes from the median interval: weekly, biweekly, semimonthly, monthly, quarterly, semiannual or annual. At least 60% of intervals must be within tolerance.

**Thresholds:**
- Occurrences: at least 3 (2 for annual or semiannual).
- Amount variability: up to 60% for bill-like categories such as utilities and insurance. Shopping categories allow only 12%, so a weekly grocery run is a habit, not a bill.

**Status and confidence:**
- A series is *active* if the next expected date is within a grace period.
- Confidence combines regularity, count and amount stability.

## Baseline (`analysis.ts`)

- **Window:** up to 6 *complete* calendar months, meaning history covers the month's first day.
- **Per category:** regular categories use the **median** month. Irregular ones (travel, taxes, gifts, home) use the **mean**, so lumpy spending is spread evenly.
- **Total spending** is the sum of the category baselines, so the budget always adds up.
- **Partial history:** with less than a month (14 days or more), amounts are pro-rated and flagged `partial`.
- **Income:**
  - Detected recurring income, converted to a monthly equivalent. Extra steady income seen historically is added, capped at +15%.
  - Otherwise, the historical mean.
  - Variability is reported as the coefficient of variation.
- **Savings rate** = (income − spending) / income.
- **`cashRetained`** is the average net monthly change across bank (depository) accounts. It measures surplus that actually stays as cash.

## Safe to Spend (`cashflow.ts`)

```
Safe to Spend = spendable cash (checking-type, available balance or current − pending)
              + reliable paychecks inside the window (confidence ≥ 0.75)
              − bills and card payments due in the window
              − scheduled savings transfers (or committed savings, pro-rated)
              − buffer (max($100, 7 days of essential spending), or the user's own)
```

**The window** runs to the day before the first paycheck at least 7 days away. With no detected income, it is 30 days.

**Avoiding double counts:**
- A recurring bill that looks a few days late, but already has a pending charge from the same merchant, is not counted again.
- Pending charges are deducted only for accounts that report no available balance.
- Recurring transfers between the user's own spendable accounts net to zero and are ignored. They aren't counted as savings either; only transfers into savings or investment accounts are.

**Card obligations:**
- First due date: the statement balance if Plaid provides it, otherwise the full current balance (conservative).
- After that: typical monthly card charges.

**Status:**
- `unavailable`: no checking account.
- `stale`: balances older than 36 hours. The UI then shows "As of …".
- `estimate`: no income detected, a low-confidence bill, or an uncertain deposit was excluded.

The breakdown always sums exactly to the result (tested).

## Cash-flow forecast

Each day of the forecast: the previous balance, plus that day's scheduled events (recurring series on spendable accounts and card due dates), minus typical daily non-recurring spending.

**The band** is roughly an 80% range: ±1.28 × weekly spending standard deviation × √days. Income with confidence below 0.75 is excluded from the low edge.

**Outputs:** a shortfall flag (expected balance below $0) and the lowest point. Events are labeled *predicted* unless they come from provider data such as liabilities.

## Debt (`debt.ts`)

- Monthly amortization with interest rounded to the cent. A payment that doesn't cover interest returns "never".
- `paymentFor()` is the standard annuity formula.
- Avalanche and snowball strategies: pay minimums everywhere, put the remainder on the target debt, and roll freed-up payments forward.
- **Unknown APRs are excluded and reported, never guessed.** Only debts with a known rate are simulated, and only their minimums fund the plan. The debt goal shows "needs info" and names the excluded debts.
- Pay-in-full cards don't count as interest-bearing debt. A card counts only when its balance exceeds 1.6× typical monthly charges.

## Financial independence (`fi.ts`)

All values are in today's dollars, using *real* (after-inflation) returns.

**Required portfolio:**
```
G = annual retirement spending / (1 − effective tax rate 10%)
without Social Security:  G / withdrawal rate
with Social Security S (only if stated), starting in w years:
  (G − min(S, G)) / withdrawal rate  +  min(S, G) × (1 − (1 + r)^−w) / r
```
The second term funds the years before benefits begin, in full.

**Scenarios** (real return / withdrawal rate):

| Scenario | Real return | Withdrawal rate |
|---|---|---|
| Conservative | 3.0% | 3.25% |
| Base | 4.5% | 3.75% |
| Optimistic | 6.0% | 4.25% |

The withdrawal rates sit below the classic 4% because early retirement means longer horizons (Bengen 1994; Trinity study; Early Retirement Now SWR series).

**Two buckets.** Invested money compounds at the scenario return. Surplus that stays in the bank (`cashRetainedMonthly`) accumulates at 0% real. Both count toward independence. "Invest more" recommendations move money from cash to investments, so their benefit is the return difference, not new money.

**Life events** (a child, an income change, one-time costs) adjust monthly flows. They draw from cash first, then from investing.

**Monte Carlo:**
- 300–1,000 paths, seeded (mulberry32) so results are reproducible.
- Annual real log-returns are normal with μ = ln(1.045) and σ = 12%.
- The headline window is the p25–p75 of years-to-independence.
- Shares of paths that never reach independence within 60 years are reported.

**Sequence risk.** From the base-case retirement point, the share of 1,000 paths where money lasts to age 95 is computed (45 years if age is unknown) and shown on Plan. Ages in this simulation start at the *retirement* age, so Social Security begins at the right time.

**Sensitivity:**
- +$250 a month invested;
- ±10% retirement spending;
- −1% returns.

**Access note.** Shown when the projected retirement is before age 59.5 and more than half the portfolio is in retirement accounts.

**Limitations (stated in-product):**
- Taxes are a flat effective rate. There is no account-level tax modeling and no RMDs.
- Social Security is only included if the user states it.
- Healthcare is not modeled separately.
- Returns are i.i.d. with no regime changes.
- A home's value isn't counted as an asset, only what is owed on it.

## Goals (`goals.ts`, `plan.ts`)

**Corrections are learned per direction.** Money in from a merchant (a Venmo payment received) is learned separately from money out to it.

**Interpretation.** A sentence becomes one or more goals: `financial_independence`, `home_purchase`, `debt_freedom`, `emergency_fund`, `savings_target`, `purchase`, `family`, `travel`, `stability`, `wealth`, or `custom`. Amounts, dates and ages are parsed. Qualifiers ("as soon as possible", "without sacrificing my lifestyle") become preferences, not goals. Each kind declares the inputs it is missing and their impact. The highest-impact one is asked first.

**Current vs. planned.** Goal views always show the *current* trajectory, using observed investing and savings. The plan's suggested extra amount is a separate "with plan" projection.

**Free surplus** = net income − spending − investing seen leaving the bank − savings transfers. Workplace retirement contributions come out of pay before it arrives, so they aren't subtracted again.

**Allocation.** The free surplus is split as follows:
1. A margin of 10–40% is kept unassigned, depending on the lifestyle weight.
2. The emergency reserve up to 3 months of essentials, spread over about 6 months.
3. High-interest revolving debt (8% or more).
4. Time-bound goals get what they need, capped at half the remaining pool each.
5. The rest is split by priority weight (1/priority).

## Scenarios (`scenario.ts`)

Scenarios are pure: they copy the plan inputs, apply changes, and re-project every goal with the same engine. Supported changes: spending, investing, income, child, retirement spending, travel, and one-time costs. Each change emits plain-language assumptions.

Accepting a scenario writes only what can honestly be true:
- facts (a child's timing and cost, retirement spending, travel budget);
- budget lines;
- for investing or income changes, a memory of the user's *intent*. Never as if they had happened.

## Recommendations (`recommend.ts`)

**Candidates:**
- Cash shortfall within 30 days.
- Build an emergency reserve.
- Pay down high-interest debt, or add an unknown APR.
- Invest the surplus.
- Sustained discretionary spending drift: both recent months above the earlier level, at least +$100 and at least 25%. Excludes "other" and protected categories.
- New material recurring charges: $30 or more a month, first seen within 100 days.
- Time-bound goal gaps.
- Idle cash.

Goal impacts are computed with the scenario engine.

**Score:**
```
0.35·impact + 0.25·urgency + 0.20·goal alignment + 0.10·confidence + 0.10·(1 − effort)
  − lifestyle penalty (spending cuts only)
```
Impact is log-scaled on annual dollars.

**Lifecycle:**
- Unique fingerprint per user.
- Active recommendations refresh in place, and ones that disappear expire.
- A dismissed one returns only after 30 days *and* a 50% or larger change in impact.
- "Done" records the user's statement and never fabricates a transaction.

## Businesses (`business.ts`)

Any account can belong to one of the user's businesses (a sole proprietorship, LLC, S corp, partnership, or other). That choice changes how its money counts.

**Kept separate.** The personal picture uses personal accounts only: baseline, Safe to Spend, forecast, recurring, budget, recommendations and goals. Business revenue is never personal income, and business costs are never personal spending.

**What crosses over.** Transfer pairing looks at who owns each leg:
- Business → personal is an **owner draw**. On the business side it's kind `owner_draw` (not an expense); on the personal side it's `income` with category `owner_draw`, so what you take home is your income.
- Personal → business is an **owner contribution**. On the personal side it's an `investment_transfer` (not spending); on the business side it's `owner_contribution` (not revenue). Paying a business card from personal money is a contribution plus a card payment.
- Equal and opposite amounts between a business and a personal account pair within 5 days even if neither description says "transfer".

**Business categories.** On business accounts the classifier maps income to `revenue` (payment-processor payouts like Stripe count as revenue), and costs to `payroll`, `contractors`, `software`, `advertising`, `professional` and `supplies`. Other categories (travel, utilities, insurance, meals) keep their names. Rules and corrections always win.

**The business view** uses up to 6 complete months:
- Typical revenue, expenses and draws are means, because business income is lumpy. Profit = revenue − expenses; margin = profit / revenue.
- Runway: when cash is shrinking (expenses + draws > revenue + contributions), months of cash at that pace; otherwise, months of expenses the cash covers.
- Top costs by category, recurring costs, and this month so far.
- Estimated tax set-aside = profit × the business's set-aside rate (default 25%, editable). It's a rule of thumb, labeled as an estimate.

**In the personal plan:**
- Net worth includes each business's net worth × ownership share (`position.businessEquity`).
- Business cash counts toward personal goals only when that business's "count toward my goals" switch is on, and only the owner's share of positive cash.
- Personal surplus is never allocated to a "grow my business" goal; that goal tracks the business's own profit.

**Recommendations:** short runway (under 4 months while losing money), draws more than 15% above profit while cash is under 3 months of outflows, and a monthly tax set-aside when profit is $500/month or more.

Changing an account's owner re-labels its history: every transfer touching it is unpaired, both legs are reclassified, and the pipeline re-pairs them as draws, contributions or plain transfers.
