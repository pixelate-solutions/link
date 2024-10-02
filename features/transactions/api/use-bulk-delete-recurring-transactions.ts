import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useBulkDeleteRecurringTransactions = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (json: { ids: string[] }) => {
      const response = await fetch("/api/plaid/recurring/bulk-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(json),
      });

      if (!response.ok) {
        throw new Error("Failed to delete recurring transactions.");
      }

      return await response.json();
    },
    onSuccess: () => {
      toast.success("Recurring transaction(s) deleted.");
      queryClient.invalidateQueries({ queryKey: ["recurringTransactions"] });
    },
    onError: () => {
      toast.error("Failed to delete recurring transaction(s).");
    },
  });

  return mutation;
};
