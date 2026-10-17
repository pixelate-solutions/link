"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { loadDemoAction, proposalAction, pumpJobsAction } from "@/app/actions";
import { ConnectBank } from "@/components/connect/connect-bank";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "./card";

export function EmptyHome({ plaid, demo }: { plaid: boolean; demo: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card className="py-10 text-center md:py-14">
      <p className="text-[22px] font-semibold tracking-[-0.02em]">Connect your accounts</p>
      <p className="mx-auto mt-2 max-w-sm text-[15px] text-fg-2">Link reads balances and transactions to build your plan. It can never move money.</p>
      <div className="mt-6 flex flex-col items-center gap-3">
        {plaid ? <ConnectBank variant="primary" size="lg" /> : <p className="text-[13px] text-muted">Bank connections aren&apos;t configured on this server.</p>}
        {demo && (
          <Button variant="ghost" busy={pending} onClick={() => start(async () => { await loadDemoAction(); router.refresh(); })}>
            Explore with demo data
          </Button>
        )}
      </div>
    </Card>
  );
}

export function Syncing() {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    // Keep this user's sync moving while they watch, then refresh to pick up results.
    const tick = async () => {
      await pumpJobsAction();
      if (!alive) return;
      router.refresh();
      setTimeout(tick, 5000);
    };
    const t = setTimeout(tick, 1500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [router]);
  return (
    <Card className="py-10 text-center" aria-live="polite">
      <div className="mx-auto h-1 w-40 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full w-1/3 animate-[slide_1.4s_ease-in-out_infinite] rounded-full bg-accent" />
      </div>
      <p className="mt-5 text-[17px] font-medium">Reading your accounts</p>
      <p className="mt-1 text-[14px] text-muted">Sorting transactions, finding income and bills. This usually takes under a minute.</p>
      <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </Card>
  );
}

export function PendingApprovals({ items }: { items: { id: string; summary: string }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!items.length) return null;
  return (
    <Card>
      <Eyebrow>Waiting for your OK</Eyebrow>
      <ul className="mt-3 space-y-3">
        {items.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3">
            <span className="text-[15px]">{p.summary}</span>
            <span className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => { await proposalAction(p.id, true); router.refresh(); })}>
                Approve
              </Button>
              <Button size="sm" variant="quiet" disabled={pending} onClick={() => start(async () => { await proposalAction(p.id, false); router.refresh(); })}>
                Decline
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
