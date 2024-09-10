import { useQuery } from "@tanstack/react-query";

import { client } from "@/lib/hono";
import { convertAmountFromMilliunits } from "@/lib/utils";

export const useGetTransaction = (id?: string) => {
  const query = useQuery({
    enabled: !!id,
    queryKey: ["transaction", { id }],
    queryFn: async () => {
      const response = await client.api.transactions[":id"].$get({
        param: { id },
      });

      if (!response.ok) throw new Error("Failed to fetch transaction.");

      const { data } = await response.json();

      // Ensure amount is a number before passing to convertAmountFromMilliunits
      const amount = Number(data.amount); // Convert amount from string to number

      return {
        ...data,
        amount: convertAmountFromMilliunits(amount),
      };
    },
  });

  return query;
};
