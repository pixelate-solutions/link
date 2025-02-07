"use client";

import { useGetSummary } from "@/features/summary/api/use-get-summary";
import { Chart, ChartLoading } from "./chart";
import { SpendingPie, SpendingPieLoading } from "./spending-pie";
import { BudgetVsSpendingChart } from "./budget-vs-spending-chart";
import { useSearchParams } from "next/navigation";
import {
  differenceInDays,
  endOfToday,
  isFirstDayOfMonth,
  isSameDay,
  lastDayOfMonth,
  parseISO,
  subMonths,
} from "date-fns";
import { formatDateRange } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useGetCategories } from "@/features/categories/api/use-get-categories";

export const DataCharts = () => {
  // Call all hooks unconditionally at the top.
  const searchParams = useSearchParams();
  const { data, isLoading } = useGetSummary();
  const categoriesQuery = useGetCategories();

  // If data is still loading, render the loading state.
  // This early return is safe because all hooks have already been called.

  let from = searchParams.get("from") || "";
  let to = searchParams.get("to") || "";

  if (to === "" || from === "") {
    const today = endOfToday();
    const previousMonthSameDay = subMonths(today, 1);
    from = previousMonthSameDay.toISOString();
    to = today.toISOString();
  }

  // Define interfaces for type safety.
  interface APICategory {
    id: string;
    name: string | null;
    budgetAmount: string | null;
  }

  // Extend the API Category with the new "type" field.
  interface Category extends APICategory {
    type: string;
  }

  interface CategoryTotal {
    categoryId: string;
    categoryName: string;
    totalCost: number;
    totalIncome: number;
    budgetAmount: string | null;
    amountLeftToSpend: string | null;
  }

  interface ResponseType {
    id: string;
    name: string | null;
    type: string;
    totalIncome: string;
    totalCost: string;
    budgetAmount: string;
    amountLeftToSpend: string;
    // Additional flags for our rendering logic.
    isTransfer?: boolean;
    transferMessage?: string;
  }

  const fetchCategoryTotals = async (
    from: string,
    to: string
  ): Promise<CategoryTotal[]> => {
    const response = await fetch(
      `/api/plaid/category-totals?from=${from}&to=${to}`
    );
    if (!response.ok) throw new Error("Failed to fetch category totals.");
    return response.json();
  };

  const totalsQuery = useQuery({
    queryKey: ["categoryTotals", { from, to }],
    queryFn: () => fetchCategoryTotals(from, to),
    enabled: true,
  });

  const categories: Category[] =
    (categoriesQuery.data as unknown as Category[]) || [];

  const fromDate = new Date(parseISO(from));
  fromDate.setUTCHours(12);
  const toDate = new Date(parseISO(to));
  const dateRange = formatDateRange({ to: toDate, from: fromDate });

  const categoriesWithTotals: ResponseType[] = categories.map((category) => {
    if (category.type === "transfer") {
      // For transfer categories, supply empty strings for numeric fields.
      return {
        id: category.id,
        name: category.name,
        type: category.type,
        isTransfer: true,
        transferMessage: "Transfers do not count toward totals",
        totalIncome: "",
        totalCost: "",
        budgetAmount: "",
        amountLeftToSpend: "",
      };
    } else {
      // Determine if the date range is a full month.
      const isFullMonthLocal =
        (isFirstDayOfMonth(fromDate) && isSameDay(toDate, lastDayOfMonth(toDate))) ||
        fromDate.getDate() === toDate.getDate() + 1;

      const monthlyBudget = parseFloat(category.budgetAmount || "0");
      const dayCount = differenceInDays(toDate, fromDate) + 1;
      const adjustedBudgetAmount = isSameDay(fromDate, toDate)
        ? monthlyBudget / 30.44
        : isFullMonthLocal
        ? monthlyBudget
        : (monthlyBudget * dayCount) / 30.44;

      const foundTotals =
        totalsQuery.data?.find((t) => t.categoryId === category.id) || {
          totalIncome: 0,
          totalCost: 0,
        };

      return {
        id: category.id,
        name: category.name,
        type: category.type,
        totalIncome: foundTotals.totalIncome.toFixed(2),
        totalCost: foundTotals.totalCost.toFixed(2),
        budgetAmount: adjustedBudgetAmount.toFixed(2),
        amountLeftToSpend: (adjustedBudgetAmount + foundTotals.totalCost).toFixed(2),
      };
    }
  });

  // Summations (skip transfer rows).
  const sumBudgetAmount = categoriesWithTotals.reduce(
    (sum, item) => (!item.isTransfer ? sum + parseFloat(item.budgetAmount) : sum),
    0
  );
  const sumTotalCost = categoriesWithTotals.reduce(
    (sum, item) => (!item.isTransfer ? sum + parseFloat(item.totalCost) : sum),
    0
  );

  const processedCategories: any = data?.categories?.map((item) => ({
    name: item.name ?? "Unknown",
    value: item.value,
  }));

  // Extract budget and expenses data for the new chart.
  const budgetVsSpendingData =
    data?.days.map((day) => ({
      date: day.date,
      spending: day.expenses,
      budget: day.budget,
    })) || [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-6">
        <div className="col-span-1 lg:col-span-3 xl:col-span-4">
          <ChartLoading />
        </div>
        <div className="col-span-1 lg:col-span-3 xl:col-span-2">
          <SpendingPieLoading />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-6">
      {/* New budget vs spending chart */}
      <div className="col-span-1 lg:col-span-6">
        <BudgetVsSpendingChart
          fullData={data}
          data={budgetVsSpendingData}
          cumulativeBudget={sumBudgetAmount}
        />
      </div>

      <div className="col-span-1 lg:col-span-3 xl:col-span-4">
        <Chart data={data?.days} />
      </div>

      <div className="col-span-1 lg:col-span-3 xl:col-span-2">
        <SpendingPie data={processedCategories} />
      </div>
    </div>
  );
};
