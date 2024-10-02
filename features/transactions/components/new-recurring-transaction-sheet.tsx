import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCreateAccount } from "@/features/accounts/api/use-create-account";
import { useGetAccounts } from "@/features/accounts/api/use-get-accounts";
import { useCreateCategory } from "@/features/categories/api/use-create-category";
import { useGetCategories } from "@/features/categories/api/use-get-categories";
import { useCreateRecurringTransaction } from "@/features/transactions/api/use-create-recurring-transaction";
import { RecurringTransactionForm } from "./recurring-transaction-form";
import { useUser } from "@clerk/nextjs";

type FormValues = {
    userId: string;
    name: string;
    frequency: string;
    averageAmount: string;
    accountId: string | null;
    categoryId: string | null;
    date: Date;
    isActive: string;
};

type NewRecurringTransactionSheetProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const NewRecurringTransactionSheet = ({
  isOpen,
  onClose,
}: NewRecurringTransactionSheetProps) => {
  const { user } = useUser();

  const createMutation = useCreateRecurringTransaction();
  const categoryMutation = useCreateCategory();
  const categoryQuery = useGetCategories();
  const categoryOptions = (categoryQuery.data ?? []).map((category) => ({
    label: category.name ?? "Unnamed Category",
    value: category.id,
  }));

  const accountMutation = useCreateAccount();
  const plaidAccountQuery = useGetAccounts(true);
  const manualAccountQuery = useGetAccounts(false);
  
  const combinedAccounts = {
    data: [
      ...(plaidAccountQuery.data ?? []),
      ...(manualAccountQuery.data ?? []),
    ],
    isLoading: plaidAccountQuery.isLoading || manualAccountQuery.isLoading,
    isError: plaidAccountQuery.isError || manualAccountQuery.isError,
  };
  
  const accountOptions = combinedAccounts.data.map((account) => ({
    label: account.name ?? "Unnamed Account",
    value: account.id,
  }));

  const onCreateAccount = (name: string) => accountMutation.mutate({ name });
  const onCreateCategory = (name: string) => categoryMutation.mutate({ name });

  const isPending =
    createMutation.isPending ||
    categoryMutation.isPending ||
    accountMutation.isPending;

  const onSubmit = (values: Omit<FormValues, "userId">) => {
    createMutation.mutate({
      ...values,
      userId: user?.id || "", // Add userId separately, not from form values
      accountId: values.accountId || null,
      categoryId: values.categoryId || null,
      date: values.date ?? new Date(),
    }, {
      onSuccess: () => {
        onClose();
      },
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="space-y-4">
        <SheetHeader>
          <SheetTitle>New Recurring Transaction</SheetTitle>
          <SheetDescription>Add a new recurring transaction.</SheetDescription>
        </SheetHeader>

        {combinedAccounts.isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <RecurringTransactionForm
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
