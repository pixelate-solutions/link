"use client";

import { useSearchParams } from "next/navigation";
import { FaPiggyBank } from "react-icons/fa";
import { FaArrowTrendUp, FaArrowTrendDown } from "react-icons/fa6";

import { useGetSummary } from "@/features/summary/api/use-get-summary";
import { formatDateRange } from "@/lib/utils";

import { AccountsDataCard, DataCard, DataCardLoading } from "./data-card";

export const AccountsGrid = () => {
  const { data, isLoading } = useGetSummary();
  const searchParams = useSearchParams();
  const to = searchParams.get("to") || undefined;
  const from = searchParams.get("from") || undefined;

  const dateRangeLabel = formatDateRange({ to, from });

  if (isLoading)
    return (
      <div className="mb-8 grid grid-cols-1 gap-8 pb-2 lg:grid-cols-3">
        <DataCardLoading />
        <DataCardLoading />
        <DataCardLoading />
      </div>
    );

  return (
    <div className="mb-8 grid grid-cols-1 gap-8 pb-2 lg:grid-cols-3">
      <AccountsDataCard
        title="Liabilities"
        value={Number(data?.liabilities)}
        icon={FaArrowTrendDown}
        variant="danger"
      />
      <AccountsDataCard
        title="Assets"
        value={Number(data?.assets)}
        available={data?.availableAssets}
        icon={FaArrowTrendUp}
        variant="success"
      />
      <DataCard
        title="Net Worth"
        value={Number(data?.assets) + Number(data?.liabilities)}
        icon={FaPiggyBank}
        variant="default"
      />
    </div>
  );
};
