import { Loader2 } from "lucide-react";
import { z } from "zod";
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
import { useDeleteRecurringTransaction } from "@/features/transactions/api/use-delete-recurring-transaction";
import { useEditRecurringTransaction } from "@/features/transactions/api/use-edit-recurring-transaction";
import { useGetRecurringTransaction } from "@/features/transactions/api/use-get-recurring-transaction";
import { useConfirm } from "@/hooks/use-confirm";
import { RecurringTransactionForm } from "./recurring-transaction-form";

// Schema for form validation
const formSchema = z.object({
  date: z.coerce.date(),
  userId: z.string(),
  accountId: z.string().nullable().optional(),
  categoryName: z.string().nullable(),
  categoryId: z.string().nullable().optional(),
  name: z.string(),
  merchantName: z.string().nullable().optional(),
  frequency: z.string(),
  averageAmount: z.string(),
  lastAmount: z.string().nullable().optional(),
  isActive: z.string(),
  notes: z.string().nullable().optional(),
});

type FormValues = z.input<typeof formSchema>;

type EditRecurringTransactionSheetProps = {
  id: string;
  onClose: () => void;
};

export const EditRecurringTransactionSheet = ({ id, onClose }: EditRecurringTransactionSheetProps) => {
  const [ConfirmDialog, confirm] = useConfirm(
    "Are you sure?",
    "You are about to delete this recurring transaction."
  );

  const recurringTransactionQuery = useGetRecurringTransaction(id); // Fetch the recurring transaction
  const editMutation = useEditRecurringTransaction(id); // Edit recurring mutation
  const deleteMutation = useDeleteRecurringTransaction(id); // Delete recurring mutation

  const categoryMutation = useCreateCategory();
  const categoryQuery = useGetCategories();
  const accountMutation = useCreateAccount();
  const plaidAccountsQuery = useGetAccounts(true);
  const nonPlaidAccountsQuery = useGetAccounts(false);

  const accountOptions = [
    ...(plaidAccountsQuery.data ?? []),
    ...(nonPlaidAccountsQuery.data ?? []),
  ].map(account => ({
    label: account.name ?? "Unnamed Account",
    value: account.id,
  }));

  const categoryOptions = (categoryQuery.data ?? []).map(category => ({
    label: category.name ?? "",
    value: category.id,
  }));

  const onSubmit = (values: FormValues) => {
    editMutation.mutate(
      {
        ...values,
        userId: recurringTransactionQuery.data?.userId || "",
        categoryName: recurringTransactionQuery.data?.categoryName || "",
        merchantName: recurringTransactionQuery.data?.merchantName || "",
        lastAmount: recurringTransactionQuery.data?.lastAmount || "0",
      },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  const handleSubmit = (values: FormValues) => {
    onSubmit({
      ...values,
      userId: values.userId || recurringTransactionQuery.data?.userId || "",
      categoryName: values.categoryName || "Uncategorized",
      merchantName: values.merchantName || "Unknown",
      lastAmount: values.lastAmount || "0",
      accountId: values.accountId || "",
    });
    window.location.reload()
  };

  const defaultValues = recurringTransactionQuery.data
    ? {
        accountId: recurringTransactionQuery.data.accountId || "",
        categoryId: recurringTransactionQuery.data.categoryId || "",
        averageAmount: recurringTransactionQuery.data.averageAmount.toString(),
        lastAmount: recurringTransactionQuery.data.lastAmount?.toString() || "",
        date: new Date(),
        name: recurringTransactionQuery.data.name || "",
        merchantName: recurringTransactionQuery.data.merchantName || "",
        frequency: recurringTransactionQuery.data.frequency || "",
        isActive: recurringTransactionQuery.data.isActive.toString(),
        notes: recurringTransactionQuery.data.notes || "",
        userId: recurringTransactionQuery.data.userId || "",
        categoryName: recurringTransactionQuery.data.categoryName || "",
      }
    : {
        accountId: "",
        categoryId: "",
        averageAmount: "",
        lastAmount: "",
        date: new Date(),
        name: "",
        merchantName: "",
        frequency: "",
        isActive: "true",
        notes: "",
        userId: "",
        categoryName: "",
      };

  const onDelete = async () => {
    const ok = await confirm();
    if (ok) {
      deleteMutation.mutate(undefined, { onSuccess: onClose });
    }
  };

  return (
    <>
      <ConfirmDialog />
      <Sheet open={true} onOpenChange={(open) => {
        onClose();
        setTimeout(() => {
          if (!open) {
            document.body.style.pointerEvents = ''
          }
        }, 100)
      }}>
        <SheetContent className="space-y-4">
          <SheetHeader>
            <SheetTitle>Edit Recurring Transaction</SheetTitle>
            <SheetDescription>Edit an existing recurring transaction.</SheetDescription>
          </SheetHeader>

          {recurringTransactionQuery.isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <RecurringTransactionForm
              id={id}
              defaultValues={defaultValues}
              onSubmit={handleSubmit}
              disabled={editMutation.isPending || recurringTransactionQuery.isLoading}
              categoryOptions={categoryOptions}
              accountOptions={accountOptions}
              onCreateCategory={name => categoryMutation.mutate({ name })}
              onCreateAccount={name => accountMutation.mutate({ name })}
              onDelete={onDelete}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
