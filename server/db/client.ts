import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };

let instance: Db | null = null;
let ready: Promise<Db> | null = null;

/**
 * Production and local development use Postgres via postgres-js
 * (DATABASE_URL). Tests inject an in-process PGlite database with `setDb`.
 */
export async function getDb(): Promise<Db> {
  if (instance) return instance;
  ready ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: Number(process.env.DATABASE_POOL_SIZE ?? 5), prepare: false });
    instance = drizzle(client, { schema }) as unknown as Db;
    return instance;
  })();
  return ready;
}

export function setDb(db: Db | null) {
  instance = db;
  ready = db ? Promise.resolve(db) : null;
}
