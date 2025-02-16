import { zodResolver } from "@hookform/resolvers/zod";
import { Trash } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AmountInput } from "@/components/amount-input";
import { Select } from "@/components/select";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/date-picker";

// Define the schema with Zod
const formSchema = z.object({
  name: z.string().min(1, "Transaction name is required"), // Recurring transaction name
  frequency: z.string().min(1, "Frequency is required"), // Frequency of transaction (e.g., monthly, weekly)
  lastAmount: z.string().min(1, "Last amount is required"), // Last transaction amount
  accountId: z.string().nullable().optional(), // Account selection (dropdown)
  categoryId: z.string().nullable().optional(), // Category selection (dropdown)
  date: z.coerce.date().optional(), // Coerce date strings into Date objects
  isActive: z.string(), // Status (active/inactive)
});

type FormValues = {
  name: string;
  frequency: string;
  lastAmount: string;
  accountId: string | null;
  categoryId: string | null;
  date: Date;
  isActive: string;
};

type RecurringTransactionFormProps = {
  id?: string;
  defaultValues?: FormValues;
  onSubmit: (values: FormValues) => void;
  onDelete?: () => void;
  disabled?: boolean;
  accountOptions: { label: string; value: string }[];
  categoryOptions: { label: string; value: string }[];
  onCreateCategory: (name: string) => void;
  onCreateAccount: (name: string) => void;
};

export const RecurringTransactionForm = ({
  id,
  defaultValues,
  onSubmit,
  onDelete,
  disabled,
  accountOptions,
  categoryOptions,
  onCreateCategory,
  onCreateAccount,
}: RecurringTransactionFormProps) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit(values);
  });

  const handleDelete = () => {
    onDelete?.();
  };

  return (
    <Form {...form}>
      <form
        onSubmit={handleSubmit} // Use handleSubmit from react-hook-form
        autoCapitalize="off"
        autoComplete="off"
        className="space-y-4 pt-4"
      >
        {/* Transaction Name */}
        <FormField
          name="name"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Transaction Name</FormLabel>
              <FormControl>
                <Input
                  disabled={disabled}
                  placeholder="Enter the transaction name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Account */}
        <FormField
          name="accountId"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account</FormLabel>
              <FormControl>
                <Select
                  placeholder="Select an account"
                  options={accountOptions}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disabled}
                  onCreate={onCreateAccount} // Allow creating a new account
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Category */}
        <FormField
          name="categoryId"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <Select
                  placeholder="Select a category"
                  options={categoryOptions}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disabled}
                  onCreate={onCreateCategory} // Allow creating a new category
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Frequency */}
        <FormField
          name="frequency"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Frequency</FormLabel>
              <FormControl>
                <Input
                  disabled={disabled}
                  placeholder="Enter the frequency (e.g., monthly)"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Last Amount */}
        <FormField
          name="lastAmount"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last Amount</FormLabel>
              <FormControl>
                <AmountInput
                  {...field}
                  disabled={disabled}
                  placeholder="Enter the last amount"
                  value={field.value || ""} // Ensure string
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Date */}
        <FormField
          name="date"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last Date</FormLabel>
              <FormControl>
                <DatePicker
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Status (Active/Inactive) */}
        <FormField
          name="isActive"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <FormControl>
                <Select
                  placeholder="Select status"
                  options={[
                    { label: "Active", value: "true" },
                    { label: "Inactive", value: "false" },
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button className="w-full" disabled={disabled}>
          {id ? "Save changes" : "Create recurring transaction"}
        </Button>

        {!!id && (
          <Button
            type="button"
            disabled={disabled}
            onClick={handleDelete}
            className="w-full"
            variant="outline"
          >
            <Trash className="mr-2 size-4" />
            Delete transaction
          </Button>
        )}
      </form>
    </Form>
  );
};
