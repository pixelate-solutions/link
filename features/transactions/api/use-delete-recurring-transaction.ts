import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useDeleteRecurringTransaction = (id?: string) => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error>({
    mutationFn: async () => {
      const response = await fetch(`/api/plaid/recurring/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete recurring transaction.");
      }
    },
    onSuccess: () => {
      toast.success("Recurring transaction deleted.");
      // Invalidate the recurring transactions query to ensure refetching
      queryClient.invalidateQueries({ queryKey: ["recurringTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: () => {
      toast.error("Failed to delete recurring transaction.");
    },
  });

  return mutation;
};
