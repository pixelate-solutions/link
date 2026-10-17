import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AskProvider } from "@/components/ask/ask-context";
import { AppShell } from "@/components/shell/app-shell";
import { currentUserId, ensureUser } from "@/server/auth";
import { getDb, schema } from "@/server/db/client";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");
  await ensureUser(userId);
  const db = await getDb();
  const [[user], conns] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, userId)),
    db.select({ provider: schema.connections.provider }).from(schema.connections).where(eq(schema.connections.userId, userId)),
  ]);
  if (!user?.onboardedAt) redirect("/welcome");
  const initials = (user.name ?? user.email ?? "You").trim().slice(0, 1).toUpperCase();
  const notice = conns.some((c) => c.provider === "demo") ? (
    <div className="mx-auto max-w-5xl px-5 md:px-6">
      <p className="rounded-sm bg-caution-soft px-3 py-1.5 text-center text-[12px] text-caution">Demo mode: these are synthetic accounts, not real bank data.</p>
    </div>
  ) : null;
  return (
    <AskProvider>
      <AppShell initials={initials} notice={notice}>
        {children}
      </AppShell>
    </AskProvider>
  );
}
