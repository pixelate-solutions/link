"use client"

import { DataCharts } from "@/components/data-charts";
import { DataGrid } from "@/components/data-grid";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
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
  const { user } = useUser();

  useEffect(() => {
      window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/subscription-status?userId=${user.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.plan === "Free") {
            fetch("/api/cancel-subscription/cleanup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            })
            .catch((err) => console.error("Error calling cleanup:", err));
          }
        })
        .catch((error) => console.error("Error fetching subscription status:", error));
    }
  }, [user?.id]);

  return (
    <div className={cn("mx-auto w-full max-w-screen-2xl pb-10", montserratP.className)}>
      <div className="absolute inset-0 overflow-x-clip">
        <div className="absolute -bottom-[950px] left-[3%] w-[300px] h-[500px] md:w-[600px] md:h-[700px] bg-purple-400 opacity-30 rounded-full filter blur-3xl -z-10" />
      </div>
      <DataGrid />
      <DataCharts />
    </div>
  );
};

export default DashboardPage;
