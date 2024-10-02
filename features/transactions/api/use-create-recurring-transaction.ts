// use-create-recurring-transaction.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useCreateRecurringTransaction = () => {
    const queryClient = useQueryClient();

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

    const mutation = useMutation<FormValues, Error, FormValues>({
    mutationFn: async (json: FormValues) => {
        const response = await fetch("/api/plaid/recurring/new", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(json),
        });

        if (!response.ok) {
        throw new Error("Failed to create recurring transaction");
        }

        return response.json();
    },
    onSuccess: () => {
        toast.success("Recurring transaction created.");
        queryClient.invalidateQueries({ queryKey: ["recurringTransactions"] });
    },
    onError: () => {
        toast.error("Failed to create recurring transaction.");
    },
    });


  return mutation;
};
