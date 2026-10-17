import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { type Db, schema, setDb } from "@/server/db/client";

/** A fresh in-process Postgres with the real migrations applied. */
export async function testDb(): Promise<{ db: Db; client: PGlite }> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(drizzle(client), { migrationsFolder: path.join(import.meta.dirname, "../../server/db/migrations"), migrationsSchema: "link" });
  setDb(db);
  return { db, client };
}

export async function createUser(db: Db, id: string, extra: Partial<typeof schema.users.$inferInsert> = {}) {
  await db.insert(schema.users).values({ id, email: `${id}@example.test`, timezone: "UTC", ...extra });
  return id;
}
