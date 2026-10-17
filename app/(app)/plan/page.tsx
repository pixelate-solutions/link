import type { Metadata } from "next";
import { BusinessDetailCard } from "@/components/business/business-card";
import { Card } from "@/components/home/card";
import { GoalCard } from "@/components/home/goal-card";
import { CashFlow } from "@/components/plan/cash-flow";
import { GoalsList } from "@/components/plan/goals-list";
import { Priorities } from "@/components/plan/priorities";
import { Projection } from "@/components/plan/projection";
import { SpendingPlan } from "@/components/plan/spending-plan";
import { type ScenarioView, WhatIf } from "@/components/plan/what-if";
import { Disclosure } from "@/components/ui/disclosure";
import { formatMoney } from "@/lib/finance/money";
import { requireUser } from "@/server/auth";
import { computeContext } from "@/server/services/picture";
import { latestScenario } from "@/server/services/views";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const userId = await requireUser();
  const { scenario } = await searchParams;
  const [{ picture: p, inputs, data }, saved] = await Promise.all([computeContext(userId), latestScenario(userId, scenario ?? null)]);
  const primary = p.goals[0];
  const initialScenario: ScenarioView | null = saved
    ? {
        id: saved.id,
        title: saved.title,
        status: saved.status,
        assumptions: (saved.result.assumptions as string[]) ?? [],
        deltas: (saved.result.deltas as ScenarioView["deltas"]) ?? [],
        surplus: saved.result.monthlySurplusBefore != null ? { before: saved.result.monthlySurplusBefore as number, after: saved.result.monthlySurplusAfter as number } : undefined,
      }
    : null;
  const assets = p.position.cash + p.position.reserves + p.position.invested + (p.position.outsideInvestments ?? 0);
  const debts = p.position.cardDebt + p.position.loanDebt;

  return (
    <div className="space-y-3 md:space-y-4">
      <h1 className="sr-only">Plan</h1>
      {primary ? (
        primary.kind === "financial_independence" && primary.fi ? (
          <Card className="md:p-8">
            <Projection goal={primary} inputs={inputs} />
          </Card>
        ) : (
          <GoalCard goal={primary} />
        )
      ) : null}

      {primary && (
        <Card>
          <Disclosure title="Why this estimate" meta={primary.missing.length ? `${primary.missing.length} open question${primary.missing.length === 1 ? "" : "s"}` : undefined}>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-[13px] font-medium text-muted">Assumptions</p>
                <ul className="mt-2 space-y-1.5 text-[14px] text-fg-2">
                  {primary.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              {primary.fi && primary.fi.sensitivity.length > 0 && (
                <div>
                  <p className="text-[13px] font-medium text-muted">What moves it most</p>
                  <ul className="mt-2 space-y-1.5 text-[14px]">
                    {[...primary.fi.sensitivity]
                      .sort((a, b) => Math.abs(b.deltaYears ?? 0) - Math.abs(a.deltaYears ?? 0))
                      .map((s) => (
                        <li key={s.label} className="flex justify-between gap-3">
                          <span className="text-fg-2">{s.label}</span>
                          <span className="tabular">{s.deltaYears == null ? "—" : `${s.deltaYears > 0 ? "+" : ""}${s.deltaYears} yrs`}</span>
                        </li>
                      ))}
                  </ul>
                  {primary.fi.accessNote && <p className="mt-3 text-[13px] text-muted">{primary.fi.accessNote}</p>}
                </div>
              )}
            </div>
            {primary.missing.length > 0 && (
              <div className="mt-6">
                <p className="text-[13px] font-medium text-muted">Would sharpen this</p>
                <ul className="mt-2 space-y-1.5 text-[14px] text-fg-2">
                  {primary.missing.map((m) => (
                    <li key={m.key}>
                      {m.question} <span className="text-muted">{m.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-6 text-[12px] text-muted">
              Projections use real (after-inflation) returns, a {p.baseline.monthsAnalyzed}-month spending history, and 300+ simulated markets. They are estimates, not guarantees.
            </p>
          </Disclosure>
        </Card>
      )}

      <Card id="what-if">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">What if…</h2>
        <p className="mb-4 mt-1 text-[14px] text-muted">Try a change. Nothing is saved unless you choose to.</p>
        <WhatIf initial={initialScenario} />
      </Card>

      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        <Card id="goals">
          <h2 className="mb-4 text-[17px] font-semibold tracking-[-0.01em]">Goals, in order</h2>
          <GoalsList goals={p.goals} />
        </Card>
        <Card>
          <h2 className="mb-4 text-[17px] font-semibold tracking-[-0.01em]">What matters more</h2>
          <Priorities weight={data.prefs.lifestyleWeight} />
          {p.allocations.length > 0 && (
            <div className="mt-6">
              <p className="text-[13px] font-medium text-muted">Your surplus, as planned</p>
              <ul className="mt-2 space-y-1.5 text-[14px]">
                {p.allocations.map((a) => (
                  <li key={a.target} className="flex justify-between gap-3">
                    <span className="text-fg-2">{a.label}</span>
                    <span className="tabular">{formatMoney(a.monthly)}/mo</span>
                  </li>
                ))}
                <li className="flex justify-between gap-3 text-muted">
                  <span>Left flexible</span>
                  <span className="tabular">{formatMoney(Math.max(0, p.flows.surplusUnassigned))}/mo</span>
                </li>
              </ul>
            </div>
          )}
        </Card>
      </div>

      {p.businesses.map((b) => (
        <BusinessDetailCard key={b.id} b={b} />
      ))}

      <Card>
        <Disclosure title="Spending plan" meta={<span className="tabular">{formatMoney(p.budget.spentThisMonth)} of {formatMoney(p.budget.plannedThisMonth)}</span>}>
          <SpendingPlan budget={p.budget} />
        </Disclosure>
      </Card>

      <Card>
        <Disclosure title="Cash over the next 90 days">
          <CashFlow forecast={p.forecast} />
        </Disclosure>
      </Card>

      <Card>
        <Disclosure title="Where you stand" meta={<span className="tabular">{formatMoney(p.position.netWorth, { compact: Math.abs(p.position.netWorth) >= 1_000_000_00 })}</span>}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] md:grid-cols-4">
            {[
              ["Checking", p.position.cash],
              ["Savings", p.position.reserves],
              ["Investments", p.position.invested + (p.position.outsideInvestments ?? 0)],
              ["Debts", -debts],
              ...(p.position.businessEquity ? [["Your businesses", p.position.businessEquity] as const] : []),
            ].map(([label, v]) => (
              <div key={label as string}>
                <dt className="text-muted">{label}</dt>
                <dd className="mt-0.5 text-[17px] font-medium tabular">{formatMoney(v as number)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13px] text-muted">
            {formatMoney(assets)} in assets, {formatMoney(debts)} owed.
            {p.position.loanDebt > 0 && " What your home or car is worth isn't included, only what you owe on them."}
            {!p.position.investmentsKnown && " Investments you haven't connected aren't included; tell Link about them to sharpen your plan."}
          </p>
        </Disclosure>
      </Card>
    </div>
  );
}
