import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useEditRecurringTransaction = (id?: string) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (json: Record<string, any>) => {
      if (!id) throw new Error("Transaction ID is required.");

      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/recurring/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(json),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to edit recurring transaction.");
      }

      return await response.json();
    },
    onSuccess: () => {
      toast.success("Recurring transaction updated.");
      queryClient.invalidateQueries({ queryKey: ["recurringTransaction", { id }] });
      queryClient.invalidateQueries({ queryKey: ["recurringTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to edit recurring transaction.");
    },
  });

  return mutation;
};
