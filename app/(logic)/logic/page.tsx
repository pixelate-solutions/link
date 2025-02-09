"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Montserrat } from "next/font/google";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SpendingBudgetChart from "@/components/logic-chart";
import { subWeeks, subMonths, format } from "date-fns";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

/**
 * This function builds the URL with query parameters and fetches summary data
 * from the /api/summary endpoint.
 */
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

const LogicPage = () => {
  // We still get the accountId from the URL (if needed)
  const searchParams = useSearchParams();
  const accountId = searchParams.get("accountId") || "";

  const today = new Date();

  // For weekly comparisons: from 3 weeks ago until today
  const weeklyFrom = subWeeks(today, 3);
  const weeklyTo = today;
  const weeklyFromStr = format(weeklyFrom, "yyyy-MM-dd");
  const weeklyToStr = format(weeklyTo, "yyyy-MM-dd");

  // For monthly comparisons: from 3 months ago until today
  const monthlyFrom = subMonths(today, 3);
  const monthlyTo = today;
  const monthlyFromStr = format(monthlyFrom, "yyyy-MM-dd");
  const monthlyToStr = format(monthlyTo, "yyyy-MM-dd");

  // Query for the weekly summary data (last 3 weeks)
  const {
    data: weeklyRawData,
    isLoading: isWeeklyLoading,
    error: weeklyError,
  } = useQuery({
    queryKey: ["summary-weekly", { weeklyFromStr, weeklyToStr, accountId }],
    queryFn: () => fetchSummary(weeklyFromStr, weeklyToStr, accountId),
  });

  // Query for the monthly summary data (last 3 months)
  const {
    data: monthlyRawData,
    isLoading: isMonthlyLoading,
    error: monthlyError,
  } = useQuery({
    queryKey: ["summary-monthly", { monthlyFromStr, monthlyToStr, accountId }],
    queryFn: () => fetchSummary(monthlyFromStr, monthlyToStr, accountId),
  });

  if (weeklyError || monthlyError) return <div>Error loading summary data.</div>;

  // In case the API response is missing any data, fall back to defaults.
  const weeklyData = weeklyRawData?.data ?? {
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

  const monthlyData = monthlyRawData?.data ?? {
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

  // Map the daily data into the chart’s format.
  // (Each day object includes a date, spending, and budget value.)
  const weeklyBudgetVsSpendingData =
    weeklyData.days.map((day: any) => ({
      date: day.date,
      spending: day.expenses,
      budget: day.budget,
    })) || [];

  const monthlyBudgetVsSpendingData =
    monthlyData.days.map((day: any) => ({
      date: day.date,
      spending: day.expenses,
      budget: day.budget,
    })) || [];

  return (
    <div className="min-h-screen">
      <div
        className="sticky top-[137px] -mt-[130px] bg-gradient-to-br from-blue-200 to-purple-200 border-white lg:w-[74%] lg:ml-[13%] h-[100px] rounded-t-2xl z-50"
      >
        <p
          className={cn("text-4xl w-full text-center h-full pt-6", montserratH.className)}
        >
          Link Logic
        </p>
      </div>
      <Tabs defaultValue="main" className="lg:w-[74%] lg:ml-[13%]">
        <TabsList
          className="sticky top-[220px] flex lg:w-full border border-gray-300 rounded-md mt-[130px] mb-[30px] lg:mt-[60px] lg:mb-[30px] z-50 mx-2 lg:mx-0"
        >
          <TabsTrigger value="goals" className="w-1/3 text-center">
            Weekly
          </TabsTrigger>
          <TabsTrigger value="main" className="w-1/3 text-center">
            Monthly
          </TabsTrigger>
          <TabsTrigger value="chat" className="w-1/3 text-center">
            Forecast
          </TabsTrigger>
        </TabsList>
        <div className="h-[200px] rounded-b-2xl">
          {/* Weekly tab: using the weekly data (last 3 weeks) */}
          <TabsContent value="goals" className="mt-4">
            <SpendingBudgetChart
              data={monthlyBudgetVsSpendingData}
              monthlyBudget={monthlyData.monthlyBudget}
              aggregation="week"
            />
          </TabsContent>
          {/* Monthly tab: using the monthly data (last 3 months) */}
          <TabsContent value="main" className="mt-4">
            <SpendingBudgetChart
              data={monthlyBudgetVsSpendingData}
              monthlyBudget={monthlyData.monthlyBudget}
              aggregation="month"
            />
          </TabsContent>
          <TabsContent value="chat" className="mt-4">
            Forecast content goes here.
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default LogicPage;
