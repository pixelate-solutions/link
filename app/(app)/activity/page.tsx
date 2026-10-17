import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityView } from "@/components/activity/activity-view";
import { requireUser } from "@/server/auth";
import { listAccounts, searchTransactions } from "@/server/services/activity";
import { getPicture } from "@/server/services/picture";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const userId = await requireUser();
  const { filter } = await searchParams;
  const [list, accounts, picture] = await Promise.all([searchTransactions(userId, { limit: 60, review: filter === "review" || undefined }), listAccounts(userId), getPicture(userId)]);
  return (
    <Suspense>
      <ActivityView
        initial={list.rows}
        hasMore={list.hasMore}
        reviewCount={picture.coverage.reviewCount}
        accounts={accounts.filter((a) => !a.hidden).map((a) => ({ id: a.id, name: a.name, mask: a.mask, businessId: a.businessId }))}
        businesses={picture.businesses.map((b) => ({ id: b.id, name: b.name }))}
        recurring={picture.recurring}
        today={picture.asOf}
      />
    </Suspense>
  );
}
