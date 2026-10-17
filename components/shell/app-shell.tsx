"use client";

import { motion } from "motion/react";
import { Activity, Compass, Home, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAsk } from "@/components/ask/ask-context";
import { cn } from "@/lib/utils";
import { AccountSheet } from "./account-sheet";
import { Logo } from "./logo";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/plan", label: "Plan", icon: Compass },
] as const;

export function AppShell({ children, initials, notice }: { children: ReactNode; initials: string; notice?: ReactNode }) {
  const path = usePathname();
  const ask = useAsk();
  const [account, setAccount] = useState(false);
  const active = useOptimisticTab(path);

  const avatar = (
    <button
      onClick={() => setAccount(true)}
      aria-label="Account and settings"
      className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold text-fg-2 transition-colors hover:bg-surface-3"
    >
      {initials}
    </button>
  );

  return (
    <div className="min-h-dvh">
      {/* Desktop / tablet top bar */}
      <header className="sticky top-0 z-30 hidden border-b border-transparent bg-bg/80 backdrop-blur-xl md:block">
        <div className="mx-auto grid h-16 max-w-5xl grid-cols-[1fr_auto_1fr] items-center px-6">
          <Link href="/home" aria-label="Link home" className="justify-self-start">
            <Logo />
          </Link>
          <TopNav active={active} />
          <div className="flex items-center gap-2 justify-self-end">
            <button
              onClick={() => ask.open()}
              className="group inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 pl-3 pr-2 text-sm text-muted transition-colors hover:text-fg"
            >
              <Sparkles size={15} className="text-accent-ink" />
              Ask Link
              <kbd className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">⌘K</kbd>
            </button>
            {avatar}
          </div>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-bg/85 px-5 backdrop-blur-xl md:hidden">
        <Link href="/home" aria-label="Link home">
          <Logo />
        </Link>
        {avatar}
      </header>

      {notice}

      <main className="mx-auto max-w-5xl px-5 pb-32 pt-4 md:px-6 md:pb-20 md:pt-8">{children}</main>

      {/* Mobile tab bar: navigation and Ask in one place, never covering content */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur-xl safe-bottom md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 pt-1.5">
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = active === n.href;
            return (
              <Link key={n.href} href={n.href} prefetch aria-current={on ? "page" : undefined} className="relative flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium">
                <span className={cn("absolute -top-1.5 h-0.5 w-6 rounded-full bg-fg transition-opacity duration-150", on ? "opacity-100" : "opacity-0")} />
                <Icon size={22} strokeWidth={on ? 2.2 : 1.8} className={on ? "text-fg" : "text-muted"} />
                <span className={on ? "text-fg" : "text-muted"}>{n.label}</span>
              </Link>
            );
          })}
          <button onClick={() => ask.open()} className="flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium text-muted">
            <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-accent text-accent-fg">
              <Sparkles size={13} />
            </span>
            Ask
          </button>
        </div>
      </nav>

      <AccountSheet open={account} onOpenChange={setAccount} />
    </div>
  );
}

/**
 * The tab the user is going to, not the one the server has finished rendering:
 * any click on an in-app link to a tab moves the indicator immediately.
 */
function useOptimisticTab(path: string) {
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin) return;
      const tab = NAV.find((n) => a.pathname.startsWith(n.href));
      if (tab) setPending(tab.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  // The route committed: the real path is the truth again.
  const [seen, setSeen] = useState(path);
  if (seen !== path) {
    setSeen(path);
    setPending(null);
  }
  return pending ?? NAV.find((n) => path.startsWith(n.href))?.href;
}

/**
 * One always-mounted pill that slides to the active tab. Measured relative to
 * the nav itself, so page scroll can never make it fly in from elsewhere.
 */
function TopNav({ active }: { active: string | undefined }) {
  const refs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = active ? refs.current[active] : null;
    if (el) setBox({ x: el.offsetLeft, w: el.offsetWidth });
  }, [active]);
  return (
    <nav aria-label="Primary" className="relative flex items-center gap-1 rounded-full bg-surface-2 p-1">
      {box && (
        <motion.span
          aria-hidden
          className="absolute top-1 bottom-1 left-0 rounded-full bg-surface shadow-soft"
          initial={false}
          animate={{ x: box.x, width: box.w }}
          transition={{ type: "spring", stiffness: 520, damping: 42 }}
        />
      )}
      {NAV.map((n) => (
        <Link
          key={n.href}
          ref={(el) => {
            refs.current[n.href] = el;
          }}
          href={n.href}
          prefetch
          aria-current={active === n.href ? "page" : undefined}
          className={cn("relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150", active === n.href ? "text-fg" : "text-muted hover:text-fg")}
        >
          <span className="relative">{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}
