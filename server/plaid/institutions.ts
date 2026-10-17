import { CountryCode } from "plaid";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { log } from "../log";
import { plaid, plaidConfigured, plaidErrorCode } from "./client";

/**
 * The bank's logo for the connected-accounts list. Plaid's own logo (a PNG,
 * base64) when it has one, otherwise the icon from the bank's website.
 */
export async function institutionLogo(institutionId: string): Promise<string> {
  try {
    const { data } = await plaid().institutionsGetById({ institution_id: institutionId, country_codes: [CountryCode.Us], options: { include_optional_metadata: true } });
    if (data.institution.logo) return `data:image/png;base64,${data.institution.logo}`;
    const host = data.institution.url ? new URL(data.institution.url.startsWith("http") ? data.institution.url : `https://${data.institution.url}`).hostname : null;
    return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : "";
  } catch (err) {
    log.info("plaid: institution lookup failed", { code: plaidErrorCode(err) });
    return "";
  }
}

/** Fill in logos for connections that don't have one yet (looked up once each). */
export async function ensureInstitutionLogos(userId: string) {
  if (!plaidConfigured()) return;
  const db = await getDb();
  const c = schema.connections;
  const missing = await db
    .select({ id: c.id, institutionId: c.institutionId })
    .from(c)
    .where(and(eq(c.userId, userId), eq(c.provider, "plaid"), isNotNull(c.institutionId), isNull(c.institutionLogo)));
  await Promise.all(
    missing.map(async (m) => {
      const logo = await institutionLogo(m.institutionId!);
      await db.update(c).set({ institutionLogo: logo }).where(and(eq(c.id, m.id), eq(c.userId, userId)));
    }),
  );
}
