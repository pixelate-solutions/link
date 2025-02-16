"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SpendingBudgetChart from "./logic-chart";
// import ForecastChart from "./forecast-chart";
import { useSearchParams } from "next/navigation";
import { format, subMonths, subWeeks } from "date-fns";
import { useQuery } from "@tanstack/react-query";

interface SpendingTabsProps {
  containerClassName?: string;
}

const fetchSummary = async (
  from: string,
  to: string,
  accountId: string
): Promise<any> => {
  const params = new URLSearchParams({ from, to, accountId });
  const res = await fetch(`/api/summary?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch summary");
  }
  return res.json();
};

const SpendingTabs: React.FC<SpendingTabsProps> = ({
  containerClassName = "",
}) => {
  // Get accountId from the URL if needed.
  const searchParams = useSearchParams();
  const accountId = searchParams.get("accountId") || "";

  const today = new Date();

  // Forecast: 52 weeks period.
  const forecastFrom = subWeeks(today, 52);
  const forecastTo = today;
  const forecastFromStr = format(forecastFrom, "yyyy-MM-dd");
  const forecastToStr = format(forecastTo, "yyyy-MM-dd");

  // Weekly: last 3 weeks.
  const weeklyFrom = subWeeks(today, 3);
  const weeklyTo = today;
  const weeklyFromStr = format(weeklyFrom, "yyyy-MM-dd");
  const weeklyToStr = format(weeklyTo, "yyyy-MM-dd");

  // Monthly: last 3 months.
  const monthlyFrom = subMonths(today, 3);
  const monthlyTo = today;
  const monthlyFromStr = format(monthlyFrom, "yyyy-MM-dd");
  const monthlyToStr = format(monthlyTo, "yyyy-MM-dd");

  // Query for forecast summary data.
  const {
    data: forecastRawData,
    isLoading: isForecastLoading,
    error: forecastError,
  } = useQuery({
    queryKey: ["summary-forecast", { forecastFromStr, forecastToStr, accountId }],
    queryFn: () => fetchSummary(forecastFromStr, forecastToStr, accountId),
  });

  // Query for weekly summary data.
  const {
    data: weeklyRawData,
    isLoading: isWeeklyLoading,
    error: weeklyError,
  } = useQuery({
    queryKey: ["summary-weekly", { weeklyFromStr, weeklyToStr, accountId }],
    queryFn: () => fetchSummary(weeklyFromStr, weeklyToStr, accountId),
  });

  // Query for monthly summary data.
  const {
    data: monthlyRawData,
    isLoading: isMonthlyLoading,
    error: monthlyError,
  } = useQuery({
    queryKey: ["summary-monthly", { monthlyFromStr, monthlyToStr, accountId }],
    queryFn: () => fetchSummary(monthlyFromStr, monthlyToStr, accountId),
  });

  // Fallback data structures if queries are not ready.
  const forecastData = forecastRawData?.data ?? {
    monthlyBudget: 0,
    incomeAmount: 0,
    expensesAmount: 0,
    categories: [],
    days: [],
    remainingChange: 0,
    incomeChange: 0,
    expensesChange: 0,
  };

  const weeklyData = weeklyRawData?.data ?? {
    monthlyBudget: 0,
    incomeAmount: 0,
    expensesAmount: 0,
    categories: [],
    days: [],
    remainingChange: 0,
    incomeChange: 0,
    expensesChange: 0,
  };

  const monthlyData = monthlyRawData?.data ?? {
    monthlyBudget: 0,
    incomeAmount: 0,
    expensesAmount: 0,
    categories: [],
    days: [],
    remainingChange: 0,
    incomeChange: 0,
    expensesChange: 0,
  };

  const forecastNetData =
    forecastData.days.map((day: any) => ({
      date: day.date,
      net: day.income - day.expenses,
    })) || [];

  // Filter out days prior to the effective start date.
  const fiftyTwoWeeksAgoStr = format(subWeeks(today, 52), "yyyy-MM-dd");
  const firstTxnObj = forecastNetData.find((d: any) => d.net !== 0);
  const effectiveStartDate =
    firstTxnObj && firstTxnObj.date > fiftyTwoWeeksAgoStr
      ? firstTxnObj.date
      : fiftyTwoWeeksAgoStr;

  const filteredForecastData = forecastNetData.filter(
    (d: any) => d.date >= effectiveStartDate
  );

  return (
    <div className={containerClassName}>
      {/* No fixed width/margin – these can be set via containerClassName if needed */}
      <Tabs defaultValue="monthly">
        <TabsList className="flex border border-gray-300 rounded-md my-4">
          <TabsTrigger value="weekly" className="flex-1 text-center">
            Weekly
          </TabsTrigger>
          <TabsTrigger value="monthly" className="flex-1 text-center">
            Monthly
          </TabsTrigger>
          {/* <TabsTrigger value="forecast" className="flex-1 text-center">
            Forecast
          </TabsTrigger> */}
        </TabsList>
        {/* Removing fixed height to allow content to size naturally */}
        <TabsContent value="weekly" className="mt-4">
          <SpendingBudgetChart
            data={weeklyData.days.map((day: any) => ({
              date: day.date,
              spending: day.expenses,
              budget: day.budget,
            }))}
            monthlyBudget={weeklyData.monthlyBudget}
            aggregation="week"
          />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <SpendingBudgetChart
            data={monthlyData.days.map((day: any) => ({
              date: day.date,
              spending: day.expenses,
              budget: day.budget,
            }))}
            monthlyBudget={monthlyData.monthlyBudget}
            aggregation="month"
          />
        </TabsContent>
        {/* <TabsContent value="forecast" className="mt-4">
          <ForecastChart
            historicalData={filteredForecastData}
            monthlyBudget={monthlyData.monthlyBudget}
          />
        </TabsContent> */}
      </Tabs>
    </div>
  );
};

export default SpendingTabs;
