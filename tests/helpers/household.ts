import { schema, type Db } from "@/server/db/client";
import { applySyncBatch } from "@/server/plaid/sync";
import { processUser } from "@/server/pipeline/process";
import { ACCOUNTS, AS_OF, buildHousehold, LIABILITIES, type LabeledTxn } from "../fixtures/household";
import { createUser } from "./db";

export const NOW = new Date(`${AS_OF}T18:00:00Z`);

export function strip(t: LabeledTxn) {
  const { truth: _t, ...rest } = t;
  return rest;
}

/** Create a user, connect the synthetic household through the real applier, and run the pipeline. */
export async function seedHousehold(db: Db, userId: string, itemId = `item_${userId}`) {
  await createUser(db, userId);
  const [conn] = await db.insert(schema.connections).values({ userId, itemId, institutionName: "Fixture Bank", accessTokenEnc: "v1.x.y.z" }).returning();
  const fixture = buildHousehold();
  await applySyncBatch(db, { id: conn!.id, userId }, { accounts: ACCOUNTS, added: fixture.map(strip), modified: [], removed: [], nextCursor: "c1", liabilities: LIABILITIES }, NOW);
  const picture = await processUser(userId, NOW);
  return { connId: conn!.id, fixture, picture };
}
