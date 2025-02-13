import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { format, parseISO, addDays, endOfDay } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "./ui/skeleton";

interface DataPoint {
  date: string; // daily date in "yyyy-MM-dd"
  net: number;
}

interface ForecastPoint {
  date: string;       // weekly endpoint from forecast.ts
  forecastNet: number; // returned by forecast endpoint
}

interface ForecastChartProps {
  historicalData: DataPoint[]; // daily data with net values
  monthlyBudget: number;       // passed for consistency (not used directly here)
}

/**
 * Helper to create a week label like "1/22-1/28" from start and end dates.
 */
function buildWeekLabel(start: Date, end: Date) {
  const startStr = format(start, "M/d");
  const endStr = format(end, "M/d");
  return `${startStr}-${endStr}`;
}

/**
 * Aggregate daily net data into weekly intervals.
 */
function aggregateHistoricalIntoWeeks(
  dailyData: { date: string; net: number }[]
) {
  if (!dailyData.length) return [];

  const sorted = [...dailyData].sort(
    (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()
  );

  const results: Array<{
    start: Date;
    end: Date;
    net: number;
    label: string;
  }> = [];

  let cursor = parseISO(sorted[0].date);
  let idx = 0;
  while (idx < sorted.length) {
    const start = cursor;
    const end = endOfDay(addDays(start, 6));
    let sumNet = 0;
    while (
      idx < sorted.length &&
      parseISO(sorted[idx].date).getTime() <= end.getTime()
    ) {
      sumNet += sorted[idx].net;
      idx++;
    }
    results.push({
      start,
      end,
      net: sumNet,
      label: buildWeekLabel(start, end),
    });
    cursor = addDays(end, 1);
  }
  return results;
}

/**
 * Convert forecast data into weekly intervals.
 */
function buildForecastWeeks(
  forecastData: ForecastPoint[],
  lastHistoricalEnd: Date
) {
  if (!forecastData.length) return [];

  const results: Array<{
    start: Date;
    end: Date;
    net: number;
    label: string;
  }> = [];

  const sorted = [...forecastData].sort(
    (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()
  );

  let prevEnd = lastHistoricalEnd;
  sorted.forEach((f) => {
    const end = parseISO(f.date);
    const start = addDays(end, -6);
    const startVal =
      start.getTime() < prevEnd.getTime() ? addDays(prevEnd, 1) : start;
    results.push({
      start: startVal,
      end,
      net: f.forecastNet,
      label: buildWeekLabel(startVal, end),
    });
    prevEnd = end;
  });
  return results;
}

/** Custom tooltip that shows the Net value. */
const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
}) => {
  if (!active || !payload || !payload.length) return null;
  const netVal = payload[0].value;
  return (
    <div className="bg-white px-[10px] py-[14px] rounded-lg shadow-md border">
      <p style={{ margin: 0, fontWeight: "bold" }}>{label}</p>
      <p style={{ margin: 0 }}>Net: {formatCurrency(netVal)}</p>
    </div>
  );
};

const ForecastChart: React.FC<ForecastChartProps> = ({
  historicalData,
  monthlyBudget,
}) => {
  // Always compute historicalWeeks.
  const historicalWeeks = aggregateHistoricalIntoWeeks(
    historicalData.map((d) => ({ date: d.date, net: d.net }))
  );

  // Get forecastWeeksCount (will be 0 if no historical data).
  const forecastWeeksCount = historicalWeeks.length;

  // Always call useQuery, but disable it if no historical data.
  const { data: forecastData, isLoading, error } = useQuery({
    queryKey: ["forecast", forecastWeeksCount, monthlyBudget],
    queryFn: async () => {
      const res = await fetch(
        `/api/forecast?weeks=${forecastWeeksCount}&monthlyBudget=${monthlyBudget}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch forecast data: ${res.status}`);
      }
      return res.json();
    },
    enabled: forecastWeeksCount > 0,
  });

  if (!historicalWeeks.length) {
    return <div>No historical data available.</div>;
  }

  if (isLoading) {
    return (
      <div className="shadow-lg rounded-xl p-5 w-full">
        <div className="flex flex-row w-full justify-center items-center px-10">
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
  }
  if (error)
    return <div>Error loading forecast data: {(error as Error).message}</div>;
  if (!forecastData || !Array.isArray(forecastData) || forecastData.length === 0) {
    return <div>No forecast data available</div>;
  }

  // Convert forecast data into weekly intervals.
  const forecastWeeks = buildForecastWeeks(forecastData, historicalWeeks[historicalWeeks.length - 1].end);

  // Ensure continuity: set the first forecast point's net equal to the last historical net.
  if (forecastWeeks.length > 0) {
    forecastWeeks[0].net = historicalWeeks[historicalWeeks.length - 1].net;
  }

  // Separate arrays for historical and forecast lines.
  const historicalLine = historicalWeeks.map((hw) => ({
    label: hw.label,
    net: hw.net,
  }));
  const forecastLine = forecastWeeks.map((fw) => ({
    label: fw.label,
    net: fw.net,
  }));

  // Calculate summary information:
  // Sum the projected forecast net values excluding the first (continuity) point.
  const projectedChange = forecastLine.slice(1).reduce((acc, curr) => acc + curr.net, 0);
  const weeksCount = forecastLine.slice(1).length;
  let summaryText = "";
  if (projectedChange > 0) {
    summaryText = `Over the next ${weeksCount} weeks, your net worth is projected to increase by ${formatCurrency(projectedChange)}.`;
  } else if (projectedChange < 0) {
    summaryText = `Over the next ${weeksCount} weeks, your net worth is projected to decrease by ${formatCurrency(Math.abs(projectedChange))}.`;
  } else {
    summaryText = `Over the next ${weeksCount} weeks, your net worth is projected to remain stable.`;
  }

  return (
    <div className="p-4 bg-white rounded shadow">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={[...historicalLine, ...forecastLine]} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="black" />
              <stop offset="49.9%" stopColor="black" />
              <stop offset="50.1%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" minTickGap={20} />
          <YAxis tickFormatter={(val: number) => formatCurrency(val)} />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="net"
            stroke="url(#lineGradient)"
            strokeWidth={3}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4">
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 bg-black" />
          <span className="text-md">History</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 bg-[#3b82f6]" />
          <span className="text-md">Projected</span>
        </div>
      </div>
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-gray-700">{summaryText}</p>
      </div>
    </div>
  );
};

export default ForecastChart;
