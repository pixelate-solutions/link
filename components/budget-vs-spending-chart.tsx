import {
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  format,
  differenceInDays,
  isSameMonth,
  getDate,
  isFirstDayOfMonth,
  isLastDayOfMonth,
  subDays,
  endOfToday,
  isSameDay,
  subMonths,
  lastDayOfMonth,
  addDays
} from 'date-fns';
import { useEffect, useState } from 'react';
import { FileSearch } from 'lucide-react';
import { CountUp } from './count-up';
import { formatCurrency, formatDateRange } from "@/lib/utils";
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useGetCategories } from '@/features/categories/api/use-get-categories';

type BudgetVsSpendingChartProps = {
  data: {
    date: string;
    spending: number;
    budget: number;
  }[];
  fullData?: {
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
  cumulativeBudget?: number;
};

interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  totalCost: number;
  totalIncome: number;
  budgetAmount: string | null; // Optional
  amountLeftToSpend: string | null; // Optional, computed based on the budget
}

export const BudgetVsSpendingChart = ({ data, fullData }: BudgetVsSpendingChartProps) => {
  const searchParams = useSearchParams();
  let from = searchParams.get("from") || "";
  let to = searchParams.get("to") || "";

  let dateRange: string | undefined;

  const fetchCategoryTotals = async (from: string, to: string): Promise<CategoryTotal[]> => {
    const response = await fetch(`/api/plaid/category-totals?from=${from}&to=${to}`);
    if (!response.ok) throw new Error("Failed to fetch category totals.");
    return response.json();
  };

  const categoriesQuery = useGetCategories();
  const categories = categoriesQuery.data || [];

  const totalsQuery = useQuery({
    queryKey: ["categoryTotals", { from, to }],
    queryFn: () => fetchCategoryTotals(from, to),
    enabled: true,
  });

  const categoriesWithTotals = categories.map((category: any) => {
    if (to === "" || from === "") {
      const today = endOfToday();
      const previousMonthSameDay = subMonths(today, 1);
      const newFrom = addDays(previousMonthSameDay, 1).toISOString();
      const newTo = today.toISOString();
      from = newFrom;
      to = newTo;
    }
    const fromDate = subDays(new Date(from), 0);
    const toDate = subDays(new Date(to), 0);
    dateRange = formatDateRange({ to: toDate, from: fromDate });

    const isFullMonth =
      (isFirstDayOfMonth(fromDate) && isSameDay(toDate, lastDayOfMonth(toDate))) ||
      (fromDate.getDate() === toDate.getDate() + 1);

    const adjustedBudgetAmount = isFullMonth
      ? parseFloat(category.budgetAmount || "0")
      : (parseFloat(category.budgetAmount || "0") *
          (differenceInDays(toDate, fromDate) + 1) /
          30.44);

    const total =
      totalsQuery.data?.find((total: any) => total.categoryId === category.id) ||
      { totalIncome: 0, totalCost: 0 };

    return {
      id: category.id,
      name: category.name,
      totalIncome: total.totalIncome.toFixed(2),
      totalCost: total.totalCost.toFixed(2),
      budgetAmount: adjustedBudgetAmount.toFixed(2),
      amountLeftToSpend: (adjustedBudgetAmount + total.totalCost).toFixed(2),
    };
  });

  const transformedData = categoriesWithTotals.map((category: any) => ({
    ...category,
    budgetAmount: category.budgetAmount ?? "0",
  }));

  const sumBudgetAmount = transformedData.reduce(
    (sum: number, item: any) => sum + parseFloat(item.budgetAmount),
    0
  );

  const [isLargeScreen, setIsLargeScreen] = useState<boolean>(false);
  const mainCumulativeSpending = fullData?.expensesAmount || 0;
  let isFullMonth: boolean;
  if (data.length === 0) {
    isFullMonth = false;
  } else {
    const isSameDayOfMonth =
      getDate(new Date(data[0].date)) === getDate(new Date(data[data.length - 1].date));
    isFullMonth =
      isSameDayOfMonth ||
      (isSameMonth(
        subDays(new Date(data[0].date), 1),
        subDays(new Date(data[data.length - 1].date), 1)
      ) &&
        isFirstDayOfMonth(subDays(new Date(data[0].date), 1)) &&
        isLastDayOfMonth(subDays(new Date(data[data.length - 1].date), 1)));
  }

  const cumulativeBudget = sumBudgetAmount;
  const budgetLeft = cumulativeBudget + mainCumulativeSpending;

  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Helper function to parse a date string without any timezone conversion.
  // This extracts the "YYYY-MM-DD" portion and uses new Date(year, monthIndex, day)
  // so that the date is interpreted exactly as provided.
  const parseDateWithoutTimezone = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Use the helper above to format the date exactly as specified.
  const formatDateLabel = (dateStr: string): string => {
    return format(parseDateWithoutTimezone(dateStr), 'MMM d');
  };

  // Compute the start and end dates based on the provided data.
  let startDate: Date;
  let endDate: Date;
  if (data.length > 0) {
    startDate = parseDateWithoutTimezone(data[0].date);
    endDate = parseDateWithoutTimezone(data[data.length - 1].date);
  } else {
    startDate = new Date();
    endDate = new Date();
  }
  const daysSpan = differenceInDays(endDate, startDate);
  const dailyBudgetIncrement =
    daysSpan > 0 ? cumulativeBudget / (daysSpan + 1) : cumulativeBudget;

  // Compute cumulative spending and cumulative budget for each data point.
  let cumulativeSpending = 0;
  const processedData = data.map((entry) => {
    cumulativeSpending += entry.spending;
    const currentDate = parseDateWithoutTimezone(entry.date);
    const dayDiff = differenceInDays(currentDate, startDate);
    const cumulativeBudgetForDay = (dayDiff + 1) * dailyBudgetIncrement;
    return {
      ...entry,
      cumulativeSpending,
      budget: cumulativeBudgetForDay,
    };
  });

  // Determine tick interval based on the days span.
  let tickInterval = 0;
  if (daysSpan <= 31) {
    tickInterval = Math.floor(data.length / 7);
  } else if (daysSpan <= 90) {
    tickInterval = Math.floor(data.length / 9);
  } else if (daysSpan <= 180) {
    tickInterval = Math.floor(data.length / 12);
  } else if (daysSpan <= 365) {
    tickInterval = Math.floor(data.length / 18);
  } else if (daysSpan <= 730) {
    tickInterval = Math.floor(data.length / 12);
  } else if (daysSpan <= 1460) {
    tickInterval = Math.floor(data.length / 4);
  } else {
    tickInterval = Math.floor(data.length / 1);
  }

  // Calculate indices for small screen tick labels.
  const firstIndex = isLargeScreen ? 1 : Math.floor(data.length * 0.07);
  const middleIndex = Math.floor(data.length / 2);
  const lastIndex = isLargeScreen ? data.length - 1 : data.length - Math.floor(data.length * 0.07);

  // Define tickFormatter function that uses our helper.
  const tickFormatter = (dateStr: string, index: number): string => {
    if (isLargeScreen) {
      return formatDateLabel(dateStr);
    } else {
      if (index === firstIndex || index === middleIndex || index === lastIndex) {
        return formatDateLabel(dateStr);
      }
      return '';
    }
  };

  return (
    <Card className="border-2 drop-shadow-md">
      <CardHeader>
        <CardTitle className="line-clamp-1 text-xl">Budget vs Spending</CardTitle>
        <div className="w-full text-center flex justify-center">
          <div className="p-4 rounded-2xl shadow-md text-center">
            <div className="flex items-center justify-center text-center">
              <CountUp
                className={`font-bold text-lg ${
                  budgetLeft >= 0 ? "text-blue-600" : "text-red-500"
                }`}
                preserveValue
                start={0}
                end={Math.abs(budgetLeft)}
                decimals={2}
                formattingFn={formatCurrency}
              />
              <h2 className={`${budgetLeft >= 0 ? "" : "hidden"} font-bold text-lg ml-1`}>
                left
              </h2>
              <h2 className={`${budgetLeft >= 0 ? "hidden" : ""} font-bold text-lg ml-1`}>
                over
              </h2>
            </div>
            <div className="flex items-center justify-center">
              <h2 className="text-[12px] text-gray-500 mr-1">out of</h2>
              <CountUp
                className="text-[12px] text-gray-500"
                preserveValue
                start={0}
                end={cumulativeBudget}
                decimals={2}
                formattingFn={formatCurrency}
              />
              <h2 className="text-[12px] text-gray-500 ml-1">budgeted</h2>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="-ml-5 w-full">
        {data.length === 0 ? (
          <div className="flex h-[350px] w-full flex-col items-center justify-center gap-y-4">
            <FileSearch className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No data for this period.
            </p>
          </div>
        ) : (
          <ResponsiveContainer className="w-full" height={350}>
            <AreaChart data={processedData}>
              <XAxis
                className="text-xs md:text-sm lg:text-md"
                dataKey="date"
                scale="band"
                tickFormatter={tickFormatter}
                interval={isLargeScreen ? tickInterval : 0}
                tickLine={false}
                tick={{ stroke: '#ccc', strokeWidth: 0.5 }}
              />
              <YAxis
                className="text-xs md:text-sm lg:text-md"
                tickFormatter={(value) => (value === 0 ? '' : value)}
              />
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={isLargeScreen}
                horizontal={true}
                verticalPoints={isLargeScreen ? undefined : [firstIndex, middleIndex, lastIndex]}
              />
              <Tooltip
                labelFormatter={(dateStr) => (
                  <span className="text-gray-800 text-sm">
                    {format(parseDateWithoutTimezone(dateStr), 'MMM d, yyyy')}
                  </span>
                )}
                cursor={{ stroke: '#ccc', strokeWidth: 1 }}
                formatter={(value, name) => {
                  const formattedValue = `$${Number(value).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}`;
                  let color = '';
                  if (name === 'Budget') {
                    color = "#22C55E";
                  } else if (name === 'Spending') {
                    color = '#EF4444';
                  }
                  return [
                    <div key="tooltip-content" className="bg-white">
                      <div className="flex w-full">
                        <div
                          className="rounded-full mt-1.5 mr-2 w-[8px] h-[8px]"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm text-gray-700">
                          {name === "Spending" ? "Spending: " : "Budget: "}
                        </span>
                        <span className="text-sm text-black pl-2">
                          {name !== "Spending" ? formattedValue : `-${formattedValue}`}
                        </span>
                      </div>
                    </div>
                  ];
                }}
                contentStyle={{
                  borderRadius: '8px',
                  borderColor: '#E5E7EB',
                  backgroundColor: '#FFFFFF',
                  padding: '8px 12px',
                  boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="cumulativeSpending"
                stroke="#DC2626"
                fill="url(#colorSpending)"
                name="Spending"
                fillOpacity={0.3}
                activeDot={false}
              />
              <Area
                type="monotone"
                dataKey="budget"
                stroke="#22C55E"
                fill="url(#colorBudget)"
                name="Budget"
                fillOpacity={0.3}
                activeDot={false}
              />
              <defs>
                <linearGradient id="colorSpending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#DC2626" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorBudget" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
