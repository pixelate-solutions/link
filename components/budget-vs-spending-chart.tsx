import { XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parseISO, differenceInDays, isSameMonth, getDate, isFirstDayOfMonth, isLastDayOfMonth, subDays, endOfToday, isSameDay, subMonths, lastDayOfMonth } from 'date-fns';
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

  let dateRange;

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
    enabled: true, // Ensure the query runs on every page load
  });

  const categoriesWithTotals = categories.map((category: any) => {
    if (to === "" || from === "") {
      const today = endOfToday();  // Get today's date
      const previousMonthSameDay = subMonths(today, 1);  // Get the same day in the previous month

      const newFrom = previousMonthSameDay.toISOString();  // Convert to ISO format
      const newTo = today.toISOString();  // Today's date in ISO format

      from = newFrom;
      to = newTo;
    }
    const fromDate = parseISO(from);
    const toDate = parseISO(to);

    dateRange = formatDateRange({ to: toDate, from: fromDate });

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

  const transformedData = categoriesWithTotals.map((category: any) => ({
    ...category,
    budgetAmount: category.budgetAmount ?? "0", // Ensure budgetAmount is included
  }));

  const sumBudgetAmount = transformedData.reduce(
    (sum: any, item: any) => sum + parseFloat(item.budgetAmount),
    0
  );


  const [isLargeScreen, setIsLargeScreen] = useState<boolean>(false);
  const mainCumulativeSpending = fullData?.expensesAmount || 0;
  let isFullMonth;
  if (data.length === 0) {
    isFullMonth = false
  } else {
    const isSameDayOfMonth = getDate(new Date(data[0].date)) === getDate(new Date(data[data.length - 1].date));
    isFullMonth = 
    isSameDayOfMonth || 
    (isSameMonth(new Date(data[0].date), new Date(data[data.length - 1].date)) &&
      isFirstDayOfMonth(new Date(data[0].date)) &&
    isLastDayOfMonth(new Date(data[data.length - 1].date)));
  }

  const cumulativeBudget = sumBudgetAmount;

  // Calculate the remaining budget
  const budgetLeft = cumulativeBudget + mainCumulativeSpending;


  // Check screen size on mount and resize
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024); // 'lg' breakpoint in Tailwind corresponds to 1024px
    };

    checkScreenSize(); // Check on mount
    window.addEventListener('resize', checkScreenSize); // Re-check on resize

    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // Format data for cumulative spending
  let cumulativeSpending = 0;
  const processedData = data.map((entry) => {
    cumulativeSpending += entry.spending; // Add to the cumulative total
    return {
      ...entry,
      cumulativeSpending,
    };
  });

    // Determine the date range, ensuring the data array is not empty
    let daysSpan = 0
    if (data.length > 0) {
        const startDate = parseISO(data[0].date);
        const endDate = parseISO(data[data.length - 1].date);
        daysSpan = differenceInDays(endDate, startDate);
    }

  // Determine tick interval based on days span for large screens
  let tickInterval = 0;
  if (daysSpan <= 31) {
    tickInterval = Math.floor(data.length / 7);
  } else if (daysSpan <= 90) {
    tickInterval = Math.floor(data.length / 9); // Approx every 10 days
  } else if (daysSpan <= 180) {
    tickInterval = Math.floor(data.length / 12); // Approx every 15 days
  } else if (daysSpan <= 365) {
    tickInterval = Math.floor(data.length / 18); // Approx every 20 days
  } else if (daysSpan <= 730) {
    tickInterval = Math.floor(data.length / 12); // Approx every month
  } else if (daysSpan <= 1460) {
    tickInterval = Math.floor(data.length / 4); // Every 3 months
  } else {
    tickInterval = Math.floor(data.length / 1); // Every year
  }

  // Calculate first, middle, and last index for small screens
  const firstIndex = isLargeScreen ? 1 : Math.floor(data.length * 0.07);
  const middleIndex = Math.floor(data.length / 2);
  const lastIndex = isLargeScreen ? data.length - 1 : data.length - Math.floor(data.length * 0.07);

  // Formatter for x-axis labels
  const tickFormatter = (date: string, index: number) => {
    if (isLargeScreen) {
      // Show all labels for large screens
      return format(parseISO(date), 'MMM d');
    } else {
      // For small screens, show only first, middle, and last labels
      if (index === firstIndex || index === middleIndex || index === lastIndex) {
        return format(parseISO(date), 'MMM d');
      }
      return ''; // Hide other labels
    }
  };

  return (
    <Card className="border-none drop-shadow-sm">
      <CardHeader>
        <CardTitle className="line-clamp-1 text-xl">Budget vs Spending</CardTitle>
        <div className="w-full text-center flex justify-center">
          <div className="p-4 rounded-2xl shadow-md text-center">
            <div className="flex items-center justify-center text-center">
              <CountUp
                className={`font-bold text-lg ${budgetLeft >= 0 ? "text-blue-600" : "text-red-500"}`}
                preserveValue
                start={0}
                end={Math.abs(budgetLeft)}
                decimals={2}
                formattingFn={formatCurrency}
              />
              <h2 className={`${budgetLeft >= 0 ? "" : "hidden"} font-bold text-lg ml-1`}>left</h2>
              <h2 className={`${budgetLeft >= 0 ? "hidden" : ""} font-bold text-lg ml-1`}>over</h2>
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
      <CardContent className='-ml-5 w-full'>
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
              {/* X-Axis with dynamic tick intervals */}
              <XAxis
                className='text-xs md:text-sm lg:text-md'
                dataKey="date"  // Use the date field directly
                scale="band"  // Use band scale for evenly spaced days
                tickFormatter={tickFormatter} // Conditionally show labels based on screen size
                interval={isLargeScreen ? tickInterval : 0}  // Use dynamic interval for large screens, no interval for small
                tickLine={false}  // Disable tick lines except for visible labels
                tick={{ stroke: '#ccc', strokeWidth: 0.5 }}  // Styling for ticks
              />
              {/* Y-Axis */}
                <YAxis
                  className='text-xs md:text-sm lg:text-md'
                  tickFormatter={(value) => (value === 0 ? '' : value)}
                />
              
              {/* Dotted grid lines */}
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={isLargeScreen}  // Show all vertical lines on large screens
                horizontal={true}
                verticalPoints={isLargeScreen ? undefined : [firstIndex, middleIndex, lastIndex]} // Vertical lines only for visible ticks on small screens
              />
              
              <Tooltip
                labelFormatter={(date) => (
                  <span className='text-gray-800 text-sm'>
                    {format(parseISO(date), 'MMM d, yyyy')}
                  </span>
                )}
                cursor={{ stroke: '#ccc', strokeWidth: 1 }}
                formatter={(value, name, props) => {
                  const formattedValue = `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  let color = '';
                  if (name === 'Budget') {
                    color = "#22C55E"; // Green for Budget
                  } else if (name === 'Spending') {
                    color = '#EF4444'; // Red for Spending
                  }

                  return [
                    <div key="tooltip-content" className="bg-white">
                      <div className='flex w-full'>
                        <div
                          className="rounded-full mt-1.5 mr-2 w-[8px] h-[8px]"
                          style={{ backgroundColor: color }}
                        />
                        <span className='text-sm text-gray-700'>
                          {name === "Spending" ? "Spending: " : "Budget: "}
                        </span>
                        <span className='text-sm text-black pl-2'>
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
                  boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',
                }}
              />

              <Legend />
              
              {/* Spending Line (cumulative) */}
              <Area
                type="monotone"
                dataKey="cumulativeSpending"
                stroke="#DC2626"  // red-600 for spending line
                fill="url(#colorSpending)"
                name="Spending"
                fillOpacity={0.3} // Gradient fill for spending line
                activeDot={false}
              />
              
              {/* Budget Line */}
              <Area
                type="monotone"
                dataKey="budget"
                stroke="#22C55E"  // green-500 for budget line
                fill="url(#colorBudget)"
                name="Budget"
                fillOpacity={0.3} // Gradient fill for budget line
                activeDot={false}
              />
              
              {/* Gradient for Spending */}
              <defs>
                <linearGradient id="colorSpending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#DC2626" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#DC2626" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorBudget" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
