import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  parseISO,
  addDays,
  subDays,
  endOfMonth,
  startOfMonth,
  isSameDay,
  isSameMonth,
  isBefore,
  getDate,
  format,
} from 'date-fns';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation'; // For routing
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from './ui/skeleton';

interface DailyData {
  date: string; 
  spending: number;
}

interface Interval {
  start: Date;
  end: Date;
  spending: number;
  budget: number;
  label: string;
}

interface SpendingBudgetChartProps {
  data: DailyData[];
  monthlyBudget: number;
  aggregation: 'week' | 'month';
}

const RoundedCursor: React.FC<any> = (props) => {
  const { x, y, width, height } = props;
  if (!width || !height) return null;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={10}
      ry={10}
      fill="rgba(255,255,255,1)"
      className="transition-opacity duration-300"
    />
  );
};

function getLocalToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Build EXACT 7-day intervals from localToday going backwards:
 * The most recent interval ends on localToday, e.g. [2/3..2/9],
 * then the next older is [1/27..2/2], etc.
 */
function buildWeekIntervalsDescending(data: DailyData[], dailyBudgetRate: number): Interval[] {
  const localToday = getLocalToday();
  const shifted = data.map((item) => ({
    dateObj: addDays(parseISO(item.date), 1),
    spending: item.spending,
  }));
  const intervals: Interval[] = [];
  let end = localToday;
  while (true) {
    const start = subDays(end, 6);
    if (start.getFullYear() < 1970) break;
    let sum = 0;
    for (const s of shifted) {
      if (s.dateObj >= start && s.dateObj <= end) {
        sum += s.spending;
      }
    }
    const budget = dailyBudgetRate * 7;
    const label = `${format(start, 'M/d')}-${format(end, 'M/d')}`;
    intervals.push({ start, end, spending: sum, budget, label });
    const nextEnd = subDays(start, 1);
    if (nextEnd.getFullYear() < 1970) break;
    end = nextEnd;
  }
  // intervals newest->oldest
  return intervals;
}

/**
 * Build month intervals from localToday going backwards:
 * The most recent month is the one containing localToday,
 * then each older month is [startOfMonth..endOfMonth].
 */
function buildMonthIntervalsDescending(
  data: DailyData[],
  monthlyBudget: number,
  dailyBudgetRate: number
): Interval[] {
  const localToday = getLocalToday();
  const shifted = data.map((item) => ({
    dateObj: addDays(parseISO(item.date), 1),
    spending: item.spending,
  }));
  const intervals: Interval[] = [];
  let cursor = new Date(localToday.getFullYear(), localToday.getMonth(), 1);

  while (true) {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = endOfMonth(start);
    let sum = 0;
    for (const s of shifted) {
      if (s.dateObj >= start && s.dateObj <= end) {
        sum += s.spending;
      }
    }
    let budget = monthlyBudget;
    if (isBefore(start, startOfMonth(localToday))) {
      budget = monthlyBudget;
    } else if (isSameMonth(start, localToday)) {
      if (isSameDay(endOfMonth(localToday), localToday)) {
        budget = monthlyBudget;
      } else {
        budget = dailyBudgetRate * getDate(localToday);
      }
    } else {
      budget = monthlyBudget;
    }
    const label = format(start, 'MMM yyyy');
    intervals.push({ start, end, spending: sum, budget, label });

    const prevMonth = start.getMonth() - 1;
    const prevYear = start.getFullYear() - (prevMonth < 0 ? 1 : 0);
    const newMonth = (prevMonth + 12) % 12;
    const nextCursor = new Date(prevYear, newMonth, 1);
    if (prevYear < 1970) break;
    cursor = nextCursor;
    if (cursor.getFullYear() < 1970) break;
  }
  // intervals newest->oldest
  return intervals;
}

const SpendingBudgetChart: React.FC<SpendingBudgetChartProps> = ({
  data,
  monthlyBudget,
  aggregation,
}) => {
  const router = useRouter(); // to navigate
  const [offset, setOffset] = useState(0);

    if (!data.length) return (
        <div className="shadow-lg rounded-xl p-5 w-full">
            <div className="flex flex-row w-full justify-items-center items-center justify-center px-10">
                <Skeleton className="h-[280px] w-[10%]" />
                <Skeleton className="h-[280px] w-[10%] mx-2" />

                <Skeleton className="h-[280px] w-[10%] ml-4" />
                <Skeleton className="h-[280px] w-[10%] mx-2" />

                <Skeleton className="h-[280px] w-[10%] ml-4" />
                <Skeleton className="h-[280px] w-[10%] mx-2" />
            </div>
            <Skeleton className="h-[40px] md:h-[60px] w-[78%] ml-[11%] mt-2" />
        </div>
    );

  const dailyBudgetRate = monthlyBudget / 30.44;
  let intervals: Interval[];

  if (aggregation === 'week') {
    intervals = buildWeekIntervalsDescending(data, dailyBudgetRate);
  } else {
    intervals = buildMonthIntervalsDescending(data, monthlyBudget, dailyBudgetRate);
  }

  if (!intervals.length) return <div className="p-4">No data available</div>;

  // chunkSize => 4 (weeks) or 3 (months)
  const chunkSize = aggregation === 'week' ? 4 : 3;

  // intervals is newest->oldest
  let maxOffset = intervals.length - chunkSize;
  if (maxOffset < 0) maxOffset = 0;
  let currentOffset = offset;
  if (currentOffset < 0) currentOffset = 0;
  if (currentOffset > maxOffset) currentOffset = maxOffset;
  const slice = intervals.slice(currentOffset, currentOffset + chunkSize);

  // Reverse so the left bar is oldest, the right bar is newest
  const barData = [...slice].reverse().map((iv) => ({
    period: iv.label,
    spending: iv.spending,
    budget: iv.budget,
    // We'll store from/to for easy navigation
    fromDate: format(iv.start, 'yyyy-MM-dd'),
    toDate: format(iv.end, 'yyyy-MM-dd'),
  }));

  const isAtNewest = currentOffset === 0;
  const isAtOldest = currentOffset === maxOffset;

  const handlePrevious = () => {
    if (!isAtOldest) setOffset((prev) => Math.min(prev + 1, maxOffset));
  };
  const handleNext = () => {
    if (!isAtNewest) setOffset((prev) => Math.max(prev - 1, 0));
  };

  /**
   * When user clicks a bar, we navigate to /transactions?from=xxx&to=xxx
   */
  const handleBarClick = (entry: any, index: number) => {
    const clicked = barData[index];
    router.push(
      `/transactions?from=${clicked.fromDate}&to=${clicked.toDate}`
    );
  };

  return (
    <div className="bg-gray-50 p-4 rounded shadow-md hover:shadow-lg relative">
      <div key={offset} className="transition-transform duration-500">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={barData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <defs>
              <linearGradient id="budgetGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#93C5FD" />
                <stop offset="100%" stopColor="#D8B4FE" />
              </linearGradient>
              <linearGradient id="spendingLegendGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#22C55E" />
                <stop offset="49%" stopColor="#22C55E" />
                <stop offset="51%" stopColor="#EF4444" />
                <stop offset="100%" stopColor="#EF4444" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="period" />
            <YAxis tickFormatter={(val: number) => formatCurrency(val)} />
            <Tooltip
              cursor={<RoundedCursor />}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-gray-100 p-3 rounded-xl shadow-md transition-all duration-300">
                      <p className="text-gray-800 font-semibold">
                        {payload[0].payload.period}
                      </p>
                      <p className="text-green-600">
                        Spending: {formatCurrency(Number(payload[0].value))}
                      </p>
                      <p className="text-purple-500">
                        Budget: {formatCurrency(Number(payload[1].value))}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />

            {/* The onClick is fired when a user clicks a bar segment. */}
            <Bar
              dataKey="spending"
              name="Spending"
              fill="url(#spendingLegendGradient)"
              onClick={handleBarClick}
              className='hover:cursor-pointer'
            >
              {barData.map((entry, idx) => {
                const fillColor = entry.spending <= entry.budget ? '#22C55E' : '#EF4444';
                return <Cell key={`cell-${idx}`} fill={fillColor} />;
              })}
            </Bar>

            <Bar dataKey="budget" name="Budget" fill="url(#budgetGradient)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center mt-4">
        <button
          onClick={handlePrevious}
          disabled={isAtOldest}
          className="flex items-center text-gray-600 hover:text-gray-900 transition-colors p-2 disabled:opacity-50"
        >
          <ArrowLeft className="w-5 h-5 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <button
          onClick={handleNext}
          disabled={isAtNewest}
          className="flex items-center text-gray-600 hover:text-gray-900 transition-colors p-2 disabled:opacity-50"
        >
          <span className="hidden sm:inline">Next</span>
          <ArrowRight className="w-5 h-5 ml-1 sm:ml-2" />
        </button>
      </div>
    </div>
  );
};

export default SpendingBudgetChart;
