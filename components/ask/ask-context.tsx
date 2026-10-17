"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AskPanel } from "./ask-panel";

interface AskApi {
  open: (prefill?: string, send?: boolean) => void;
  close: () => void;
}

const Ctx = createContext<AskApi>({ open: () => {}, close: () => {} });

export function useAsk() {
  return useContext(Ctx);
}

/** Ask Link is available everywhere: ⌘K, the nav, and contextual "Why?" links. */
export function AskProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; prefill?: string; send?: boolean; nonce: number }>({ open: false, nonce: 0 });
  const open = useCallback((prefill?: string, send?: boolean) => setState((s) => ({ open: true, prefill, send, nonce: s.nonce + 1 })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setState((s) => ({ open: !s.open, nonce: s.nonce + 1 }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const api = useMemo(() => ({ open, close }), [open, close]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <AskPanel open={state.open} onOpenChange={(o) => (o ? open() : close())} prefill={state.prefill} autoSend={state.send} nonce={state.nonce} />
    </Ctx.Provider>
  );
}
