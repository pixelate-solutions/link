"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { syncNowAction } from "@/app/actions";

type Request = { connectionId?: string; investments?: boolean; onConnected?: () => void };
type Status = { tone: "busy" | "ok" | "error"; text: string } | null;

const Ctx = createContext<{ connect: (r: Request) => Promise<boolean>; starting: boolean } | null>(null);

/**
 * Plaid Link lives here, at the root, never inside a sheet or dialog. A modal
 * sheet treats clicks in Plaid's iframe as "outside" and closes, which used to
 * unmount Link with it. Callers close their own sheet before Link opens.
 */
export function PlaidProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const request = useRef<Request>({});
  const router = useRouter();

  const connect = useCallback(async (r: Request) => {
    request.current = r;
    setStatus(null);
    setStarting(true);
    const res = await fetch("/api/plaid/link-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r.connectionId ? { connectionId: r.connectionId, investments: r.investments } : {}) });
    const d = await res.json().catch(() => ({}));
    setStarting(false);
    if (!res.ok) {
      setStatus({ tone: "error", text: d.error ?? "Couldn't start the connection." });
      return false;
    }
    setToken(d.linkToken);
    return true;
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: { institution?: { institution_id?: string; name?: string } | null }) => {
      setToken(null);
      const { connectionId, onConnected } = request.current;
      if (connectionId) {
        // Update mode: the item is repaired or has a new permission; nothing to exchange, just sync.
        setStatus({ tone: "busy", text: "Updating your balances…" });
        await syncNowAction();
        setStatus({ tone: "ok", text: "Updated." });
        router.refresh();
        onConnected?.();
        return;
      }
      if (!publicToken) return;
      const name = metadata.institution?.name ?? "your bank";
      setStatus({ tone: "busy", text: `Connecting ${name}…` });
      const r = await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken, institution: { id: metadata.institution?.institution_id ?? null, name: metadata.institution?.name ?? null } }),
      });
      if (!r.ok) return setStatus({ tone: "error", text: (await r.json().catch(() => ({}))).error ?? "Couldn't finish connecting." });
      setStatus({ tone: "ok", text: `${name} is connected. Link is reading your accounts.` });
      router.refresh();
      onConnected?.();
    },
    [router],
  );

  useEffect(() => {
    if (status?.tone !== "ok") return;
    const t = setTimeout(() => setStatus(null), 5000);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <Ctx.Provider value={{ connect, starting }}>
      {children}
      {token && <Launcher token={token} onSuccess={onSuccess} onExit={() => setToken(null)} />}
      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role={status.tone === "error" ? "alert" : "status"}
            className="fixed inset-x-4 bottom-24 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-md bg-primary px-4 py-3 text-[14px] text-primary-fg shadow-soft md:bottom-6"
          >
            {status.tone === "busy" && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
            <span className="flex-1">{status.text}</span>
            {status.tone !== "busy" && (
              <button onClick={() => setStatus(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
                <X size={16} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

/** Mounted only while a link token exists, so each connection gets a fresh Link instance. */
function Launcher({ token, onSuccess, onExit }: { token: string; onSuccess: (t: string | null, m: never) => void; onExit: () => void }) {
  const { open, ready } = usePlaidLink({ token, onSuccess: onSuccess as never, onExit });
  useEffect(() => {
    if (ready) open();
  }, [ready, open]);
  return null;
}

export function usePlaidConnect() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlaidConnect must be used inside <PlaidProvider>");
  return c;
}
