import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Applies versioned migrations for the `link` schema. Never touches legacy `public` tables. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), {
    migrationsFolder: path.join(import.meta.dirname, "migrations"),
    migrationsSchema: "link",
  });
  await client.end();
  console.log("link schema migrated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
