import { 
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, Area, AreaChart 
} from 'recharts';
import { 
  Card, CardContent, CardHeader, CardTitle 
} from "@/components/ui/card";
import { 
  format, parseISO, differenceInDays, 
  isFirstDayOfMonth, endOfToday, isSameDay, 
  subMonths, lastDayOfMonth, 
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
    if (!from || !to) {
      const today = endOfToday();
      const previousMonthSameDay = subMonths(today, 1);

      from = addDays(previousMonthSameDay, 1).toISOString();
      to = today.toISOString();
    }

    const fromDate = parseISO(from);
    const toDate = parseISO(to);
    dateRange = formatDateRange({ to: toDate, from: fromDate });

    const isFullMonth = (
      (isFirstDayOfMonth(fromDate) && isSameDay(toDate, lastDayOfMonth(toDate))) || 
      (fromDate.getDate() === toDate.getDate() + 1)
    );

    const adjustedBudgetAmount = isSameDay(fromDate, toDate)
      ? parseFloat(category.budgetAmount || "0") / 30.44 // Single day's budget
      : isFullMonth
      ? parseFloat(category.budgetAmount || "0") // Full monthly budget
      : (parseFloat(category.budgetAmount || "0") * (differenceInDays(toDate, fromDate) + 1)) / 30.44;

    const total = totalsQuery.data?.find(total => total.categoryId === category.id) || { totalIncome: 0, totalCost: 0 };

    return {
      id: category.id,
      name: category.name,
      totalIncome: total.totalIncome.toFixed(2),
      totalCost: total.totalCost.toFixed(2),
      budgetAmount: adjustedBudgetAmount.toFixed(2),
      amountLeftToSpend: (adjustedBudgetAmount + total.totalCost).toFixed(2),
    };
  });

  const sumBudgetAmount = categoriesWithTotals.reduce(
    (sum: number, item) => sum + parseFloat(item.budgetAmount),
    0
  );

  const [isLargeScreen, setIsLargeScreen] = useState<boolean>(false);
  const mainCumulativeSpending = fullData?.expensesAmount || 0;
  const cumulativeBudget = sumBudgetAmount;
  const budgetLeft = cumulativeBudget + mainCumulativeSpending;

  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  return (
    <Card className="border-none drop-shadow-sm">
      <CardHeader>
        <CardTitle className="line-clamp-1 text-xl">Budget vs Spending</CardTitle>
        <div className="w-full text-center flex justify-center">
          <div className="p-4 rounded-2xl shadow-md text-center">
            <div className="flex items-center justify-center">
              <CountUp
                className={`font-bold text-lg ${budgetLeft >= 0 ? "text-blue-600" : "text-red-500"}`}
                preserveValue
                start={0}
                end={Math.abs(budgetLeft)}
                decimals={2}
                formattingFn={formatCurrency}
              />
              <h2 className={`font-bold text-lg ml-1 ${budgetLeft >= 0 ? "" : "hidden"}`}>left</h2>
              <h2 className={`font-bold text-lg ml-1 ${budgetLeft >= 0 ? "hidden" : ""}`}>over</h2>
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
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[350px] w-full flex-col items-center justify-center gap-y-4">
            <FileSearch className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No data for this period.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data}>
              <XAxis dataKey="date" tickFormatter={(date) => format(parseISO(date), 'MMM d')} />
              <YAxis />
              <CartesianGrid strokeDasharray="3 3" />
              <Tooltip formatter={(value, name) => [`${formatCurrency(Number(value))}`, name]} />
              <Legend />
              <Area type="monotone" dataKey="budget" stroke="#22C55E" fill="#22C55E" />
              <Area type="monotone" dataKey="spending" stroke="#DC2626" fill="#DC2626" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
