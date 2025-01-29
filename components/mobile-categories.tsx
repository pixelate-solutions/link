import React, { useState } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface Category {
  id: string;
  name: string | null;
  // You can include budgetAmount, totalCost, etc. if you want to show them in mobile
  budgetAmount?: string | null; 
  totalCost?: string | null;
}

interface MobileCategoriesProps {
  categories: Category[];
}

export function MobileCategories({ categories }: MobileCategoriesProps) {
  const [data, setData] = useState<Category[]>(() => categories.slice(0, 20));
  const [hasMore, setHasMore] = useState(true);

  // Loads the next batch (20 items)
  const fetchMoreData = () => {
    if (data.length >= categories.length) {
      setHasMore(false);
      return;
    }
    const nextBatch = categories.slice(data.length, data.length + 20);
    setData((prev) => [...prev, ...nextBatch]);
  };

  // Simple helper if you want to clamp or truncate
  const truncateString = (str: string, maxLength: number) =>
    str.length > maxLength ? `${str.slice(0, maxLength).trim()}...` : str;

  return (
    <div className="border rounded-md border-gray-200">
      <InfiniteScroll
        dataLength={data.length}
        next={fetchMoreData}
        hasMore={hasMore}
        loader={
          <p className="text-center text-xs py-2 text-gray-500">
            Loading more categories...
          </p>
        }
      >
        {data.map((cat) => {
          const displayName = cat.name ? truncateString(cat.name, 18) : "Unnamed";
          return (
            <Link href={`/categories/${cat.id}`} key={cat.id}>
              <div className="flex justify-between items-center border-b border-gray-100 px-3 py-4 hover:bg-gray-50">
                <div className="flex flex-col">
                  <span className="font-semibold text-sm text-black">
                    {displayName}
                  </span>
                  {/* If you want to show the budget or cost in the mobile card: */}
                  {cat.budgetAmount && (
                    <span className="text-[12px] text-gray-500">
                      Budget: {formatCurrency(Number(cat.budgetAmount))}
                    </span>
                  )}
                </div>
                {/* Possibly show totalSpent: */}
                {cat.totalCost && (
                    <div className="flex flex-col w-auto">
                        <span className="text-sm text-right">
                            Spent
                        </span>
                        <span className={`text-sm text-red-600 font-semibold ${Number(cat.totalCost) >= 0}`}>
                            {formatCurrency(Number(cat.totalCost))}
                        </span>
                    </div>
                )}
              </div>
            </Link>
          );
        })}
      </InfiniteScroll>
    </div>
  );
}
