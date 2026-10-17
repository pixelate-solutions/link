import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  schemaFilter: ["link"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/link_dev" },
  strict: true,
  verbose: true,
});
