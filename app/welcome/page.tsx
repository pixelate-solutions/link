import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Onboarding } from "@/components/welcome/onboarding";
import { currentUserId, ensureUser } from "@/server/auth";
import { getDb, schema } from "@/server/db/client";
import { demoEnabled } from "@/server/demo/seed";
import { plaidConfigured } from "@/server/plaid/client";

export const metadata = { title: "Welcome" };

export default async function Welcome() {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");
  await ensureUser(userId);
  const db = await getDb();
  const [[user], goals, conns] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, userId)),
    db.select({ id: schema.goals.id }).from(schema.goals).where(eq(schema.goals.userId, userId)),
    db.select({ id: schema.connections.id }).from(schema.connections).where(eq(schema.connections.userId, userId)),
  ]);
  if (user?.onboardedAt) redirect("/home");
  return <Onboarding name={user?.name ?? null} hasGoal={goals.length > 0} hasConnection={conns.length > 0} plaid={plaidConfigured()} demo={demoEnabled()} />;
}
