import { XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parseISO, differenceInDays } from 'date-fns';
import { useEffect, useState } from 'react';
import { FileSearch } from 'lucide-react';
import { CountUp } from './count-up';
import { formatCurrency } from "@/lib/utils";

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

export const BudgetVsSpendingChart = ({ data, fullData, cumulativeBudget }: BudgetVsSpendingChartProps) => {
  const mainCumulativeSpending = fullData?.expensesAmount || 0;
  const budgetLeft = (cumulativeBudget || 0) + mainCumulativeSpending;
  
  const [isLargeScreen, setIsLargeScreen] = useState<boolean>(false);
  
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
  
  // Process the daily data: compute cumulative spending and the proportional daily budget
  let cumulativeSpending = 0;
  const processedData = data.map((entry, index) => {
    const adjustedDate = new Date(entry.date);
    adjustedDate.setDate(adjustedDate.getDate() + 1);
  
    cumulativeSpending += entry.spending;
  
    const totalDays = data.length;
    const cumulativeBudgetForDay = ((cumulativeBudget || 0) / totalDays) * (index + 1);
  
    return {
      ...entry,
      date: adjustedDate.toISOString(),
      cumulativeSpending,
      budget: cumulativeBudgetForDay,
    };
  });
  
  // Determine tick interval based on the number of days
  let daysSpan = 0;
  if (data.length > 0) {
    const startDate = parseISO(data[0].date).setUTCHours(0, 0, 0, 0);
    const endDate = parseISO(data[data.length - 1].date).setUTCHours(23, 59, 59, 999);
    daysSpan = differenceInDays(endDate, startDate);
  }
  
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
  
  const firstIndex = isLargeScreen ? 1 : Math.floor(data.length * 0.07);
  const middleIndex = Math.floor(data.length / 2);
  const lastIndex = isLargeScreen ? data.length - 1 : data.length - Math.floor(data.length * 0.07);
  
  const tickFormatter = (date: string, index: number) => {
    if (isLargeScreen) {
      return format(parseISO(date), 'MMM d');
    } else {
      if (index === firstIndex || index === middleIndex || index === lastIndex) {
        return format(parseISO(date), 'MMM d');
      }
      return '';
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
                end={(cumulativeBudget || 0)}
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
              <XAxis
                className='text-xs md:text-sm lg:text-md'
                dataKey="date"
                scale="band"
                tickFormatter={tickFormatter}
                interval={isLargeScreen ? tickInterval : 0}
                tickLine={false}
                tick={{ stroke: '#ccc', strokeWidth: 0.5 }}
              />
              <YAxis
                className='text-xs md:text-sm lg:text-md'
                tickFormatter={(value) => (value === 0 ? '' : value)}
              />
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={isLargeScreen}
                horizontal={true}
                verticalPoints={isLargeScreen ? undefined : [firstIndex, middleIndex, lastIndex]}
              />
              <Tooltip
                labelFormatter={(date) => (
                  <span className='text-gray-800 text-sm'>
                    {format(parseISO(date), 'MMM d, yyyy')}
                  </span>
                )}
                cursor={{ stroke: '#ccc', strokeWidth: 1 }}
                formatter={(value, name, props) => {
                  const formattedValue = `$${Number(value).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`;
                  let color = '';
                  if (name === 'Budget') {
                    color = "#22C55E";
                  } else if (name === 'Spending') {
                    color = '#EF4444';
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
