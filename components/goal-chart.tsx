"use client";

import React, { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { format, addDays, addWeeks, addMonths, subMonths } from "date-fns";

// --- Custom Tooltip with rounded corners and shadow ---
const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 rounded shadow-md">
        <p className="font-semibold">{label}</p>
        <p>{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

interface DataPoint {
  label: string;
  value: number;
}

interface GoalProgressChartProps {
  currentAmount: number;
  goalId: string;
  accountId: string; // Use one accountId from the goal's accountIds.
  goalStartDate: string; // New: the goal's start date (ISO string)
}

const GoalProgressChart: React.FC<GoalProgressChartProps> = ({
  currentAmount,
  goalId,
  accountId,
  goalStartDate,
}) => {
  // --- State for Actual Data (transactions) ---
  const [actualData, setActualData] = useState<DataPoint[]>([]);
  const [actualLoading, setActualLoading] = useState<boolean>(false);

  // --- State for Projected Data ---
  const [periodType, setPeriodType] = useState<"day" | "week" | "month">("day");
  const [additionalSaving, setAdditionalSaving] = useState<number>(0);
  const [projectedData, setProjectedData] = useState<DataPoint[]>([]);

  // --- Fetch Actual Transactions for Past 2 Months (or from goal start date, whichever is later) ---
  useEffect(() => {
    const fetchActualData = async () => {
      setActualLoading(true);
      const today = new Date();
      const defaultFrom = subMonths(today, 2);
      const goalStart = new Date(goalStartDate);
      // Use the later of goalStart and two months ago:
      const fromDate = goalStart > defaultFrom ? goalStart : defaultFrom;
      const fromStr = format(fromDate, "yyyy-MM-dd");
      const toStr = format(today, "yyyy-MM-dd");

      try {
        const res = await fetch(
          `/api/transactions?from=${fromStr}&to=${toStr}&accountId=${accountId}`
        );
        if (res.ok) {
          const json = await res.json();
          // Expected response: { data: Transaction[] }
          // Each transaction: { date: "yyyy-MM-dd", amount: string, ... }
          const transactions = json.data;
          // Aggregate transactions by date (summing amounts)
          const dailyTotals: { [date: string]: number } = {};
          transactions.forEach((tx: any) => {
            const date = tx.date; // already in "yyyy-MM-dd" format
            const amt = parseFloat(tx.amount);
            dailyTotals[date] = (dailyTotals[date] || 0) + amt;
          });
          // Convert aggregated object to array and sort by date ascending.
          const aggregated = Object.keys(dailyTotals)
            .sort()
            .map((date) => ({
              label: format(new Date(date), "M/d"),
              value: dailyTotals[date],
            }));
          setActualData(aggregated);
        } else {
          console.error("Failed to fetch actual transaction data");
          setActualData([]);
        }
      } catch (error) {
        console.error("Error fetching actual transaction data:", error);
        setActualData([]);
      }
      setActualLoading(false);
    };

    fetchActualData();
  }, [accountId, goalStartDate]);

  // --- Compute Projected Data based on user inputs ---
  useEffect(() => {
    const today = new Date();
    let timeline: DataPoint[] = [];

    if (periodType === "day") {
      // 60-day projection
      for (let i = 0; i <= 60; i++) {
        const date = addDays(today, i);
        timeline.push({
          label: format(date, "M/d"),
          value: currentAmount + additionalSaving * i,
        });
      }
    } else if (periodType === "week") {
      // 8-week projection
      for (let i = 0; i <= 8; i++) {
        const date = addWeeks(today, i);
        timeline.push({
          label: format(date, "M/d"),
          value: currentAmount + additionalSaving * i,
        });
      }
    } else if (periodType === "month") {
      // 2-month projection
      for (let i = 0; i <= 2; i++) {
        const date = addMonths(today, i);
        timeline.push({
          label: format(date, "MMM"),
          value: currentAmount + additionalSaving * i,
        });
      }
    }
    setProjectedData(timeline);
  }, [currentAmount, additionalSaving, periodType]);

  return (
    <div className="p-4 bg-white rounded shadow-md">
      <Tabs defaultValue="actual">
        <TabsList className="mb-4">
          <TabsTrigger value="actual">Actual Data</TabsTrigger>
          <TabsTrigger value="projected">Projected Data</TabsTrigger>
        </TabsList>

        {/* Actual Data Tab */}
        <TabsContent value="actual">
          {actualLoading ? (
            <p className="text-center text-gray-500">Loading transaction data...</p>
          ) : actualData.length > 0 ? (
            <ResponsiveContainer className="p-2" width="100%" height={300}>
              <LineChart
                data={actualData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(val: number) => formatCurrency(val)} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#4ade80"
                  strokeWidth={2}
                  dot={{ r: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-500">No transaction data available.</p>
          )}
        </TabsContent>

        {/* Projected Data Tab */}
        <TabsContent value="projected">
          <div className="mb-4 flex flex-col gap-2">
            <p className="font-semibold">Increase Your Savings:</p>
            <div className="flex items-center gap-2">
              <select
                className="border rounded p-2"
                value={periodType}
                onChange={(e) =>
                  setPeriodType(e.target.value as "day" | "week" | "month")
                }
              >
                <option value="day">Per Day</option>
                <option value="week">Per Week</option>
                <option value="month">Per Month</option>
              </select>
              <input
                type="number"
                className="border rounded p-2 w-24"
                placeholder="Amount"
                value={additionalSaving}
                onChange={(e) => setAdditionalSaving(Number(e.target.value))}
              />
            </div>
          </div>
          <ResponsiveContainer className="p-2" width="100%" height={300}>
            <LineChart
              data={projectedData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(val: number) => formatCurrency(val)} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GoalProgressChart;
