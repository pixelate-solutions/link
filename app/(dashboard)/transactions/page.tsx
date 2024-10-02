"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSelectAccount } from "@/features/accounts/hooks/use-select-account";
import { useBulkCreateTransactions } from "@/features/transactions/api/use-bulk-create-transactions";
import { useBulkDeleteTransactions } from "@/features/transactions/api/use-bulk-delete-transactions";
import { useGetTransactions } from "@/features/transactions/api/use-get-transactions";
import { RecurringTransaction } from "@/app/(dashboard)/transactions/recurring-columns";
import { useQuery } from "@tanstack/react-query";
import { UploadButton } from "./upload-button";
import { ImportCard } from "./import-card";
import { useBulkDeleteRecurringTransactions } from "@/features/transactions/api/use-bulk-delete-recurring-transactions";
import { NewRecurringTransactionSheet } from "@/features/transactions/components/new-recurring-transaction-sheet"; // Import the sheet
import { recurringColumns } from "./recurring-columns";
import { columns } from "./columns";
import { useOpenTransaction } from "@/features/transactions/hooks/use-open-transaction";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";

const useGetRecurringTransactions = () => {
  return useQuery({
    queryKey: ["recurringTransactions"],
    queryFn: async () => {
      const response = await fetch("/api/plaid/recurring/get");
      if (!response.ok) {
        throw new Error("Failed to fetch recurring transactions");
      }
      return response.json();
    },
  });
};

enum VARIANTS {
  LIST = "LIST",
  IMPORT = "IMPORT",
}

const INITIAL_IMPORT_RESULTS = {
  data: [],
  errors: [],
  meta: [],
};

const TransactionsPage = () => {
  const [variant, setVariant] = useState<VARIANTS>(VARIANTS.LIST);
  const [importResults, setImportResults] = useState(INITIAL_IMPORT_RESULTS);
  const [currentTab, setCurrentTab] = useState("transactions");

  const [isSheetOpen, setIsSheetOpen] = useState(false); // Local state for sheet management
  const [loadingRecurring, setLoadingRecurring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [AccountDialog, confirm] = useSelectAccount();
  const createTransactions = useBulkCreateTransactions();
  const deleteTransactions = useBulkDeleteTransactions();
  const deleteRecurringTransactions = useBulkDeleteRecurringTransactions();
  const transactionsQuery = useGetTransactions();
  const newTransaction = useNewTransaction();

  const { data: recurringTransactionsData } = useGetRecurringTransactions();
  let recurringTransactions = recurringTransactionsData?.recurringTransactions || [];

  const transactions = transactionsQuery.data || [];

  // Fetch recurring transactions when the tab changes to "recurring"
  useEffect(() => {
    const fetchRecurringTransactions = async () => {
      setLoadingRecurring(true);
      try {
        const response = await fetch("/api/plaid/recurring/get", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch recurring transactions");
        }

        const data = await response.json();
        recurringTransactions = data.recurringTransactions as RecurringTransaction[];
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
      } finally {
        setLoadingRecurring(false);
      }
    };

    if (currentTab !== "recurring" && recurringTransactions.length === 0) {
      fetchRecurringTransactions();
    }
  }, [currentTab, recurringTransactions.length]);

  const onUpload = (results: typeof INITIAL_IMPORT_RESULTS) => {
    setImportResults(results);
    setVariant(VARIANTS.IMPORT);
  };

  const onCancelImport = () => {
    setImportResults(INITIAL_IMPORT_RESULTS);
    setVariant(VARIANTS.LIST);
  };

  const onSubmitImport = async (values: any[]) => {
    const accountId = await confirm();

    if (!accountId) {
      return toast.error("Please select an account to continue.");
    }

    const data = values.map((value) => ({
      ...value,
      accountId: accountId as string,
    }));

    createTransactions.mutate(data, {
      onSuccess: () => {
        onCancelImport();
      },
    });
  };

  const isDisabled =
    transactionsQuery.isLoading ||
    (currentTab === "recurring" && loadingRecurring) ||
    deleteTransactions.isPending;

  if (transactionsQuery.isLoading || (currentTab !== "recurring" && loadingRecurring)) {
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
      </div>
    );
  }

  if (variant === VARIANTS.IMPORT) {
    return (
      <>
        <AccountDialog />

        <ImportCard
          data={importResults.data}
          onCancel={onCancelImport}
          onSubmit={onSubmitImport}
        />
      </>
    );
  }

  return (
    <div className="mx-auto -mt-6 lg:-mt-12 w-full max-w-screen-2xl pb-10 bg-white rounded-2xl p-2">
      <Tabs defaultValue="transactions" onValueChange={setCurrentTab}>
        <TabsList className="mb-6 grid w-full grid-cols-2 lg:h-[50px]">
          <TabsTrigger
            className="text-xs md:text-sm lg:text-md lg:h-[40px]"
            value="transactions"
          >
            All Transactions
          </TabsTrigger>
          <TabsTrigger
            className="lg:h-[40px] text-xs md:text-sm lg:text-md"
            value="recurring"
          >
            Recurring Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <Card className="border-none drop-shadow-sm">
            <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="line-clamp-1 text-xl">
                Transaction History
              </CardTitle>

              <div className="flex flex-col items-center gap-x-2 gap-y-2 lg:flex-row">
                <Button
                  size="sm"
                  onClick={newTransaction.onOpen}
                  className="w-full lg:w-auto"
                >
                  <Plus className="mr-2 size-4" /> Add new
                </Button>

                <UploadButton onUpload={onUpload} />
              </div>
            </CardHeader>

            <CardContent>
              <DataTable
                filterKey="payee"
                columns={columns}
                data={transactions.map((transaction) => ({
                  ...transaction,
                  amount: transaction.amount.toString(),
                }))}
                onDelete={(row) => {
                  const ids = row.map((r) => r.original.id);
                  deleteTransactions.mutate({ ids });
                }}
                disabled={isDisabled}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recurring">
          <Card className="border-none drop-shadow-sm">
            <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="line-clamp-1 text-xl">
                Recurring Transactions
              </CardTitle>
              <div className="flex flex-col items-center gap-x-2 gap-y-2 lg:flex-row">
                <Button
                  size="sm"
                  onClick={() => setIsSheetOpen(true)} // Open the recurring transaction sheet on click
                  className="w-full lg:w-auto"
                >
                  <Plus className="mr-2 size-4" /> Add new
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <DataTable
                filterKey="name"
                columns={recurringColumns}
                data={recurringTransactions.map((transaction: RecurringTransaction) => ({
                  ...transaction,
                  amount: transaction.averageAmount.toString(),
                  category: transaction.categoryName, // Include category name in the displayed data
                }))}
                onDelete={(row) => {
                  const ids = row.map((r) => r.original.id);
                  deleteRecurringTransactions.mutate({ ids });
                }}
                disabled={isDisabled}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Render the NewRecurringTransactionSheet component and pass in state */}
      <NewRecurringTransactionSheet
        isOpen={isSheetOpen} // Control open/close state via props
        onClose={() => setIsSheetOpen(false)} // Handle closing the sheet
      />
    </div>
  );
};

export default TransactionsPage;
