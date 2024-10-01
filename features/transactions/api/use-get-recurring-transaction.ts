import { useQuery } from "@tanstack/react-query";

export const useGetRecurringTransaction = (id?: string) => {
  const query = useQuery({
    enabled: !!id,
    queryKey: ["recurring", { id }],
    queryFn: async () => {
      const response = await fetch(`/api/plaid/recurring/${id}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch recurring transaction.");
      }

      const { data } = await response.json();

      const averageAmount = data.averageAmount;

      return {
        ...data,
        averageAmount: averageAmount,
      };
    },
  });

  return query;
};
