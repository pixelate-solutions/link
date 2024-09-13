"use client";

import { Loader2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBulkDeleteCategories } from "@/features/categories/api/use-bulk-delete-categories";
import { useGetCategories } from "@/features/categories/api/use-get-categories";
import { useNewCategory } from "@/features/categories/hooks/use-new-category";

// Import columns
import { columns } from "./columns";

// Define the type for the category totals
interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  totalCost: number;
  totalIncome: number;
}

const fetchCategoryTotals = async (from: string, to: string): Promise<CategoryTotal[]> => {
  const response = await fetch(`/api/plaid/category-totals?from=${from}&to=${to}`);
  if (!response.ok) throw new Error("Failed to fetch category totals.");
  return response.json();
};

const CategoriesPage = () => {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const newCategory = useNewCategory();
  const deleteCategories = useBulkDeleteCategories();

  const categoriesQuery = useGetCategories();
  const categories = categoriesQuery.data || [];

  // Fetch category totals every time the page loads
  const totalsQuery = useQuery({
    queryKey: ["categoryTotals", { from, to }],
    queryFn: () => fetchCategoryTotals(from, to),
    enabled: true, // Ensure the query runs on every page load
  });

  const isDisabled = categoriesQuery.isLoading || deleteCategories.isPending || totalsQuery.isLoading;

  if (categoriesQuery.isLoading || totalsQuery.isLoading) {
    return (
      <div className="mx-auto -mt-6 w-full max-w-screen-2xl pb-10">
        <Card className="border-none drop-shadow-sm">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>

          <CardContent>
            <div className="flex h-[500px] w-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-slate-300" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Debugging: Log the API data to ensure it's coming in correctly
  console.log('Totals Data:', totalsQuery.data);

  const categoriesWithTotals = categories.map(category => {
    // Find the total based on categoryId
    const total = totalsQuery.data?.find(total => total.categoryId === category.id) || { totalIncome: 0, totalCost: 0 };
    return {
      id: category.id,
      name: category.name,
      totalIncome: total.totalIncome.toFixed(2), // Convert to string with 2 decimal places
      totalCost: total.totalCost.toFixed(2), // Convert to string with 2 decimal places
    };
  });

  // Debugging: Log the transformed data
  console.log('Categories With Totals:', categoriesWithTotals);

  return (
    <div className="mx-auto -mt-6 w-full max-w-screen-2xl pb-10">
      <Card className="border-none drop-shadow-sm">
        <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="line-clamp-1 text-xl">
            Categories Page
          </CardTitle>

          <Button size="sm" onClick={newCategory.onOpen}>
            <Plus className="mr-2 size-4" /> Add new
          </Button>
        </CardHeader>

        <CardContent>
          <DataTable
            filterKey="name"
            columns={columns}
            data={categoriesWithTotals}
            onDelete={(row) => {
              const ids = row.map((r) => r.original.id);
              deleteCategories.mutate({ ids });
            }}
            disabled={isDisabled}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default CategoriesPage;
