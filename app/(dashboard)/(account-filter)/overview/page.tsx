"use client"

import { DataCharts } from "@/components/data-charts";
import { DataGrid } from "@/components/data-grid";
import { cn } from "@/lib/utils";
import { Montserrat } from "next/font/google";
import { useEffect } from "react";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

const DashboardPage = () => {
  useEffect(() => {
      window.scrollTo(0, 0);
  }, []);
  return (
    <div className={cn("mx-auto -mt-6 w-full max-w-screen-2xl pb-10", montserratP.className)}>
      <DataGrid />
      <DataCharts />
    </div>
  );
};

export default DashboardPage;
