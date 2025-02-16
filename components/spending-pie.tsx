import { FileSearch, PieChart, Radar, Target } from "lucide-react";
import { useState } from "react";
import { ColorRing } from 'react-loader-spinner'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { PieVariant } from "./pie-variant";
import { RadarVariant } from "./radar-variant";
import { RadialVariant } from "./radial-variant";

type SpendingPieProps = {
  data?: {
    name: string;
    value: number;
  }[];
};

export const SpendingPie = ({ data = [] }: SpendingPieProps) => {
  type ChartType = "pie" | "radar" | "radial";
  const [chartType, setChartType] = useState<ChartType>("pie");

  const onTypeChange = (type: ChartType) => {
    setChartType(type);
  };
  return (
    <Card className="border-2 drop-shadow-md">
      <CardHeader className="flex justify-between space-y-2 lg:flex-row lg:items-center lg:space-y-0">
        <CardTitle className="line-clamp-1 text-xl">Categorized Expenses</CardTitle>

        <Select defaultValue={chartType} onValueChange={onTypeChange}>
          <SelectTrigger className="h-9 rounded-md px-3 lg:w-auto">
            <SelectValue placeholder="Chart type" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="pie">
              <div className="flex items-center">
                <PieChart className="mr-2 size-4 shrink-0" />

                <p className="line-clamp-1">Pie chart</p>
              </div>
            </SelectItem>

            <SelectItem value="radar">
              <div className="flex items-center">
                <Radar className="mr-2 size-4 shrink-0" />

                <p className="line-clamp-1">Radar chart</p>
              </div>
            </SelectItem>

            <SelectItem value="radial">
              <div className="flex items-center">
                <Target className="mr-2 size-4 shrink-0" />

                <p className="line-clamp-1">Radial chart</p>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[350px] w-full flex-col items-center justify-center gap-y-4">
            <FileSearch className="size-6 text-muted-foreground" />

            <p className="text-sm text-muted-foreground">
              No data for this period.
            </p>
          </div>
        ) : (
          <>
            {chartType === "pie" && <PieVariant data={data} />}
            {chartType === "radar" && <RadarVariant data={data} />}
            {chartType === "radial" && <RadialVariant data={data} />}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export const SpendingPieLoading = () => {
  return (
    <Card className="border-none drop-shadow-sm">
      <CardHeader className="flex justify-between space-y-2 lg:flex-row lg:items-center lg:space-y-0">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-full lg:w-[120px]" />
      </CardHeader>

      <CardContent>
        <div className="flex h-[350px] w-full items-center justify-center">
          <ColorRing
            visible={true}
            height="80"
            width="80"
            ariaLabel="color-ring-loading"
            wrapperStyle={{}}
            wrapperClass="color-ring-wrapper"
            colors={['#3B82F6', '#6366F1', '#7C3AED', '#9333EA', '#A855F7']}
          />
        </div>
      </CardContent>
    </Card>
  );
};
