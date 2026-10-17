"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DevSignIn() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="w-full space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await fetch("/api/dev/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
        if (r.ok) {
          router.replace("/home");
          router.refresh();
        }
        else {
          setBusy(false);
          setError((await r.json()).error ?? "Couldn't sign in");
        }
      }}
    >
      <label htmlFor="dev-name" className="text-[13px] font-medium text-muted">
        Your first name
      </label>
      <input
        id="dev-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-12 w-full rounded-full bg-surface-2 px-5 text-[15px] outline-none focus:ring-2 focus:ring-[var(--focus)]"
      />
      <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy} disabled={!name.trim()}>
        Continue
      </Button>
      {error && <p className="text-[13px] text-caution">{error}</p>}
      <p className="pt-2 text-center text-[12px] text-muted">Local development sign-in. Production uses Clerk.</p>
    </form>
  );
}
