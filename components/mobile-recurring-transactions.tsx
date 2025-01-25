import React, { useState } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import Link from "next/link";
import { RecurringTransaction } from "@/app/(dashboard)/(account-filter)/transactions/recurring-columns";
import { formatCurrency } from "@/lib/utils";

interface MobileRecurringProps {
  recurringTransactions: RecurringTransaction[];
}

export function MobileRecurringTransactions({ recurringTransactions }: MobileRecurringProps) {
  const [data, setData] = useState<RecurringTransaction[]>(() =>
    recurringTransactions.slice(0, 20)
  );
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState(""); // State for the search bar

  // Helper function to truncate strings
  const truncateString = (str: string, maxLength: number) =>
    str.length > maxLength ? `${str.slice(0, maxLength).trim()}...` : str;

  // Handle search input
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value.toLowerCase());
    setData(
      recurringTransactions.filter((tx) =>
        (tx.name || "").toLowerCase().includes(e.target.value.toLowerCase()) ||
        (tx.categoryName || "").toLowerCase().includes(e.target.value.toLowerCase())
      )
    );
    setHasMore(false); // Disable infinite scroll during search
  };

  // Load next batch of data for infinite scroll
  const fetchMoreData = () => {
    if (data.length >= recurringTransactions.length) {
      setHasMore(false);
      return;
    }

    const nextBatch = recurringTransactions.slice(data.length, data.length + 20);
    setData((prev) => [...prev, ...nextBatch]);
  };

  return (
    <div>
      {/* Search Bar */}
      <div className="p-2">
        <input
          type="text"
          placeholder="Search by name or category"
          value={searchTerm}
          onChange={handleSearch}
          className="w-full p-2 border border-gray-300 rounded-md text-xs"
        />
      </div>

      {/* Recurring Transactions List */}
      <InfiniteScroll
        dataLength={data.length}
        next={fetchMoreData}
        hasMore={hasMore}
        loader={<p className="text-center text-[10px] py-2 text-gray-500">Loading...</p>}
      >
        {data.map((tx) => {
          const formattedDate = new Date(tx.date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          const amountClasses =
            parseFloat(tx.lastAmount.toString()) >= 0
              ? "text-green-500"
              : "text-red-500";

          return (
            <Link
              href={`/recurring/${tx.id}`}
              key={tx.id}
              className="block"
            >
              <div className="flex items-center justify-between border-b px-1 border-gray-200 hover:bg-gray-50 py-4 rounded-lg">
                <div className="flex flex-col">
                  <span className="text-black text-[14px] font-medium leading-tight">
                    {truncateString(tx.name || "", 14)}
                  </span>
                  <span className="text-gray-500 text-[12px]">{formattedDate}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-blue-600 text-[12px] text-right">
                    {truncateString(tx.categoryName || "", 18)}
                  </span>
                  <span className={`font-semibold text-sm ${amountClasses}`}>
                    {formatCurrency(Number(tx.lastAmount))}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </InfiniteScroll>
    </div>
  );
}
