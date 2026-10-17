import { cookies } from "next/headers";
import { connection } from "next/server";
import { getDb, schema } from "./db/client";
import { sign, unsign } from "./crypto";

export type AuthMode = "clerk" | "dev" | "none";

export function authMode(): AuthMode {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) return "clerk";
  if (process.env.LINK_DEV_AUTH === "1") {
    if (process.env.NODE_ENV === "production" && process.env.LINK_ALLOW_DEV_AUTH_IN_PROD !== "1") return "none";
    return "dev";
  }
  return "none";
}

export const DEV_COOKIE = "link_dev_user";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

/** Resolve the signed-in user's id on the server. Never accepts an id from the client. */
export async function currentUserId(): Promise<string | null> {
  // Identity is per request: never let a page that checks it be prerendered.
  await connection();
  const mode = authMode();
  if (mode === "clerk") {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId ?? null;
  }
  if (mode === "dev") {
    const jar = await cookies();
    const raw = jar.get(DEV_COOKIE)?.value;
    return raw ? unsign(raw) : null;
  }
  return null;
}

export function devSessionValue(userId: string) {
  return sign(userId);
}

/** Require a user and make sure their `link.users` row exists. */
export async function requireUser(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new UnauthorizedError();
  await ensureUser(id);
  return id;
}

const known = new Set<string>();

export function forgetUser(id: string) {
  known.delete(id);
}

export async function ensureUser(id: string, profile?: { email?: string | null; name?: string | null }) {
  if (known.has(id)) return;
  const db = await getDb();
  let email = profile?.email ?? null;
  let name = profile?.name ?? null;
  if (!profile && authMode() === "clerk") {
    try {
      const { currentUser } = await import("@clerk/nextjs/server");
      const u = await currentUser();
      email = u?.primaryEmailAddress?.emailAddress ?? null;
      name = u?.firstName ?? null;
    } catch {
      // Profile details are optional.
    }
  }
  await db.insert(schema.users).values({ id, email, name }).onConflictDoNothing();
  known.add(id);
}
