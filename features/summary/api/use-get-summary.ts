import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { client } from "@/lib/hono";

export const useGetSummary = () => {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const accountId = searchParams.get("accountId") || "";

  const query = useQuery({
    queryKey: ["summary", { from, to, accountId }],
    queryFn: async () => {
      const response = await client.api.summary.$get({
        query: {
          from,
          to,
          accountId,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch summary.");

      const { data } = await response.json();

      return {
        ...data,
        incomeAmount: data.incomeAmount,
        expensesAmount: data.expensesAmount,
        remainingAmount: data.remainingAmount,
        categories: data.categories.map((category) => ({
          ...category,
          value: category.value,
        })),
        days: data.days.map((day) => ({
          ...day,
          income: day.income,
          expenses: day.expenses,
          budget: day.budget,
        })),
      };
    },
  });

  return query;
};