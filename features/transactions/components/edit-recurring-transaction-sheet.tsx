import { ColorRing } from 'react-loader-spinner'
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

const formSchema = z.object({
  name: z.string().min(1, "Transaction name is required"), // Recurring transaction name
  frequency: z.string().min(1, "Frequency is required"), // Frequency of transaction (e.g., monthly, weekly)
  lastAmount: z.string().min(1, "Last amount is required"), // Last transaction amount
  accountId: z.string().nullable().optional(), // Account selection (dropdown)
  categoryId: z.string().nullable().optional(), // Category selection (dropdown)
  date: z.coerce.date().optional(), // Updated to coerce date strings into Date objects
  isActive: z.string(), // Status (active/inactive)
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

  const recurringTransactionQuery = useGetRecurringTransaction(id);
  const editMutation = useEditRecurringTransaction(id);
  const deleteMutation = useDeleteRecurringTransaction(id);

  const categoryMutation = useCreateCategory();
  const categoryQuery = useGetCategories();
  const accountMutation = useCreateAccount();
  const plaidAccountsQuery = useGetAccounts(true);
  const nonPlaidAccountsQuery = useGetAccounts(false);

  // Combine account options from Plaid and non-Plaid accounts
  const accountOptions = [
    ...(plaidAccountsQuery.data ?? []),
    ...(nonPlaidAccountsQuery.data ?? []),
  ].map((account) => ({
    label: account.name ?? "Unnamed Account",
    value: account.id,
  }));

  // Map category data to category options
  const categoryOptions = (categoryQuery.data ?? []).map((category) => ({
    label: category.name ?? "",
    value: category.id, // Use categoryId here
  }));

  // Handle form submission
  const onSubmit = (values: FormValues) => {
    editMutation.mutate(
      {
        ...values,
        userId: recurringTransactionQuery.data?.userId || "",
      },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  // Default form values
  const defaultValues = recurringTransactionQuery.data
    ? {
        accountId: recurringTransactionQuery.data.accountId || "",
        categoryId: recurringTransactionQuery.data.categoryId || "", // Use categoryId here
        lastAmount: recurringTransactionQuery.data.lastAmount?.toString() || "",
        name: recurringTransactionQuery.data.name || "",
        frequency: recurringTransactionQuery.data.frequency || "",
        date: recurringTransactionQuery.data.date ? new Date(recurringTransactionQuery.data.date) : new Date(), // Convert string to Date
        isActive: recurringTransactionQuery.data.isActive.toString(),
      }
    : {
        accountId: "",
        categoryId: "",
        lastAmount: "",
        name: "",
        frequency: "",
        date: new Date(), // Default to current date
        isActive: "true",
      };

  // Handle deletion of the recurring transaction
  const onDelete = async () => {
    const ok = await confirm();
    if (ok) {
      deleteMutation.mutate(undefined, { onSuccess: onClose });
    }
  };

  return (
    <>
      <ConfirmDialog />
      <Sheet
        open={true}
        onOpenChange={(open) => {
          onClose();
          setTimeout(() => {
            if (!open) {
              document.body.style.pointerEvents = "";
            }
          }, 100);
        }}
      >
        <SheetContent className="space-y-4">
          <SheetHeader>
            <SheetTitle>Edit Recurring Transaction</SheetTitle>
            <SheetDescription>Edit the details of this recurring transaction.</SheetDescription>
          </SheetHeader>

          {recurringTransactionQuery.isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <ColorRing
                visible={true}
                height="60"
                width="60"
                ariaLabel="color-ring-loading"
                wrapperStyle={{}}
                wrapperClass="color-ring-wrapper"
                colors={['#3B82F6', '#6366F1', '#7C3AED', '#9333EA', '#A855F7']}
              />
            </div>
          ) : (
            <RecurringTransactionForm
              id={id}
              defaultValues={defaultValues}
              onSubmit={onSubmit}
              disabled={editMutation.isPending || recurringTransactionQuery.isLoading}
              categoryOptions={categoryOptions}
              accountOptions={accountOptions}
              onCreateCategory={(name) => categoryMutation.mutate({ name })}
              onCreateAccount={(name) => accountMutation.mutate({ name })}
              onDelete={onDelete}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
