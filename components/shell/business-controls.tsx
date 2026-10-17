"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { createBusinessAction, deleteBusinessAction, setAccountBusinessAction, updateBusinessAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface BusinessSummary {
  id: string;
  name: string;
  structure: string;
  ownershipPct: number;
  countTowardGoals: boolean;
  taxSetAsidePct: number;
}

const STRUCTURE_LABEL: Record<string, string> = { sole_prop: "Sole proprietorship", llc: "LLC", s_corp: "S corp", partnership: "Partnership", other: "Other" };

/** Who an account belongs to: you personally, or one of your businesses. */
export function AccountOwner({ accountId, businessId, businesses, onChanged }: { accountId: string; businessId: string | null; businesses: BusinessSummary[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const assign = (value: string) => {
    if (value === "__new") return setAdding(true);
    start(async () => {
      const r = await setAccountBusinessAction(accountId, value === "personal" ? null : value);
      if (!r.ok) setError(r.error);
      onChanged();
    });
  };

  if (adding) {
    return (
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createBusinessAction(name, "llc", accountId);
            if (!r.ok) return setError(r.error);
            setAdding(false);
            setName("");
            onChanged();
          });
        }}
      >
        <label className="sr-only" htmlFor={`biz-${accountId}`}>
          Business name
        </label>
        <input
          id={`biz-${accountId}`}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Business name"
          className="h-7 w-36 rounded-full bg-surface px-3 text-[12px] outline-none focus:ring-2 focus:ring-[var(--focus)]"
        />
        <Button type="submit" size="sm" variant="primary" busy={pending} disabled={!name.trim()} className="h-7">
          Add
        </Button>
        <button type="button" onClick={() => setAdding(false)} className="text-[12px] text-muted">
          Cancel
        </button>
        {error && <span className="text-[12px] text-caution">{error}</span>}
      </form>
    );
  }

  return (
    <>
      <Select value={businessId ?? "personal"} disabled={pending} onValueChange={assign}>
        <SelectTrigger aria-label="Who this account belongs to" size="sm" className={cn("max-w-[11rem]", businessId ? "bg-accent-soft text-accent-ink hover:bg-accent-soft" : "bg-surface text-fg-2")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="personal">Personal</SelectItem>
          {businesses.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="__new">New business…</SelectItem>
        </SelectContent>
      </Select>
      {error && <span className="text-[12px] text-caution">{error}</span>}
    </>
  );
}

/** Per-business settings that change how it shows up in your personal plan. */
export function BusinessSettings({ business, onChanged }: { business: BusinessSummary; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = (patch: Parameters<typeof updateBusinessAction>[1]) =>
    start(async () => {
      const r = await updateBusinessAction(business.id, patch);
      if (!r.ok) setError(r.error);
      onChanged();
    });
  return (
    <div className={cn("rounded-md bg-surface-2 p-3.5", pending && "opacity-70")}>
      <div className="flex items-center justify-between gap-2">
        <input
          aria-label="Business name"
          defaultValue={business.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== business.name && save({ name: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none"
        />
        <button
          onClick={() => start(async () => { const r = await deleteBusinessAction(business.id); if (!r.ok) setError(r.error); onChanged(); })}
          aria-label={`Remove ${business.name}; its accounts become personal`}
          className="text-muted hover:text-caution"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
        <div className="flex flex-col gap-1">
          <span className="text-muted">Structure</span>
          <Select defaultValue={business.structure} onValueChange={(v) => save({ structure: v })}>
            <SelectTrigger aria-label="Structure" className="h-8 bg-surface px-2.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STRUCTURE_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-muted">You own</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={100}
              defaultValue={business.ownershipPct}
              onBlur={(e) => Number(e.target.value) !== business.ownershipPct && save({ ownershipPct: Number(e.target.value) })}
              className="h-8 w-16 rounded-full bg-surface px-2.5 text-right tabular outline-none"
            />
            %
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Tax set-aside</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={60}
              defaultValue={business.taxSetAsidePct}
              onBlur={(e) => Number(e.target.value) !== business.taxSetAsidePct && save({ taxSetAsidePct: Number(e.target.value) })}
              className="h-8 w-16 rounded-full bg-surface px-2.5 text-right tabular outline-none"
            />
            % of profit
          </span>
        </label>
        {business.structure === "sole_prop" ? (
          <p className="self-end pb-1.5 text-[12px] text-muted">A sole proprietorship&apos;s cash is yours, so it counts toward your goals.</p>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 self-end pb-1.5">
            <Checkbox defaultChecked={business.countTowardGoals} onCheckedChange={(c) => save({ countTowardGoals: c === true })} />
            <span className="text-fg-2">Count its cash toward my goals</span>
          </label>
        )}
      </div>
      {error && <p className="mt-2 text-[12px] text-caution">{error}</p>}
    </div>
  );
}
