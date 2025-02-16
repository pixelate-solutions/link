"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Montserrat } from "next/font/google";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SpendingBudgetChart from "@/components/logic-chart";
import { subWeeks, subMonths, format } from "date-fns";
import ForecastChart from "@/components/forecast-chart";
import GoalGrid from "@/components/goal-grid";

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

const fetchAccounts = async (): Promise<any> => {
  const resTrue = await fetch("/api/accounts?isFromPlaid=true", {
    credentials: "include",
  });
  const resFalse = await fetch("/api/accounts?isFromPlaid=false", {
    credentials: "include",
  });
  if (!resTrue.ok || !resFalse.ok) {
    throw new Error("Failed to fetch accounts");
  }
  const jsonTrue = await resTrue.json();
  const jsonFalse = await resFalse.json();
  // Merge both arrays
  return [...jsonTrue.data, ...jsonFalse.data];
};


const LogicPage = () => {
  // Get accountId from the URL if needed.
  const searchParams = useSearchParams();
  const accountId = searchParams.get("accountId") || "";

  const today = new Date();

  // For forecasting, we use a period of 52 weeks (but later we filter by the first day of data)
  const forecastFrom = subWeeks(today, 52);
  const forecastTo = today;
  const forecastFromStr = format(forecastFrom, "yyyy-MM-dd");
  const forecastToStr = format(forecastTo, "yyyy-MM-dd");

  // For weekly comparisons: from 3 weeks ago until today.
  const weeklyFrom = subWeeks(today, 3);
  const weeklyTo = today;
  const weeklyFromStr = format(weeklyFrom, "yyyy-MM-dd");
  const weeklyToStr = format(weeklyTo, "yyyy-MM-dd");

  // For monthly comparisons: from 3 months ago until today.
  const monthlyFrom = subMonths(today, 3);
  const monthlyTo = today;
  const monthlyFromStr = format(monthlyFrom, "yyyy-MM-dd");
  const monthlyToStr = format(monthlyTo, "yyyy-MM-dd");

  // Query for the forecast summary data.
  const {
    data: forecastRawData,
    isLoading: isForecastLoading,
    error: forecastError,
  } = useQuery({
    queryKey: ["summary-forecast", { forecastFromStr, forecastToStr, accountId }],
    queryFn: () => fetchSummary(forecastFromStr, forecastToStr, accountId),
  });

  // Query for the weekly summary data (last 3 weeks).
  const {
    data: weeklyRawData,
    isLoading: isWeeklyLoading,
    error: weeklyError,
  } = useQuery({
    queryKey: ["summary-weekly", { weeklyFromStr, weeklyToStr, accountId }],
    queryFn: () => fetchSummary(weeklyFromStr, weeklyToStr, accountId),
  });

  // Query for the monthly summary data (last 3 months).
  const {
    data: monthlyRawData,
    isLoading: isMonthlyLoading,
    error: monthlyError,
  } = useQuery({
    queryKey: ["summary-monthly", { monthlyFromStr, monthlyToStr, accountId }],
    queryFn: () => fetchSummary(monthlyFromStr, monthlyToStr, accountId),
  });

  const {
    data: accountsData,
    isLoading: isAccountsLoading,
    error: accountsError,
  } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  if (weeklyError || monthlyError) {
    console.log("Error reading summary data.");
  }

  // In case the API response is missing any data, fall back to defaults.
  // (Ensure that each day object includes both income and expenses.)
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

  // Map daily data into the format needed for forecasting.
  // We now compute the net as (income - expenses).
  const forecastNetData =
    forecastData.days.map((day: any) => ({
      date: day.date,
      net: day.income - day.expenses,
    })) || [];

  // --- Filter out days prior to the effective start date ---
  // Effective start date: no earlier than 52 weeks ago,
  // but if the first day with nonzero net is later, use that.
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
      <Tabs defaultValue="monthly" className="lg:w-[74%] lg:ml-[13%]">
        <TabsList
          className="flex lg:w-full border border-gray-300 rounded-md mt-[130px] mb-[30px] lg:mt-[60px] lg:mb-[30px] z-50 mx-2 lg:mx-0"
        >
          <TabsTrigger value="weekly" className="w-1/3 text-center">
            Weekly
          </TabsTrigger>
          <TabsTrigger value="monthly" className="w-1/3 text-center">
            Monthly
          </TabsTrigger>
          <TabsTrigger value="forecast" className="w-1/3 text-center">
            Forecast
          </TabsTrigger>
        </TabsList>
        <div className="h-[200px] rounded-b-2xl">
          {/* Weekly tab: showing net values from the last 3 weeks */}
          <TabsContent value="weekly" className="mt-4">
            <SpendingBudgetChart
              data={monthlyData.days.map((day: any) => ({
                date: day.date,
                spending: day.expenses,
                budget: day.budget,
              }))}
              monthlyBudget={monthlyData.monthlyBudget}
              aggregation="week"
            />
          </TabsContent>
          {/* Monthly tab: showing net values from the last 3 months */}
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
          {/* Forecast tab: displaying historical net and projected net */}
          <TabsContent value="forecast" className="mt-4">
            <ForecastChart
              historicalData={filteredForecastData}
              monthlyBudget={monthlyData.monthlyBudget}
            />
          </TabsContent>
        </div>
      </Tabs>
      <div className="mt-[200px]"></div>
      {/* Insert the GoalPlanner below the charts */}
      <h1 className={cn(`w-full text-center text-4xl font-bold my-10 pt-5`, montserratH.className)}>Goals</h1>
      {!isAccountsLoading && accountsData && (
        <div className="lg:mx-[13%] px-5 pt-[1px] mx-1 pb-5 mb-10 shadow-md hover:shadow-lg rounded-xl bg-gray-50">
          <GoalGrid accounts={accountsData} />
        </div>
      )}
      {accountsError && <p className="w-full py-[100px] text-gray-600">Error loading accounts</p>}
    </div>
  );
};

export default LogicPage;
