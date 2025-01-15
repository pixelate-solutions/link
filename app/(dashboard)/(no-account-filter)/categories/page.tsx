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
import { differenceInDays, parseISO, isFirstDayOfMonth, lastDayOfMonth, isSameDay, subDays, endOfToday, subMonths, isSameMonth, isLastDayOfMonth, getDate } from 'date-fns';
import "/styles.css"
import { columns } from "./columns";
import { Montserrat } from "next/font/google";
import { cn, formatDateRange } from "@/lib/utils";
import { useGetSummary } from "@/features/summary/api/use-get-summary";
import { DataCard, ExpensesDataCard } from "@/components/data-card";
import { FaArrowTrendDown, FaArrowTrendUp, FaPiggyBank } from "react-icons/fa6";
import { SpendingPie } from "@/components/spending-pie";
import { BudgetVsSpendingChart } from "@/components/budget-vs-spending-chart";

const montserratP = Montserrat({
  weight: "500",
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

type BudgetVsSpendingChartProps = {
  data?: {
    monthlyBudget: number;
    incomeAmount: number;
    expensesAmount: number;
    remainingAmount: number;
    categories: {
      value: number;
      name: string | null;
    }[];
    days: {
      income: number;
      expenses: number;
      budget: number;
      date: string;
    }[];
    remainingChange: number;
    incomeChange: number;
    expensesChange: number;
  };
};

const CategoriesPage = () => {
  const { data: rawData, isLoading } = useGetSummary();
  
  // Provide a default value to ensure `data` is never undefined
  const data = rawData ?? {
    monthlyBudget: 0,
    incomeAmount: 0,
    expensesAmount: 0,
    remainingAmount: 0,
    categories: [],
    days: [],
    remainingChange: 0,
    incomeChange: 0,
    expensesChange: 0,
  };

  const processedCategories = data?.categories?.map(item => ({
    name: item.name ?? 'Unknown',
    value: item.value,
  }));

  const budgetVsSpendingData = data?.days.map(day => ({
    date: day.date,
    spending: day.expenses,
    budget: day.budget,
  })) || [];

  const mainCumulativeSpending = data.expensesAmount;

  let isFullMonth;
  if (data.days.length === 0) {
    isFullMonth = false;
  } else {
    const firstDay = data.days[0];
    const lastDay = data.days[data.days.length - 1];

    const isSameDayOfMonth = getDate(new Date(firstDay.date)) === getDate(new Date(lastDay.date));
    isFullMonth =
      isSameDayOfMonth ||
      (isSameMonth(
        new Date(firstDay.date),
        new Date(lastDay.date)
      ) &&
        isFirstDayOfMonth(new Date(firstDay.date)) &&
        isLastDayOfMonth(new Date(lastDay.date)));
  }

  const cumulativeBudget = isFullMonth
    ? data.monthlyBudget
    : data.days.reduce((sum, entry) => entry.budget, 0);


  // Calculate the remaining budget
  const budgetLeft = cumulativeBudget + mainCumulativeSpending;

  const searchParams = useSearchParams();
  let from = searchParams.get("from") || "";
  let to = searchParams.get("to") || "";

  let dateRange;

  const newCategory = useNewCategory();
  const deleteCategories = useBulkDeleteCategories();

  const categoriesQuery = useGetCategories();
  const categories = categoriesQuery.data || [];

  const subtractDayFromDate = (dateString: string): string => {
    let date = parseISO(dateString);
    let newDate = new Date(date);

    // Format the adjusted date back to YYYY-MM-DD
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(newDate.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  if (to !== "" && from !== "") {
    to = subtractDayFromDate(to);
    from = subtractDayFromDate(from);
  }

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
    const fromDate = new Date(parseISO(from));
    fromDate.setUTCHours(12);
    const toDate = new Date(parseISO(to));

    dateRange = formatDateRange({ to: toDate, from: fromDate });

    // Check if fromDate is the first day and toDate is the last day of the same month
    const isFullMonth = (isFirstDayOfMonth(fromDate) && isSameDay(toDate, lastDayOfMonth(toDate)) || fromDate.getDate() === toDate.getDate());

    // If it's a full month, don't adjust the budgetAmount, just show the monthly value
    const adjustedBudgetAmount = isSameDay(fromDate, toDate)
    ? parseFloat(category.budgetAmount || "0") / 30.44 // Single day's budget
    : isFullMonth
    ? parseFloat(category.budgetAmount || "0") // Full monthly budget
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

  const sumBudgetAmount = transformedData.reduce(
    (sum, item) => sum + parseFloat(item.budgetAmount),
    0
  );

  const sumTotalCost = transformedData.reduce(
    (sum, item) => sum + parseFloat(item.totalCost),
    0
  );

  return (
    <div className={cn("mx-auto -mt-6 w-full max-w-screen-2xl pb-10", montserratP.className)}>
      <div className="mb-8 grid grid-cols-1 gap-8 pb-2 lg:grid-cols-3">
        <ExpensesDataCard
          title="Expenses"
          value={sumTotalCost}
          percentageChange={12345}
          icon={FaArrowTrendDown}
          variant="danger"
          dateRange={dateRange || ""}
        />
        <DataCard
          title="Budgeted"
          value={sumBudgetAmount}
          percentageChange={12345}
          icon={FaArrowTrendUp}
          variant="success"
          dateRange={dateRange || ""}
        />
        <ExpensesDataCard
        title={`${(sumBudgetAmount + sumTotalCost) >= 0 ? "Remaining" : "Over budget"}`}
        value={sumBudgetAmount + sumTotalCost}
        percentageChange={12345}
        icon={FaPiggyBank}
        variant="default"
        dateRange={dateRange || ""}
      />
      </div>
      <div className="flex flex-wrap lg:flex-nowrap gap-4">
        <div className="w-full lg:w-3/4">
          <BudgetVsSpendingChart fullData={data} data={budgetVsSpendingData} />
        </div>
        <div className="w-full lg:w-1/4">
          <SpendingPie data={processedCategories} />
        </div>
      </div>
      <Card className="border-none drop-shadow-sm">
        <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="line-clamp-1 text-xl">
            Set Categories
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
