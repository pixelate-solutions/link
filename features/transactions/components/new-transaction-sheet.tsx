import { Loader2 } from "lucide-react";
import { z } from "zod";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { insertTransactionSchema } from "@/db/schema";
import { useCreateAccount } from "@/features/accounts/api/use-create-account";
import { useGetAccounts } from "@/features/accounts/api/use-get-accounts";
import { useCreateCategory } from "@/features/categories/api/use-create-category";
import { useGetCategories } from "@/features/categories/api/use-get-categories";
import { useCreateTransaction } from "@/features/transactions/api/use-create-transaction";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";

import { TransactionForm } from "./transaction-form";

const formSchema = insertTransactionSchema.omit({ id: true });

type FormValues = z.infer<typeof formSchema>;

export const NewTransactionSheet = () => {
  const { isOpen, onClose } = useNewTransaction();

  const createMutation = useCreateTransaction();
  const categoryMutation = useCreateCategory();
  const categoryQuery = useGetCategories();
  const categoryOptions = (categoryQuery.data ?? []).map((category) => ({
    label: category.name ?? "Unnamed Category", // Provide a default value if name is null or undefined
    value: category.id,
  }));

  const accountMutation = useCreateAccount();

  const plaidAccountQuery = useGetAccounts(true);
  const manualAccountQuery = useGetAccounts(false);

  // Wait until both queries have loaded
  const isDataLoaded = plaidAccountQuery.isSuccess && manualAccountQuery.isSuccess;

  // Combine the two arrays if both queries are loaded
  const joinedAccounts = isDataLoaded
    ? [
        ...(plaidAccountQuery.data ?? []),
        ...(manualAccountQuery.data ?? []),
      ]
    : [];

  // Map the combined array to create account options
  const accountOptions = joinedAccounts.map((account) => ({
    label: account.name ?? "Unnamed Account", // Provide a default value if name is null or undefined
    value: account.id,
  }));

  // Return the data as per the expected type
  const combinedAccounts = {
    data: joinedAccounts,
    isSuccess: isDataLoaded,
    isLoading: plaidAccountQuery.isLoading || manualAccountQuery.isLoading,
    isError: plaidAccountQuery.isError || manualAccountQuery.isError,
  };

  const onCreateAccount = (name: string) => accountMutation.mutate({ name });
  const onCreateCategory = (name: string) => categoryMutation.mutate({ name });

  const isPending =
    createMutation.isPending ||
    categoryMutation.isPending ||
    accountMutation.isPending;
  const isLoading = categoryQuery.isLoading || combinedAccounts.isLoading;

  const onSubmit = (values: FormValues) => {
    createMutation.mutate(values, {
      onSuccess: () => {
        onClose();
      },
    });
  };

  return (
    <Sheet open={isOpen || isPending} onOpenChange={(open) => {
        onClose();
        setTimeout(() => {
          if (!open) {
            document.body.style.pointerEvents = ''
          }
        }, 100)
      }}>
      <SheetContent className="space-y-4">
        <SheetHeader>
          <SheetTitle>New Transaction</SheetTitle>

          <SheetDescription>Add a new transaction.</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TransactionForm
            onSubmit={onSubmit}
            disabled={isPending}
            categoryOptions={categoryOptions}
            onCreateCategory={onCreateCategory}
            accountOptions={accountOptions}
            onCreateAccount={onCreateAccount}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
