"use client";

import { Loader2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBulkDeleteAccounts } from "@/features/accounts/api/use-bulk-delete-accounts";
import { useGetAccounts } from "@/features/accounts/api/use-get-accounts";
import { useNewAccount } from "@/features/accounts/hooks/use-new-account";
import { columns } from "./columns";

const fetchAccountTotals = async (from: string, to: string, accountIds: string[]) => {
  const responses = await Promise.all(
    accountIds.map((id) =>
      fetch(`/api/plaid/account-totals?from=${from}&to=${to}&accountId=${id}`)
    )
  );
  const results = await Promise.all(responses.map((res) => res.json()));
  return accountIds.map((id, index) => ({
    id,
    ...results[index],
  }));
};

const AccountsPage = () => {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const newAccount = useNewAccount();
  const deleteAccounts = useBulkDeleteAccounts();

  // Fetch manual accounts (isFromPlaid = false)
  const manualAccountsQuery = useGetAccounts(false);
  const manualAccounts = manualAccountsQuery.data || [];

  // Fetch Plaid accounts (isFromPlaid = true)
  const plaidAccountsQuery = useGetAccounts(true);
  const plaidAccounts = plaidAccountsQuery.data || [];

  const accountIds = [...new Set([...manualAccounts.map(acc => acc.id), ...plaidAccounts.map(acc => acc.id)])];

  const totalsQuery = useQuery({
    queryKey: ["accountTotals", { from, to, accountIds }],
    queryFn: () => fetchAccountTotals(from, to, accountIds),
    enabled: accountIds.length > 0, // Ensures the query runs only if there are account IDs
  });

  const [isPremiumUser, setIsPremiumUser] = useState(false);

  const isDisabled = manualAccountsQuery.isLoading || plaidAccountsQuery.isLoading || deleteAccounts.isPending || totalsQuery.isLoading;

  const { user } = useUser(); // Always call useUser
  const userId = user?.id || "";

  // Always call useEffect, even if userId might not be set yet
  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (userId) {
        try {
          const response = await fetch(`/api/subscription-status?userId=${userId}`)
            .then(response => response.json())
            .then(async (data) => {
              setIsPremiumUser(data.plan !== "Free");
            });
        } catch (error) {
          console.error("Error fetching subscription status:", error);
          setIsPremiumUser(false);
        }
      }
    };
    fetchSubscriptionStatus();
  }, [userId]);

  if (manualAccountsQuery.isLoading || plaidAccountsQuery.isLoading || totalsQuery.isLoading) {
    return (
      <div className="mx-auto -mt-6 w-full max-w-screen-2xl pb-10">
        <Card className="border-none drop-shadow-sm">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>

          <CardContent>
            <div className="flex h-[500px] w-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-slate-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-none drop-shadow-sm mt-10">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>

          <CardContent>
            <div className="flex h-[500px] w-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-slate-300" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const manualAccountsWithTotals = manualAccounts.map(account => ({
    ...account,
    ...totalsQuery.data?.find(total => total.id === account.id) || {},
  }));

  const plaidAccountsWithTotals = plaidAccounts.map(account => ({
    ...account,
    ...totalsQuery.data?.find(total => total.id === account.id) || {},
  }));

  return (
    <div className="mx-auto -mt-6 w-full max-w-screen-2xl pb-10">
      {/* Manual Accounts */}
      <Card className="border-none drop-shadow-sm">
        <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="line-clamp-1 text-2xl">{isPremiumUser ? "Manual Accounts" : "Accounts"}</CardTitle>
          <Button size="sm" onClick={newAccount.onOpen}>
            <Plus className="mr-2 size-4" /> Add new
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            data={manualAccountsWithTotals}
            columns={columns}
            filterKey="name"
            disabled={isDisabled}
            onDelete={(row) => deleteAccounts.mutate({ ids: row.map((r) => r.original.id) })}
          />
        </CardContent>
      </Card>

      {/* Plaid Accounts */}
      {isPremiumUser && (
        <Card className="mt-10">
          <CardHeader>
            <CardTitle className="line-clamp-1 text-2xl">Connected Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              data={plaidAccountsWithTotals}
              columns={columns}
              filterKey="name"
              disabled={isDisabled}
              onDelete={(row) => deleteAccounts.mutate({ ids: row.map((r) => r.original.id) })}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AccountsPage;
