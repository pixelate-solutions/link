import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono";

// Ensure the Category interface includes all properties
export interface Category {
  id: string;
  name: string | null;
  budgetAmount: string | null; // Include this field
}

export const useGetCategories = () => {
  const query = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const response = await client.api.categories.$get();

      if (!response.ok) throw new Error("Failed to fetch categories.");

      const { data } = await response.json();

      // Ensure the API response matches the expected structure
      return data.map((category: any) => ({
        id: category.id,
        name: category.name,
        budgetAmount: category.budgetAmount,
        type: category.type,
      }));
    },
  });

  return query;
};
