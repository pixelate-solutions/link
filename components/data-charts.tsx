"use client";

import { useGetSummary } from "@/features/summary/api/use-get-summary";
import { Chart, ChartLoading } from "./chart";
import { SpendingPie, SpendingPieLoading } from "./spending-pie";
import { BudgetVsSpendingChart } from "./budget-vs-spending-chart";

export const DataCharts = () => {
  const { data, isLoading } = useGetSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-6">
        <div className="col-span-1 lg:col-span-3 xl:col-span-4">
          <ChartLoading />
        </div>
        <div className="col-span-1 lg:col-span-3 xl:col-span-2">
          <SpendingPieLoading />
        </div>
      </div>
    );
  }

  const processedCategories = data?.categories?.map(item => ({
    name: item.name ?? 'Unknown',
    value: item.value,
  }));

  // Extracted budget and expenses data for the new chart
  const budgetVsSpendingData = data?.days.map(day => ({
    date: day.date,
    spending: day.expenses,
    budget: day.budget,
  })) || [];

  const fullData = data;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-6">
      {/* New budget vs spending chart */}
      <div className="col-span-1 lg:col-span-6">
        <BudgetVsSpendingChart fullData={data} data={budgetVsSpendingData} />
      </div>

      <div className="col-span-1 lg:col-span-3 xl:col-span-4">
        <Chart data={data?.days} />
      </div>

      <div className="col-span-1 lg:col-span-3 xl:col-span-2">
        <SpendingPie data={processedCategories} />
      </div>
    </div>
  );
};
