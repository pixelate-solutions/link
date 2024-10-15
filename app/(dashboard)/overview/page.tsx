import { DataCharts } from "@/components/data-charts";
import { DataGrid } from "@/components/data-grid";
import { cn } from "@/lib/utils";
import { Montserrat } from "next/font/google";

const montserratP = Montserrat({
  weight: "600",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

const DashboardPage = () => {
  return (
    <div className={cn("mx-auto -mt-6 w-full max-w-screen-2xl pb-10", montserratP.className)}>
      <DataGrid />

      <DataCharts />
    </div>
  );
};

export default DashboardPage;
