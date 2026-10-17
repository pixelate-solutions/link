import { and, eq, inArray, isNull } from "drizzle-orm";
import { CountryCode, PersonalFinanceCategoryVersion, Products } from "plaid";
import { type AccountType, classify } from "@/lib/finance/classify";
import { todayISO } from "@/lib/finance/dates";
import { decryptSecret, encryptSecret } from "../crypto";
import { type Db, getDb, schema, type Tx } from "../db/client";
import { enqueue } from "../jobs";
import { log } from "../log";
import { loadClassifyContext } from "../pipeline/context";
import { plaid, plaidErrorCode, webhookUrl } from "./client";
import { mapAccount, mapLiabilities, mapTransactionFacts, type PlaidAccountLike, type PlaidLiabilitiesLike, type PlaidTxnLike } from "./map";

export interface SyncBatch {
  accounts: PlaidAccountLike[];
  added: PlaidTxnLike[];
  modified: PlaidTxnLike[];
  removed: { transaction_id: string; account_id?: string | null }[];
  nextCursor: string;
  liabilities?: PlaidLiabilitiesLike | null;
}

export interface SyncResult {
  accounts: number;
  added: number;
  modified: number;
  removed: number;
}

type TxnRow = typeof schema.transactions.$inferSelect;

/**
 * Apply one complete /transactions/sync result atomically: accounts,
 * transaction upserts, pending→posted reconciliation, removals and the new
 * cursor commit together or not at all.
 */
/** Sources Link should not overwrite with a weaker automatic guess. */
const STICKY = new Set(["ai"]);
const STRONG = new Set(["rule", "learned", "structural", "user"]);

export async function applySyncBatch(
  db: Db,
  conn: { id: string; userId: string },
  batch: SyncBatch,
  now = new Date(),
): Promise<SyncResult> {
  return db.transaction(async (tx) => {
    const accountIds = await upsertAccounts(tx, conn, batch.accounts, batch.liabilities, now);
    const ctx = await loadClassifyContext(tx, conn.userId);

    // Plaid never reuses a removed id: removal wins over an add/modify in the same batch.
    const removedSet = new Set(batch.removed.map((r) => r.transaction_id));
    // Later entries win (a transaction can be added then modified within one sync).
    const incoming = new Map<string, PlaidTxnLike>();
    for (const t of [...batch.added, ...batch.modified]) if (!removedSet.has(t.transaction_id)) incoming.set(t.transaction_id, t);

    const lookupIds = [...incoming.values()].flatMap((t) => [t.transaction_id, ...(t.pending_transaction_id ? [t.pending_transaction_id] : [])]);
    const ownAccountIds = [...accountIds.values()].map((a) => a.id);
    const existing: TxnRow[] = [];
    // Chunked to stay far below the driver's bind-parameter limit on huge first syncs.
    for (let i = 0; ownAccountIds.length && i < lookupIds.length; i += 5000) {
      existing.push(
        ...(await tx
          .select()
          .from(schema.transactions)
          .where(and(eq(schema.transactions.userId, conn.userId), inArray(schema.transactions.accountId, ownAccountIds), inArray(schema.transactions.providerId, lookupIds.slice(i, i + 5000))))),
      );
    }
    const byKey = new Map<string, TxnRow>(existing.map((r) => [`${r.accountId}|${r.providerId}`, r]));

    let added = 0;
    let modified = 0;
    const inserts: (typeof schema.transactions.$inferInsert)[] = [];
    for (const t of incoming.values()) {
      const acct = accountIds.get(t.account_id);
      if (!acct) {
        log.warn("sync: transaction for unknown account", { connectionId: conn.id });
        continue;
      }
      const facts = mapTransactionFacts(t);
      const prior =
        byKey.get(`${acct.id}|${facts.providerId}`) ??
        (facts.pendingProviderId ? byKey.get(`${acct.id}|${facts.pendingProviderId}`) : undefined);

      const enrichment = () => {
        const c = classify(
          {
            amount: facts.amountMinor,
            name: facts.name,
            merchantName: facts.providerMerchant,
            accountId: acct.id,
            accountType: acct.type,
            accountSubtype: acct.subtype,
            business: acct.business,
            providerPrimary: facts.providerPrimary,
            providerDetailed: facts.providerDetailed,
            providerConfidence: facts.providerConfidence,
          },
          ctx,
        );
        return {
          merchant: c.merchant,
          merchantKey: c.merchantKey,
          kind: c.kind,
          category: c.category,
          classSource: c.source,
          confidence: c.confidence,
          reason: c.reason,
          needsReview: c.needsReview,
        };
      };

      if (prior && sameFacts(prior, facts) && !prior.removedAt) {
        // Redelivery of an unchanged record. Only fill in branding we didn't have; never re-enrich.
        if ((facts.logoUrl && facts.logoUrl !== prior.logoUrl) || (facts.website && facts.website !== prior.website)) {
          await tx
            .update(schema.transactions)
            .set({ logoUrl: facts.logoUrl ?? prior.logoUrl, website: facts.website ?? prior.website })
            .where(and(eq(schema.transactions.id, prior.id), eq(schema.transactions.userId, conn.userId)));
        }
        continue;
      }
      if (prior) {
        // Posted replaces pending in place, so user edits, notes and splits carry over.
        let next = prior.userLocked ? null : enrichment();
        if (next && STICKY.has(prior.classSource) && !STRONG.has(next.classSource)) next = null;
        const keepEnrichment = next == null;
        if (!keepEnrichment && prior.transferPairId) {
          // Unpair both legs so the pipeline can re-pair them; never leave one side paired.
          await tx
            .update(schema.transactions)
            .set({ transferPairId: null })
            .where(and(eq(schema.transactions.userId, conn.userId), eq(schema.transactions.transferPairId, prior.transferPairId)));
        }
        await tx
          .update(schema.transactions)
          .set({
            ...facts,
            pendingProviderId: facts.pendingProviderId ?? prior.pendingProviderId,
            ...(next ?? {}),
            transferPairId: keepEnrichment ? prior.transferPairId : null,
            removedAt: null,
            updatedAt: now,
          })
          .where(and(eq(schema.transactions.id, prior.id), eq(schema.transactions.userId, conn.userId)));
        byKey.delete(`${acct.id}|${prior.providerId}`);
        byKey.set(`${acct.id}|${facts.providerId}`, { ...prior, providerId: facts.providerId });
        modified++;
      } else {
        inserts.push({ userId: conn.userId, accountId: acct.id, source: "plaid", ...facts, ...enrichment() });
        added++;
      }
    }
    for (let i = 0; i < inserts.length; i += 500) {
      await tx.insert(schema.transactions).values(inserts.slice(i, i + 500)).onConflictDoNothing();
    }

    let removed = 0;
    const removedIds = [...removedSet];
    if (removedIds.length && ownAccountIds.length) {
      const res = await tx
        .update(schema.transactions)
        .set({ removedAt: now, updatedAt: now })
        .where(
          and(
            eq(schema.transactions.userId, conn.userId),
            inArray(schema.transactions.accountId, ownAccountIds),
            inArray(schema.transactions.providerId, removedIds),
            isNull(schema.transactions.removedAt),
          ),
        )
        .returning({ id: schema.transactions.id });
      removed = res.length;
    }

    await tx
      .update(schema.connections)
      .set({ cursor: batch.nextCursor, lastSyncedAt: now, status: "active", errorCode: null, updatedAt: now })
      .where(and(eq(schema.connections.id, conn.id), eq(schema.connections.userId, conn.userId)));

    return { accounts: accountIds.size, added, modified, removed };
  });
}

function sameFacts(row: TxnRow, f: ReturnType<typeof mapTransactionFacts>) {
  return (
    row.providerId === f.providerId &&
    row.authorizedDate === f.authorizedDate &&
    row.paymentChannel === f.paymentChannel &&
    row.providerPrimary === f.providerPrimary &&
    row.providerConfidence === f.providerConfidence &&
    (row.pendingProviderId ?? null) === (f.pendingProviderId ?? row.pendingProviderId ?? null) &&
    row.amountMinor === f.amountMinor &&
    row.date === f.date &&
    row.pending === f.pending &&
    row.name === f.name &&
    row.providerMerchant === f.providerMerchant &&
    row.providerDetailed === f.providerDetailed &&
    row.currency === f.currency
  );
}

async function upsertAccounts(
  tx: Tx,
  conn: { id: string; userId: string },
  accounts: PlaidAccountLike[],
  liabilities: PlaidLiabilitiesLike | null | undefined,
  now: Date,
) {
  const liab = mapLiabilities(liabilities);
  const out = new Map<string, { id: string; type: AccountType; subtype: string | null; business: boolean }>();
  const today = todayISO("UTC", now);
  for (const a of accounts) {
    const m = mapAccount(a, now);
    const l = liab.get(a.account_id);
    const values = { ...m, ...(l ?? {}), updatedAt: now };
    const [row] = await tx
      .insert(schema.accounts)
      .values({ userId: conn.userId, connectionId: conn.id, source: "plaid", ...values })
      .onConflictDoUpdate({ target: [schema.accounts.connectionId, schema.accounts.providerAccountId], set: values })
      .returning({ id: schema.accounts.id, type: schema.accounts.type, subtype: schema.accounts.subtype, userId: schema.accounts.userId, businessId: schema.accounts.businessId });
    if (!row || row.userId !== conn.userId) throw new Error("Account ownership mismatch");
    out.set(a.account_id, { id: row.id, type: row.type as AccountType, subtype: row.subtype, business: Boolean(row.businessId) });
    if (m.currentMinor != null) {
      await tx
        .insert(schema.balanceHistory)
        .values({ accountId: row.id, userId: conn.userId, date: today, currentMinor: m.currentMinor })
        .onConflictDoUpdate({ target: [schema.balanceHistory.accountId, schema.balanceHistory.date], set: { currentMinor: m.currentMinor } });
    }
  }
  // Accounts we hadn't seen in this payload still need ids for transaction mapping.
  const known = await tx
    .select({ id: schema.accounts.id, providerAccountId: schema.accounts.providerAccountId, type: schema.accounts.type, subtype: schema.accounts.subtype, businessId: schema.accounts.businessId })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.connectionId, conn.id), eq(schema.accounts.userId, conn.userId)));
  for (const k of known) if (k.providerAccountId && !out.has(k.providerAccountId)) out.set(k.providerAccountId, { id: k.id, type: k.type as AccountType, subtype: k.subtype, business: Boolean(k.businessId) });
  return out;
}

// ── Live Plaid calls ────────────────────────────────────────────────────────

export interface PageFetcher {
  (cursor: string | undefined): Promise<{ added: PlaidTxnLike[]; modified: PlaidTxnLike[]; removed: { transaction_id: string; account_id?: string | null }[]; accounts: PlaidAccountLike[]; next_cursor: string; has_more: boolean }>;
}

/**
 * Page through /transactions/sync. If Plaid reports a mutation during
 * pagination, discard everything and restart from the original cursor.
 */
export async function collectPages(fetchPage: PageFetcher, startCursor: string | null, maxRestarts = 3): Promise<Omit<SyncBatch, "liabilities">> {
  for (let attempt = 0; ; attempt++) {
    const batch: Omit<SyncBatch, "liabilities"> = { accounts: [], added: [], modified: [], removed: [], nextCursor: startCursor ?? "" };
    let cursor = startCursor ?? undefined;
    try {
      for (let page = 0; page < 1000; page++) {
        const r = await fetchPage(cursor);
        batch.added.push(...r.added);
        batch.modified.push(...r.modified);
        batch.removed.push(...r.removed);
        if (r.accounts.length) batch.accounts = r.accounts;
        cursor = r.next_cursor;
        batch.nextCursor = r.next_cursor;
        if (!r.has_more) return batch;
      }
      throw new Error("sync: too many pages");
    } catch (err) {
      if (plaidErrorCode(err) === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt < maxRestarts) continue;
      throw err;
    }
  }
}

export async function syncConnection(connectionId: string, userId: string): Promise<SyncResult> {
  const db = await getDb();
  const [conn] = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.id, connectionId), eq(schema.connections.userId, userId)));
  if (!conn || conn.status === "disconnected" || conn.provider !== "plaid") return { accounts: 0, added: 0, modified: 0, removed: 0 };
  const accessToken = decryptSecret(conn.accessTokenEnc, conn.itemId);
  const api = plaid();
  try {
    const pages = await collectPages(async (cursor) => {
      const { data } = await api.transactionsSync({
        access_token: accessToken,
        cursor,
        count: 500,
        options: { include_personal_finance_category: true, personal_finance_category_version: PersonalFinanceCategoryVersion.V2 },
      });
      return data as unknown as Awaited<ReturnType<PageFetcher>>;
    }, conn.cursor);

    let liabilities: PlaidLiabilitiesLike | null = null;
    try {
      const { data } = await api.liabilitiesGet({ access_token: accessToken });
      liabilities = data.liabilities as unknown as PlaidLiabilitiesLike;
    } catch (err) {
      // Liabilities are optional; many institutions don't support them.
      log.info("sync: liabilities unavailable", { code: plaidErrorCode(err) });
    }
    if (!pages.accounts.length) {
      const { data } = await api.accountsGet({ access_token: accessToken });
      pages.accounts = data.accounts as unknown as PlaidAccountLike[];
    }
    const investments = await investmentBalances(api, accessToken, pages.accounts);
    pages.accounts = investments.accounts;
    const result = await applySyncBatch(db, { id: conn.id, userId }, { ...pages, liabilities });
    if (investments.needsConsent !== conn.needsInvestmentsConsent) {
      await db.update(schema.connections).set({ needsInvestmentsConsent: investments.needsConsent }).where(and(eq(schema.connections.id, conn.id), eq(schema.connections.userId, userId)));
    }
    // On the first sync, make sure the item's webhooks point at this deployment.
    if (!conn.cursor && webhookUrl()) {
      try {
        await api.itemWebhookUpdate({ access_token: accessToken, webhook: webhookUrl()! });
      } catch (err) {
        log.warn("sync: webhook update failed", { code: plaidErrorCode(err) });
      }
    }
    await enqueue({ type: "process_user", userId, dedupeKey: `process:${userId}` });
    log.info("sync: applied", { connectionId, ...result });
    return result;
  } catch (err) {
    const code = plaidErrorCode(err);
    const status = code === "ITEM_LOGIN_REQUIRED" || code === "PENDING_EXPIRATION" ? "login_required" : "error";
    await db
      .update(schema.connections)
      .set({ status, errorCode: code ?? "SYNC_FAILED", updatedAt: new Date() })
      .where(and(eq(schema.connections.id, conn.id), eq(schema.connections.userId, userId)));
    if (status === "login_required") return { accounts: 0, added: 0, modified: 0, removed: 0 };
    throw err;
  }
}

/**
 * Retirement and brokerage balances come from holdings: without the
 * Investments product many institutions (Empower, for one) report $0.
 */
export async function investmentBalances(api: ReturnType<typeof plaid>, accessToken: string, accounts: PlaidAccountLike[]): Promise<{ accounts: PlaidAccountLike[]; needsConsent: boolean }> {
  if (!accounts.some((a) => a.type === "investment" || a.type === "brokerage")) return { accounts, needsConsent: false };
  try {
    const { data } = await api.investmentsHoldingsGet({ access_token: accessToken });
    const totals = new Map<string, number>();
    for (const h of data.holdings) totals.set(h.account_id, (totals.get(h.account_id) ?? 0) + (h.institution_value ?? 0));
    const fresh = new Map(data.accounts.map((a) => [a.account_id, a]));
    return {
      needsConsent: false,
      accounts: accounts.map((a) => {
        const f = fresh.get(a.account_id);
        const current = f?.balances.current || totals.get(a.account_id) || a.balances.current;
        return f || totals.has(a.account_id) ? { ...a, balances: { ...a.balances, current } } : a;
      }),
    };
  } catch (err) {
    const code = plaidErrorCode(err);
    log.info("sync: investments unavailable", { code });
    return { accounts, needsConsent: code === "ADDITIONAL_CONSENT_REQUIRED" };
  }
}

export async function createLinkToken(userId: string, connectionId?: string, opts: { investments?: boolean } = {}): Promise<string> {
  const api = plaid();
  let accessToken: string | undefined;
  if (connectionId) {
    const db = await getDb();
    const [conn] = await db
      .select()
      .from(schema.connections)
      .where(and(eq(schema.connections.id, connectionId), eq(schema.connections.userId, userId)));
    if (!conn) throw new Error("Connection not found");
    accessToken = decryptSecret(conn.accessTokenEnc, conn.itemId);
  }
  const { data } = await api.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "Link",
    language: "en",
    country_codes: [CountryCode.Us],
    webhook: webhookUrl(),
    ...(accessToken
      ? // Update mode: repair a login, or ask for the Investments permission an older connection lacks.
        { access_token: accessToken, ...(opts.investments ? { additional_consented_products: [Products.Investments] } : {}) }
      : // Investments gives real balances for 401(k)s and brokerage accounts; Transactions alone often reports $0.
        { products: [Products.Transactions], optional_products: [Products.Liabilities, Products.Investments], transactions: { days_requested: 730 } }),
  });
  return data.link_token;
}

export async function exchangePublicToken(userId: string, publicToken: string, institution: { id?: string | null; name?: string | null }) {
  const api = plaid();
  const { data } = await api.itemPublicTokenExchange({ public_token: publicToken });
  const db = await getDb();
  const [conn] = await db
    .insert(schema.connections)
    .values({
      userId,
      itemId: data.item_id,
      institutionId: institution.id ?? null,
      institutionName: institution.name ?? null,
      accessTokenEnc: encryptSecret(data.access_token, data.item_id),
    })
    .onConflictDoNothing()
    .returning({ id: schema.connections.id });
  if (!conn) throw new Error("This connection already exists");
  await enqueue({ type: "plaid_sync", userId, payload: { connectionId: conn.id }, dedupeKey: `sync:${conn.id}` });
  if (institution.id) {
    const { institutionLogo } = await import("./institutions");
    await db.update(schema.connections).set({ institutionLogo: await institutionLogo(institution.id) }).where(and(eq(schema.connections.id, conn.id), eq(schema.connections.userId, userId)));
  }
  return conn.id;
}

export async function disconnect(userId: string, connectionId: string, deleteData: boolean) {
  const db = await getDb();
  const [conn] = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.id, connectionId), eq(schema.connections.userId, userId)));
  if (!conn) throw new Error("Connection not found");
  if (conn.status !== "disconnected" && conn.provider === "plaid") {
    try {
      await plaid().itemRemove({ access_token: decryptSecret(conn.accessTokenEnc, conn.itemId) });
    } catch (err) {
      log.warn("disconnect: item/remove failed", { code: plaidErrorCode(err) });
    }
  }
  if (deleteData) {
    await db.delete(schema.connections).where(and(eq(schema.connections.id, conn.id), eq(schema.connections.userId, userId)));
  } else {
    await db
      .update(schema.connections)
      .set({ status: "disconnected", accessTokenEnc: encryptSecret("revoked", conn.itemId), cursor: null, updatedAt: new Date() })
      .where(and(eq(schema.connections.id, conn.id), eq(schema.connections.userId, userId)));
  }
  await enqueue({ type: "process_user", userId, dedupeKey: `process:${userId}` });
}
