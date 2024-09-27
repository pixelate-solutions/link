import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono";

type CategoryData = {
  id: string;
  name: string;
  budgetAmount: string;
};

export const useGetCategory = (id?: string) => {
  return useQuery<CategoryData | null, Error>({
    enabled: !!id,
    queryKey: ["category", { id }],
    queryFn: async () => {
      const response = await client.api.categories[":id"].$get({
        param: { id },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch category.");
      }

      const { data } = await response.json();

      return data as CategoryData;
    },
  });
};
