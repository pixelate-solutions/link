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
    <div className={cn("mx-auto w-full max-w-screen-2xl pb-10", montserratP.className)}>
      <div className="absolute inset-0">
        <div className="absolute -bottom-[950px] left-[3%] w-[300px] h-[500px] md:w-[600px] md:h-[700px] bg-purple-400 opacity-30 rounded-full filter blur-3xl -z-10" />
      </div>
      <DataGrid />
      <DataCharts />
    </div>
  );
};

export default DashboardPage;
