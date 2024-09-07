import { useQuery } from "@tanstack/react-query";

import { client } from "@/lib/hono";

export const useGetAccounts = (isFromPlaid: boolean) => {
  const query = useQuery({
    queryKey: ["accounts", { isFromPlaid }],
    queryFn: async () => {
      const response = await client.api.accounts.$get({
        query: { isFromPlaid: isFromPlaid.toString() },
      });

      if (!response.ok) throw new Error("Failed to fetch accounts.");

      const { data } = await response.json();

      return data;
    },
  });

  return query;
};

