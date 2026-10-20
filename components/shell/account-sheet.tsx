"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Check, Copy, Download, Laptop, Moon, Sun, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import {
  accountOverviewAction,
  addRuleAction,
  createApiTokenAction,
  deleteAccountAction,
  deleteFactAction,
  deleteMemoryAction,
  deleteRuleAction,
  disconnectAction,
  loadDemoAction,
  revokeApiTokenAction,
  setPreferencesAction,
  syncNowAction,
} from "@/app/actions";
import { ConnectBank } from "@/components/connect/connect-bank";
import { AccountOwner, BusinessSettings } from "./business-controls";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { LifestyleSlider } from "@/components/plan/lifestyle-slider";
import { categoryLabel } from "@/lib/finance/categories";
import { FACT_QUESTIONS, type FactKey } from "@/lib/finance/goals";
import { formatMoney } from "@/lib/finance/money";
import { cn, relativeTime } from "@/lib/utils";

type Overview = Extract<Awaited<ReturnType<typeof accountOverviewAction>>, { ok: true }>["data"];

const FACT_LABELS: Record<string, string> = {
  birth_year: "Birth year",
  retirement_spending_annual: "Retirement spending / yr",
  outside_investments: "Investments not connected",
  workplace_contribution_monthly: "Workplace retirement / mo",
  social_security_annual: "Social Security / yr",
  home_price: "Home price",
  travel_budget_annual: "Travel budget / yr",
  children_planned: "Child expected in (years)",
  child_cost_monthly: "Child costs / mo",
  expected_income_change: "Expected income change",
  emergency_months: "Emergency reserve (months)",
};
const MONEY = new Set(["retirement_spending_annual", "outside_investments", "workplace_contribution_monthly", "social_security_annual", "home_price", "travel_budget_annual", "child_cost_monthly"]);

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-t border-line py-5 first:border-t-0 first:pt-2">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AccountSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [rule, setRule] = useState("");
  const [confirm, setConfirm] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [created, setCreated] = useState<{ id: string; name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const load = () =>
    start(async () => {
      const r = await accountOverviewAction();
      if (r.ok) setData(r.data);
      else setError(r.error);
    });
  useEffect(() => {
    if (open) load();
  }, [open]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError((r as { error: string }).error);
      const o = await accountOverviewAction();
      if (o.ok) setData(o.data);
      router.refresh();
    });

  const signOutDev = async () => {
    await fetch("/api/dev/session", { method: "DELETE" });
    router.replace("/");
    router.refresh();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        // A new token is shown once: closing the sheet forgets it.
        if (!o) setCreated(null);
        onOpenChange(o);
      }}
      title="Account"
    >
      {!data ? (
        <div className="space-y-3 py-4" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-sm bg-surface-2" />
          ))}
        </div>
      ) : (
        <div className={cn("transition-opacity", pending && "opacity-70")}>
          <Section title="You">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-medium">{data.user.name ?? "Signed in"}</p>
                {data.user.email && <p className="text-[13px] text-muted">{data.user.email}</p>}
                {data.authMode === "dev" && <p className="text-[12px] text-caution">Local development sign-in</p>}
              </div>
              {data.authMode === "clerk" ? (
                <SignOutButton>
                  <Button size="sm">Sign out</Button>
                </SignOutButton>
              ) : (
                <Button size="sm" onClick={signOutDev}>
                  Sign out
                </Button>
              )}
            </div>
          </Section>

          <Section
            title="Connected accounts"
            action={
              data.connections.some((c) => c.provider === "plaid") ? (
                <button onClick={() => act(syncNowAction)} className="text-[13px] font-medium text-accent-ink">
                  Refresh
                </button>
              ) : undefined
            }
          >
            <ul className="space-y-2">
              {data.connections.map((c) => {
                const accts = data.accounts.filter((a) => a.connectionId === c.id);
                const demo = c.provider === "demo";
                return (
                  <li key={c.id} className="rounded-md bg-surface-2 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <InstitutionMark name={c.institutionName ?? "Bank"} logo={c.institutionLogo} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium">{c.institutionName ?? "Bank"}</p>
                        <p className={cn("text-[12px]", c.status === "active" ? "text-muted" : "text-caution")}>
                          {demo
                            ? "Synthetic demo data, not a real bank"
                            : c.status === "active"
                              ? `Synced ${relativeTime(c.lastSyncedAt)}`
                              : c.status === "login_required"
                                ? "Needs you to sign in again"
                                : c.status === "disconnected"
                                  ? "Disconnected; history kept"
                                  : "Sync problem; Link will retry"}
                        </p>
                      </div>
                      {c.status !== "disconnected" && (
                        <button onClick={() => act(() => disconnectAction(c.id, false))} className="text-[12px] text-muted hover:text-fg">
                          Disconnect
                        </button>
                      )}
                    </div>
                    {accts.length > 0 && (
                      <ul className="mt-2.5 space-y-1">
                        {accts.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
                            <span className="min-w-0 flex-1 truncate text-fg-2">
                              {a.name} {a.mask && <span className="text-muted">··{a.mask}</span>}
                            </span>
                            <span className="tabular text-fg-2">
                              {a.currentMinor == null || (c.needsInvestmentsConsent && a.type === "investment" && !a.currentMinor)
                                ? "—"
                                : formatMoney(a.currentMinor !== 0 && (a.type === "credit" || a.type === "loan") ? -Math.abs(a.currentMinor) : a.currentMinor)}
                            </span>
                            <span className="flex basis-full justify-end">
                              <AccountOwner accountId={a.id} businessId={a.businessId} businesses={data.businesses} onChanged={() => act(async () => ({ ok: true }))} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.status === "login_required" && <ConnectBank connectionId={c.id} label="Reconnect" size="sm" className="mt-3" onOpening={() => onOpenChange(false)} />}
                    {c.status === "active" && c.needsInvestmentsConsent && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-[12px] text-caution">Balance not shared yet</span>
                        <ConnectBank connectionId={c.id} investments label="Fix balance" size="sm" variant="primary" onOpening={() => onOpenChange(false)} />
                      </div>
                    )}
                    {c.status === "disconnected" && (
                      <button onClick={() => act(() => disconnectAction(c.id, true))} className="mt-2 text-[12px] text-caution">
                        Delete this history
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {data.plaidConfigured ? (
                <ConnectBank size="sm" label="Add an account" onOpening={() => onOpenChange(false)} />
              ) : (
                <p className="text-[13px] text-muted">Bank connections aren&apos;t configured on this server.</p>
              )}
              {data.demoAvailable && !data.connections.some((c) => c.provider === "demo") && (
                <Button size="sm" variant="ghost" onClick={() => act(loadDemoAction)}>
                  Load demo data
                </Button>
              )}
            </div>
          </Section>

          {data.businesses.length > 0 && (
            <Section title="Your businesses">
              <div className="space-y-2">
                {data.businesses.map((b) => (
                  <BusinessSettings key={b.id} business={b} onChanged={() => act(async () => ({ ok: true }))} />
                ))}
              </div>
            </Section>
          )}

          <Section title="How Link balances your plan">
            <LifestyleSlider value={data.prefs.lifestyleWeight} onCommit={(v) => act(() => setPreferencesAction({ lifestyleWeight: v }))} />
            {data.prefs.protectedCategories.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[13px] text-muted">Never suggest cutting</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.prefs.protectedCategories.map((c) => (
                    <button
                      key={c}
                      onClick={() => act(() => setPreferencesAction({ protectedCategories: data.prefs.protectedCategories.filter((x) => x !== c) }))}
                      className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-[13px]"
                      aria-label={`Stop protecting ${categoryLabel(c)}`}
                    >
                      {categoryLabel(c)} <span className="text-muted">×</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title="What Link knows about you">
            {data.facts.length === 0 && data.memories.length === 0 ? (
              <p className="text-[13px] text-muted">Nothing yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.facts.map((f) => (
                  <li key={f.key} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="text-fg-2">{FACT_LABELS[f.key] ?? FACT_QUESTIONS[f.key as FactKey] ?? f.key}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{f.value.skipped ? <span className="text-muted">Skipped</span> : MONEY.has(f.key) ? formatMoney(f.value.value ?? 0) : f.value.value}</span>
                      <button onClick={() => act(() => deleteFactAction(f.key))} aria-label={`Forget ${FACT_LABELS[f.key] ?? f.key}`} className="text-muted hover:text-caution">
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </li>
                ))}
                {data.memories.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="text-fg-2">{m.content}</span>
                    <button onClick={() => act(() => deleteMemoryAction(m.id))} aria-label="Forget this" className="text-muted hover:text-caution">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Categorization rules">
            {data.rules.length > 0 && (
              <ul className="mb-3 space-y-1.5">
                {data.rules.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="text-fg-2">{r.description}</span>
                    <button onClick={() => act(() => deleteRuleAction(r.id))} aria-label="Delete rule" className="text-muted hover:text-caution">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (rule.trim()) act(async () => {
                  const r = await addRuleAction(rule);
                  if (r.ok) setRule("");
                  return r;
                });
              }}
              className="flex gap-2"
            >
              <label htmlFor="rule" className="sr-only">
                New rule
              </label>
              <input
                id="rule"
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                placeholder="Costco is groceries unless it's gas"
                className="h-10 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-[14px] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--focus)]"
              />
              <Button type="submit" size="md" disabled={!rule.trim()}>
                Add
              </Button>
            </form>
          </Section>

          <Section title="Appearance">
            <div className="flex gap-1 rounded-full bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
              {([
                ["light", Sun, "Light"],
                ["dark", Moon, "Dark"],
                ["system", Laptop, "System"],
              ] as const).map(([v, Icon, label]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={theme === v}
                  onClick={() => setTheme(v)}
                  className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px]", theme === v ? "bg-surface text-fg shadow-soft" : "text-muted")}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="API access">
            <p className="mb-3 text-[13px] text-muted">
              Let scripts and AI agents read your Link data with a token. Tokens can read everything but change nothing.{" "}
              <a href="/api/v1" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-fg">
                Endpoints
              </a>
            </p>
            {created && (
              <div className="mb-3 rounded-md border border-line p-3">
                <p className="text-[13px] font-medium">Copy {created.name} now. It won&apos;t be shown again.</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-sm bg-surface-2 px-3 py-2 font-mono text-[12px]">{created.token}</code>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(created.token);
                      setCopied(true);
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}
            {data.apiTokens.length > 0 && (
              <ul className="mb-3 space-y-1.5">
                {data.apiTokens.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="min-w-0 truncate text-fg-2">
                      {t.name} <span className="font-mono text-[12px] text-muted">{t.prefix}…</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-[12px] text-muted">{t.lastUsedAt ? `Used ${relativeTime(t.lastUsedAt)}` : "Never used"}</span>
                      <button
                        onClick={() =>
                          act(async () => {
                            const r = await revokeApiTokenAction(t.id);
                            if (r.ok && created?.id === t.id) setCreated(null);
                            return r;
                          })
                        }
                        aria-label={`Revoke ${t.name}`}
                        className="text-muted hover:text-caution"
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  const r = await createApiTokenAction(tokenName);
                  if (r.ok) {
                    setCreated(r.data);
                    setCopied(false);
                    setTokenName("");
                  }
                  return r;
                });
              }}
              className="flex gap-2"
            >
              <label htmlFor="token-name" className="sr-only">
                Token name
              </label>
              <input
                id="token-name"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                maxLength={60}
                placeholder="Name it, e.g. Claude"
                className="h-10 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-[14px] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--focus)]"
              />
              <Button type="submit" size="md" disabled={pending}>
                Create token
              </Button>
            </form>
          </Section>

          <Section title="Your data">
            <a href="/api/export" className="inline-flex h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium hover:bg-surface-3">
              <Download size={15} /> Export everything
            </a>
            <div className="mt-5 rounded-md border border-line p-3.5">
              <p className="text-[14px] font-medium">Delete account</p>
              <p className="mt-1 text-[13px] text-muted">Revokes bank access and permanently deletes your data, goals, and conversations.</p>
              <div className="mt-3 flex gap-2">
                <label htmlFor="confirm-delete" className="sr-only">
                  Type DELETE to confirm
                </label>
                <input
                  id="confirm-delete"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Type DELETE"
                  className="h-9 min-w-0 flex-1 rounded-full bg-surface-2 px-3.5 text-[13px] outline-none focus:ring-2 focus:ring-[var(--focus)]"
                />
                <Button
                  size="sm"
                  variant="danger"
                  disabled={confirm !== "DELETE"}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteAccountAction(confirm);
                      if (r.ok) {
                        router.replace("/");
                        router.refresh();
                      }
                      else setError(r.error);
                    })
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
          </Section>
          {error && (
            <p role="alert" className="text-[13px] text-caution">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** The bank's logo, or its initial when Plaid has none. */
function InstitutionMark({ name, logo }: { name: string; logo?: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface text-[13px] font-semibold text-fg-2" aria-hidden>
      {logo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-full w-full bg-white object-contain p-1" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}
