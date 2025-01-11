import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono";

type Account = {
  id: string;
  name: string;
  category: string;
  currentBalance: string;
  availableBalance: string;
};

export const useGetAccount = (id?: string) => {
  const query = useQuery({
    enabled: !!id,
    queryKey: ["account", { id }],
    queryFn: async () => {
      const response = await client.api.accounts[":id"].$get({
        param: { id },
      });

      if (!response.ok) throw new Error("Failed to fetch account.");

      const { data } = await response.json();
      return data as Account;
    },
  });

  return query;
};
