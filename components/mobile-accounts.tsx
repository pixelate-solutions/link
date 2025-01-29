import React, { useState } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
  category?: string;
  currentBalance?: string;
  availableBalance?: string;
  // Add or remove fields to match your schema as needed
}

interface MobileAccountsProps {
  accounts: Account[];
  // Possibly pass in a categoryName if you want it displayed in the mobile card
  categoryName?: string;
}

export function MobileAccounts({ accounts, categoryName }: MobileAccountsProps) {
  // We start with a slice of up to 20 accounts
  const [data, setData] = useState<Account[]>(() => accounts.slice(0, 20));
  const [hasMore, setHasMore] = useState(true);

  // Infinite scroll load
  const fetchMoreData = () => {
    if (data.length >= accounts.length) {
      setHasMore(false);
      return;
    }
    const nextBatch = accounts.slice(data.length, data.length + 20);
    setData((prev) => [...prev, ...nextBatch]);
  };

  // Helper to truncate
  const truncateString = (str: string, maxLength: number) =>
    str.length > maxLength ? `${str.slice(0, maxLength).trim()}...` : str;

  // Feel free to style these Mobile cards differently
  return (
    <div className="border border-gray-100 rounded">

      <InfiniteScroll
        dataLength={data.length}
        next={fetchMoreData}
        hasMore={hasMore}
        loader={
          <p className="text-center text-sm py-2 text-gray-500">
            Loading more accounts...
          </p>
        }
        // You can style this scrollable container as you like
      >
        {data.map((account) => {
          const displayName = truncateString(account.name ?? "", 16);
          const displayCat = truncateString(account.category ?? "Others", 18);

          return (
            <Link href={`/accounts/${account.id}`} key={account.id} className="block">
              <div className={`flex items-center justify-between border-b border-gray-200 hover:bg-opacity-50 px-3 py-4 rounded-lg m-1 ${Number(account.currentBalance) >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                <div className="flex flex-col">
                  <span className="font-semibold text-sm text-black leading-tight">
                    {displayName}
                  </span>
                  <span className="text-[12px] text-gray-500">
                    {displayCat}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold">Balance</span>
                  <span className={`text-sm ${Number(account.currentBalance) >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {formatCurrency(Number(account.currentBalance) ?? 0)}
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
