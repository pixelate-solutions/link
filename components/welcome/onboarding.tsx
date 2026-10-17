"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGoalsAction, finishOnboardingAction, loadDemoAction } from "@/app/actions";
import { ConnectBank } from "@/components/connect/connect-bank";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";

const EXAMPLES = ["Retire early", "Buy a house", "Stop worrying about money", "Pay off debt", "Travel more without guilt", "Enjoy life while saving responsibly"];

type Interpreted = { title: string; kind: string; summary: string }[];

export function Onboarding({ name, hasGoal, hasConnection, plaid, demo }: { name: string | null; hasGoal: boolean; hasConnection: boolean; plaid: boolean; demo: boolean }) {
  const [step, setStep] = useState<"goal" | "heard" | "connect">(hasGoal ? "connect" : "goal");
  const [text, setText] = useState("");
  const [heard, setHeard] = useState<Interpreted>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const finish = () =>
    start(async () => {
      await finishOnboardingAction();
      router.push("/home");
    });

  const submitGoal = () =>
    start(async () => {
      setError(null);
      const r = await createGoalsAction(text);
      if (!r.ok) return setError(r.error);
      setHeard(r.data);
      setStep("heard");
    });

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-8">
      <Logo />
      <div className="flex flex-1 flex-col justify-center py-12">
        <AnimatePresence mode="wait">
          {step === "goal" && (
            <motion.div key="goal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] md:text-[40px]">
                {name ? `${name}, what` : "What"} do you want your money to help you achieve?
              </h1>
              <form
                className="mt-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) submitGoal();
                }}
              >
                <label htmlFor="goal" className="sr-only">
                  Your goal, in your own words
                </label>
                <textarea
                  id="goal"
                  autoFocus
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (text.trim()) submitGoal();
                    }
                  }}
                  placeholder="I want to retire as soon as possible without giving up the things I enjoy."
                  className="w-full resize-none rounded-md bg-surface p-4 text-[17px] leading-relaxed outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--focus)]"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {EXAMPLES.map((ex) => (
                    <button type="button" key={ex} onClick={() => setText(ex)} className="rounded-full bg-surface-2 px-3 py-1.5 text-[13px] text-fg-2 hover:bg-surface-3">
                      {ex}
                    </button>
                  ))}
                </div>
                <div className="mt-8 flex items-center gap-3">
                  <Button type="submit" variant="primary" size="lg" busy={pending} disabled={!text.trim()}>
                    Continue
                  </Button>
                  <span className="text-[13px] text-muted">No targets or dates needed.</span>
                </div>
                {error && <p className="mt-3 text-[13px] text-caution">{error}</p>}
              </form>
            </motion.div>
          )}

          {step === "heard" && (
            <motion.div key="heard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <p className="text-[13px] font-medium text-muted">Here&apos;s what Link heard</p>
              <ul className="mt-4 space-y-3">
                {heard.map((g, i) => (
                  <motion.li key={g.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }} className="rounded-md bg-surface p-4">
                    <p className="text-[19px] font-semibold tracking-[-0.02em]">{g.title}</p>
                    <p className="mt-1 text-[14px] text-fg-2">{g.summary}</p>
                  </motion.li>
                ))}
              </ul>
              <p className="mt-4 text-[14px] text-muted">You can change this anytime in Plan.</p>
              <Button className="mt-8" variant="primary" size="lg" onClick={() => setStep("connect")}>
                Next
              </Button>
            </motion.div>
          )}

          {step === "connect" && (
            <motion.div key="connect" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] md:text-[40px]">Connect your accounts</h1>
              <p className="mt-3 text-[17px] text-fg-2">Link reads balances and transactions to build your plan. It can never move money.</p>
              <div className="mt-8 flex flex-col items-start gap-3">
                {hasConnection ? (
                  <Button variant="primary" size="lg" onClick={finish} busy={pending}>
                    See my plan
                  </Button>
                ) : plaid ? (
                  <ConnectBank variant="primary" size="lg" onConnected={finish} />
                ) : (
                  <p className="text-[14px] text-muted">Bank connections aren&apos;t configured on this server.</p>
                )}
                {demo && !hasConnection && (
                  <Button
                    variant="ghost"
                    busy={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await loadDemoAction();
                        if (!r.ok) return setError(r.error);
                        await finishOnboardingAction();
                        router.push("/home");
                      })
                    }
                  >
                    Use demo data instead
                  </Button>
                )}
                <button onClick={finish} className="text-[13px] text-muted hover:text-fg">
                  Skip for now
                </button>
                {error && <p className="text-[13px] text-caution">{error}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
