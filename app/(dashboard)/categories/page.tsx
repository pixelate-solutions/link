"use client";

import { Loader2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBulkDeleteCategories } from "@/features/categories/api/use-bulk-delete-categories";
import { useGetCategories } from "@/features/categories/api/use-get-categories";
import { useNewCategory } from "@/features/categories/hooks/use-new-category";
import { differenceInDays, parseISO, isFirstDayOfMonth, lastDayOfMonth, isSameDay, subDays, endOfToday, subMonths } from 'date-fns';
import "/styles.css"
import { columns } from "./columns";
import { Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";

const montserratP = Montserrat({
  weight: "600",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

// Define the type for the category totals
const fetchCategoryTotals = async (from: string, to: string): Promise<CategoryTotal[]> => {
  const response = await fetch(`/api/plaid/category-totals?from=${from}&to=${to}`);
  if (!response.ok) throw new Error("Failed to fetch category totals.");
  return response.json();
};

// Update the Category type to include budget_amount
interface Category {
  id: string;
  name: string | null;
  budgetAmount: string | null; // Include this field
}

// Define the type for category totals
interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  totalCost: number;
  totalIncome: number;
  budgetAmount: string | null; // Optional
  amountLeftToSpend: string | null; // Optional, computed based on the budget
}

const CategoriesPage = () => {
  const searchParams = useSearchParams();
  let from = searchParams.get("from") || "";
  let to = searchParams.get("to") || "";

  const newCategory = useNewCategory();
  const deleteCategories = useBulkDeleteCategories();

  const categoriesQuery = useGetCategories();
  const categories = categoriesQuery.data || [];

  // Fetch category totals every time the page loads
  const totalsQuery = useQuery({
    queryKey: ["categoryTotals", { from, to }],
    queryFn: () => fetchCategoryTotals(from, to),
    enabled: true, // Ensure the query runs on every page load
  });

  const isDisabled = categoriesQuery.isLoading || deleteCategories.isPending || totalsQuery.isLoading;

  if (categoriesQuery.isLoading || totalsQuery.isLoading) {
    return (
      <div className={cn("mx-auto -mt-6 w-full max-w-screen-2xl pb-10", montserratP.className)}>
        <Card className="border-none drop-shadow-sm">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>

          <CardContent>
            <div className="flex h-[500px] w-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-slate-300" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const categoriesWithTotals = categories.map(category => {
    if (to === "" || from === "") {
      const today = endOfToday();  // Get today's date
      const previousMonthSameDay = subMonths(today, 1);  // Get the same day in the previous month

      const newFrom = previousMonthSameDay.toISOString();  // Convert to ISO format
      const newTo = today.toISOString();  // Today's date in ISO format

      from = newFrom;
      to = newTo;
    }
    const fromDate = subDays(parseISO(from), 1);
    const toDate = subDays(parseISO(to), 1); // Subtract one day from toDate

    // Check if fromDate is the first day and toDate is the last day of the same month
    const isFullMonth = (isFirstDayOfMonth(fromDate) && isSameDay(toDate, lastDayOfMonth(toDate)) || fromDate.getDate() === toDate.getDate());

    // If it's a full month, don't adjust the budgetAmount, just show the monthly value
    const adjustedBudgetAmount = isFullMonth
      ? parseFloat(category.budgetAmount || "0")
      : (parseFloat(category.budgetAmount || "0") * (differenceInDays(toDate, fromDate) + 1) / 30.44);

    // Find the total based on categoryId
    const total = totalsQuery.data?.find(total => total.categoryId === category.id) || { totalIncome: 0, totalCost: 0 };

    return {
      id: category.id,
      name: category.name,
      totalIncome: total.totalIncome.toFixed(2), // Convert to string with 2 decimal places
      totalCost: total.totalCost.toFixed(2), // Convert to string with 2 decimal places
      budgetAmount: adjustedBudgetAmount.toFixed(2), // Adjusted budget per the precise number of months
      amountLeftToSpend: (adjustedBudgetAmount + total.totalCost).toFixed(2), // Ensure this is a number and convert to string
    };
  });

  const transformedData = categoriesWithTotals.map((category) => ({
    ...category,
    budgetAmount: category.budgetAmount ?? "0", // Ensure budgetAmount is included
  }));

  return (
    <div className={cn("mx-auto -mt-6 w-full max-w-screen-2xl pb-10", montserratP.className)}>
      <Card className="border-none drop-shadow-sm">
        <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="line-clamp-1 text-xl">
            Categories Page
          </CardTitle>

          <Button size="sm" onClick={newCategory.onOpen}>
            <Plus className="mr-2 size-4" /> Add new
          </Button>
        </CardHeader>

        <CardContent>
          <DataTable
            filterKey="name"
            columns={columns}
            data={transformedData}
            onDelete={(row) => {
              const ids = row.map((r) => r.original.id);
              deleteCategories.mutate({ ids });
            }}
            disabled={isDisabled}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default CategoriesPage;
