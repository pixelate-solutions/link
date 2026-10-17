"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Opens Plaid Link with a server-issued token. The public token goes straight
 * back to the server; access tokens never touch the browser.
 */
export function ConnectBank({ connectionId, label = "Connect an account", onConnected, ...props }: { connectionId?: string; label?: string; onConnected?: () => void } & Omit<ButtonProps, "onClick">) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: { institution?: { institution_id?: string; name?: string } | null }) => {
      if (connectionId) {
        // Update mode: the item is repaired, nothing to exchange.
        setBusy(false);
        router.refresh();
        onConnected?.();
        return;
      }
      if (!publicToken) return setBusy(false);
      const r = await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken, institution: { id: metadata.institution?.institution_id ?? null, name: metadata.institution?.name ?? null } }),
      });
      setBusy(false);
      if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? "Couldn't finish connecting.");
      router.refresh();
      onConnected?.();
    },
    [connectionId, onConnected, router],
  );

  const { open, ready } = usePlaidLink({ token, onSuccess: onSuccess as never, onExit: () => setBusy(false) });
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  const start = async () => {
    setError(null);
    setBusy(true);
    const r = await fetch("/api/plaid/link-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(connectionId ? { connectionId } : {}) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setBusy(false);
      return setError(d.error ?? "Couldn't start the connection.");
    }
    setToken(d.linkToken);
  };

  return (
    <div>
      <Button onClick={start} busy={busy} {...props}>
        {label}
      </Button>
      {error && <p className="mt-2 text-[13px] text-caution" role="alert">{error}</p>}
    </div>
  );
}
