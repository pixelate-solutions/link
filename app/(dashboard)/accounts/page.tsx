"use client";

import { Loader2, Plus } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBulkDeleteAccounts } from "@/features/accounts/api/use-bulk-delete-accounts";
import { useGetAccounts } from "@/features/accounts/api/use-get-accounts";
import { useNewAccount } from "@/features/accounts/hooks/use-new-account";

// Import columns
import { columns } from "./columns";

const AccountsPage = () => {
  const newAccount = useNewAccount();
  const deleteAccounts = useBulkDeleteAccounts();

  // Fetch manual accounts (isFromPlaid = false)
  const manualAccountsQuery = useGetAccounts(false);
  const manualAccounts = manualAccountsQuery.data || [];

  // Fetch Plaid accounts (isFromPlaid = true)
  const plaidAccountsQuery = useGetAccounts(true);
  const plaidAccounts = plaidAccountsQuery.data || [];

  const isDisabled = manualAccountsQuery.isLoading || plaidAccountsQuery.isLoading || deleteAccounts.isPending;

  if (manualAccountsQuery.isLoading || plaidAccountsQuery.isLoading) {
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

  return (
    <div className="mx-auto -mt-6 w-full max-w-screen-2xl pb-10">
      {/* Manual Accounts */}
      <Card className="border-none drop-shadow-sm">
        <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="line-clamp-1 text-2xl">Manual Accounts</CardTitle>
          <Button size="sm" onClick={newAccount.onOpen}>
            <Plus className="mr-2 size-4" /> Add new
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            data={manualAccounts}
            columns={columns} // Pass the columns here
            filterKey="name"  // Optionally, set a filter key if needed
            disabled={isDisabled}
            onDelete={(row) => deleteAccounts.mutate({ ids: row.map((r) => r.original.id) })}
          />
        </CardContent>
      </Card>

      {/* Plaid Accounts */}
      <Card className="mt-10">
        <CardHeader>
          <CardTitle className="line-clamp-1 text-2xl">Connected Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={plaidAccounts}
            columns={columns}  // Pass the columns here
            filterKey="name"  // Optionally, set a filter key if needed
            disabled={isDisabled}
            onDelete={(row) => deleteAccounts.mutate({ ids: row.map((r) => r.original.id) })}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountsPage;
