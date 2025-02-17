"use client";

import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Data Table & UI
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Hooks
import { useBulkDeleteCategories } from "@/features/categories/api/use-bulk-delete-categories";
import { useGetCategories } from "@/features/categories/api/use-get-categories";
import { useNewCategory } from "@/features/categories/hooks/use-new-category";

import { ColorRing } from 'react-loader-spinner'

// Date utilities
import {
  differenceInDays,
  parseISO,
  isFirstDayOfMonth,
  lastDayOfMonth,
  isSameDay,
  endOfToday,
  subMonths,
  isSameMonth,
  isLastDayOfMonth,
  getDate,
} from "date-fns";

// Styles & columns
import "/styles.css";
import { columns } from "./columns";
import { Montserrat } from "next/font/google";
import { cn, formatDateRange } from "@/lib/utils";

// Summary / analytics
import { useGetSummary } from "@/features/summary/api/use-get-summary";
import { DataCard, ExpensesDataCard } from "@/components/data-card";
import { FaArrowTrendDown, FaArrowTrendUp, FaPiggyBank } from "react-icons/fa6";
import { SpendingPie } from "@/components/spending-pie";
import { BudgetVsSpendingChart } from "@/components/budget-vs-spending-chart";

// Mobile version
import { MobileCategories } from "@/components/mobile-categories";
import { useUser } from "@clerk/nextjs";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

// -----------------------------------------------------------------
// Define our local types
// -----------------------------------------------------------------

// (Assume your API originally returns categories without the `type` field.)
interface APICategory {
  id: string;
  name: string | null;
  budgetAmount: string | null;
}

// Extend the API Category with the new "type" field.
interface Category extends APICategory {
  type: string;
}

// This is the type expected by your DataTable. All fields must be strings.
interface ResponseType {
  id: string;
  name: string | null;
  type: string;
  totalIncome: string;
  totalCost: string;
  budgetAmount: string;
  amountLeftToSpend: string;
  // Additional flags for our rendering logic
  isTransfer?: boolean;
  transferMessage?: string;
}

// Define the type for category totals returned from the API.
interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  totalCost: number;
  totalIncome: number;
  budgetAmount: string | null;
  amountLeftToSpend: string | null;
}

// API fetcher for category totals
const fetchCategoryTotals = async (
  from: string,
  to: string
): Promise<CategoryTotal[]> => {
  const response = await fetch(`/api/plaid/category-totals?from=${from}&to=${to}`);
  if (!response.ok) throw new Error("Failed to fetch category totals.");
  return response.json();
};

// -----------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------
export default function CategoriesPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user?.id) {
      fetch("/api/categories/clear-default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then(() => {
          // Invalidate the categories query so that it refetches
          queryClient.invalidateQueries({ queryKey: ["categories"] });
        })
        .catch((error) => {
          console.error("Error checking default categories:", error);
        });
    }
  }, [user, queryClient]);


  // ------------------------------
  // 1) Track window width
  // ------------------------------
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 9999
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ------------------------------
  // 2) Get summary data
  // ------------------------------
  const { data: rawData, isLoading: summaryLoading } = useGetSummary();
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

  // Process data for charts
  const processedCategories = data?.categories?.map((item) => ({
    name: item.name ?? "Unknown",
    value: item.value,
  }));

  const budgetVsSpendingData =
    data?.days.map((day) => ({
      date: day.date,
      spending: day.expenses,
      budget: day.budget,
    })) || [];

  // Additional calculations
  const mainCumulativeSpending = data.expensesAmount;
  let isFullMonth: boolean;

  if (data.days.length === 0) {
    isFullMonth = false;
  } else {
    const firstDay = data.days[0];
    const lastDay = data.days[data.days.length - 1];
    const isSameDayOfMonth = getDate(new Date(firstDay.date)) === getDate(new Date(lastDay.date));
    isFullMonth =
      isSameDayOfMonth ||
      (isSameMonth(new Date(firstDay.date), new Date(lastDay.date)) &&
        isFirstDayOfMonth(new Date(firstDay.date)) &&
        isLastDayOfMonth(new Date(lastDay.date)));
  }

  const cumulativeBudget = isFullMonth
    ? data.monthlyBudget
    : data.days.reduce((sum, entry) => entry.budget, 0);

  const budgetLeft = cumulativeBudget + mainCumulativeSpending;

  // ------------------------------
  // 3) Handle category data
  // ------------------------------
  const searchParams = useSearchParams();
  let from = searchParams.get("from") || "";
  let to = searchParams.get("to") || "";

  const newCategory = useNewCategory();
  const deleteCategories = useBulkDeleteCategories();

  // IMPORTANT: Call useGetCategories first...
  const categoriesQuery = useGetCategories();

  // ...then cast its data to our extended Category type.
  const categories: Category[] = (categoriesQuery.data as unknown as Category[]) || [];

  // Helper to adjust date strings
  const subtractDayFromDate = (dateString: string): string => {
    const date = parseISO(dateString);
    const newDate = new Date(date);
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, "0");
    const day = String(newDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  if (to !== "" && from !== "") {
    to = subtractDayFromDate(to);
    from = subtractDayFromDate(from);
  }

  // ------------------------------
  // 4) Fetch category totals
  // ------------------------------
  const totalsQuery = useQuery({
    queryKey: ["categoryTotals", { from, to }],
    queryFn: () => fetchCategoryTotals(from, to),
    enabled: true,
  });

  // ------------------------------
  // 5) Handle loading states
  // ------------------------------
  const isDisabled =
    categoriesQuery.isLoading ||
    deleteCategories.isPending ||
    totalsQuery.isLoading ||
    summaryLoading;

  if (categoriesQuery.isLoading || totalsQuery.isLoading || summaryLoading) {
    return (
      <div className={cn("mx-auto -mt-6 w-full max-w-screen-2xl pb-10", montserratP.className)}>
        <Card className="border-none drop-shadow-sm">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            <div className="flex h-[500px] w-full items-center justify-center">
              <ColorRing
                visible={true}
                height="80"
                width="80"
                ariaLabel="color-ring-loading"
                wrapperStyle={{}}
                wrapperClass="color-ring-wrapper"
                colors={['#3B82F6', '#6366F1', '#7C3AED', '#9333EA', '#A855F7']}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If no "from"/"to" were passed, default to last 30 days.
  if (to === "" || from === "") {
    const today = endOfToday();
    const previousMonthSameDay = subMonths(today, 1);
    from = previousMonthSameDay.toISOString();
    to = today.toISOString();
  }

  const fromDate = new Date(parseISO(from));
  fromDate.setUTCHours(12);
  const toDate = new Date(parseISO(to));
  const dateRange = formatDateRange({ to: toDate, from: fromDate });

  // ------------------------------
  // 6) Transform categories into rows for DataTable
  // ------------------------------
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
        fromDate.getDate() === (toDate.getDate() + 1);

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

  // Summations (skip transfer rows)
  const sumBudgetAmount = categoriesWithTotals.reduce(
    (sum, item) => (!item.isTransfer ? sum + parseFloat(item.budgetAmount) : sum),
    0
  );
  const sumTotalCost = categoriesWithTotals.reduce(
    (sum, item) => (!item.isTransfer ? sum + parseFloat(item.totalCost) : sum),
    0
  );

  // ------------------------------
  // 7) Render the page
  // ------------------------------
  return (
    <div className={cn("mx-auto -mt-6 w-full max-w-screen-2xl pb-10", montserratP.className)}>
      {/* Summary Cards */}
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
          title={(sumBudgetAmount + sumTotalCost) >= 0 ? "Remaining" : "Over budget"}
          value={sumBudgetAmount + sumTotalCost}
          percentageChange={12345}
          icon={FaPiggyBank}
          variant="default"
          dateRange={dateRange || ""}
        />
      </div>

      {/* Charts */}
      <div className="flex flex-wrap lg:flex-nowrap gap-4">
        <div className="w-full lg:w-3/4">
          <BudgetVsSpendingChart
            fullData={data}
            data={budgetVsSpendingData}
            cumulativeBudget={sumBudgetAmount}
          />
        </div>
        <div className="w-full lg:w-1/4">
          <SpendingPie data={processedCategories} />
        </div>
      </div>

      {/* Categories Table/Card */}
      <Card className="border-2 drop-shadow-md mt-6">
        <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="line-clamp-1 text-xl">Set Categories</CardTitle>
          <Button size="sm" onClick={newCategory.onOpen}>
            <Plus className="mr-2 size-4" /> Add new
          </Button>
        </CardHeader>
        <CardContent>
          {windowWidth >= 1024 ? (
            <DataTable
              filterKey="name"
              columns={columns}
              data={categoriesWithTotals}
              onDelete={(row) => {
                const ids = row.map((r) => r.original.id);
                deleteCategories.mutate({ ids });
              }}
              disabled={isDisabled}
            />
          ) : (
            <MobileCategories categories={categoriesWithTotals} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
