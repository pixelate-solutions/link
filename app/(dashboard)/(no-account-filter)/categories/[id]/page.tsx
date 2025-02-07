"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import { Montserrat } from "next/font/google";
import { formatCurrency } from "@/lib/utils";

import { ColorRing } from 'react-loader-spinner'

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

// Extend the Category interface to include type.
interface Category {
  id: string;
  userId: string | null;
  name: string | null;
  budgetAmount: string | null;
  isFromPlaid: boolean;
  type: string;
}

// Adjust to match the shape from /api/plaid/category-totals
interface CategoryTotals {
  categoryId: string;
  totalCost: number;
  totalIncome: number;
}

export default function CategoryDetails() {
  const router = useRouter();
  const { id } = useParams(); // "id" from route
  const searchParams = useSearchParams();

  // If you have date filters:
  const from = searchParams?.get("from") || "";
  const to = searchParams?.get("to") || "";

  const [category, setCategory] = useState<Category | null>(null);
  const [totals, setTotals] = useState<{ totalCost: number; totalIncome: number } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Local form state now includes "type"
  const [formData, setFormData] = useState({
    name: "",
    budgetAmount: "",
    type: "income",
  });

  // ====== Fetch Single Category ======
  const fetchCategory = async (categoryId: string) => {
    try {
      const res = await fetch(`/api/categories/${categoryId}`);
      if (!res.ok) throw new Error("Failed to fetch category");
      const json = await res.json();
      const cat: Category = json.data;
      setCategory(cat);
      setFormData({
        name: cat.name || "",
        budgetAmount: cat.budgetAmount || "0",
        type: cat.type || "income",
      });
    } catch (err) {
      console.error(err);
    }
  };

  // ====== Fetch Category Totals (cost/income) ======
  const fetchCategoryTotals = async (categoryId: string) => {
    try {
      const res = await fetch(
        `/api/plaid/category-totals?from=${from}&to=${to}&categoryId=${categoryId}`
      );
      if (!res.ok) throw new Error("Failed to fetch category totals");

      const data: CategoryTotals[] = await res.json();
      const matching = data.find((item) => item.categoryId === categoryId);

      if (matching) {
        setTotals({
          totalCost: matching.totalCost ?? 0,
          totalIncome: matching.totalIncome ?? 0,
        });
      } else {
        setTotals({ totalCost: 0, totalIncome: 0 });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ====== On mount / route change ======
  useEffect(() => {
    if (!id) return;
    const categoryId = Array.isArray(id) ? id[0] : id;
    fetchCategory(categoryId);
    fetchCategoryTotals(categoryId);
  }, [id, from, to]);

  // ====== Handle form changes ======
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ====== Save / PATCH ======
  const handleSave = async () => {
    if (!category) return;
    setIsLoading(true);
    try {
      // Build the payload always including type.
      const payload: any = {
        name: formData.name,
        type: formData.type,
      };
      // Only include budgetAmount if the selected type is not "transfer"
      if (formData.type !== "transfer") {
        payload.budgetAmount = formData.budgetAmount;
      }
      const response = await fetch(`/api/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to update category");
      const json = await response.json();
      const updated: Category = json.data;
      setCategory(updated);
      setIsEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ====== Delete ======
  const handleDelete = async () => {
    if (!category) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete category");
      router.push("/categories");
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsDeleteOpen(false);
    }
  };

  if (!category) {
    return (
      <div className="flex justify-center items-center h-32">
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
    );
  }

  return (
    <div className={`p-4 max-w-md mx-auto bg-white rounded-md shadow-sm ${montserratP.className}`}>
      {/* “Back” button, only if not editing */}
      {!isEditing && (
        <div className="mb-4 -ml-2">
          <Button
            variant="ghost"
            className="flex items-center gap-2 text-gray-800 border shadow-sm rounded-lg text-sm"
            onClick={() => router.push("/categories")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      )}

      <h1 className="text-lg font-bold text-gray-800 mb-4">Category Details</h1>

      {isEditing ? (
        // ================= EDIT MODE =================
        <div className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-xs font-bold text-gray-600">
              Name
            </Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="mt-1"
            />
          </div>

          {/* Always show the type dropdown */}
          <div>
            <Label htmlFor="type" className="text-xs font-bold text-gray-600 mr-2">
              Type
            </Label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="mt-1 p-2 border rounded"
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
            {formData.type === "transfer" && (
              <p className="text-red-500 text-xs mt-1">
                Transfers will not be counted toward totals.
              </p>
            )}
          </div>

          {/* Only show budget info if the selected type is not transfer */}
          {formData.type !== "transfer" && (
            <>
              <div>
                <Label htmlFor="budgetAmount" className="text-xs font-bold text-gray-600">
                  Monthly Budget
                </Label>
                <Input
                  id="budgetAmount"
                  name="budgetAmount"
                  type="number"
                  step="0.01"
                  value={formData.budgetAmount}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>
              {totals && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs font-bold text-gray-600">Spent</p>
                    <p className="text-sm text-red-700">
                      {formatCurrency(totals.totalCost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-600">Income</p>
                    <p className="text-sm text-green-700">
                      {formatCurrency(totals.totalIncome)}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          <Button
            onClick={handleSave}
            className="w-full bg-blue-500 hover:bg-blue-600"
            disabled={isLoading}
          >
            Save
          </Button>
        </div>
      ) : (
        // ================= VIEW MODE =================
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-gray-600">Name</p>
            <p className="text-sm">{category.name || "Untitled Category"}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-600">Type</p>
            <p className="text-sm capitalize">{category.type || "None"}</p>
          </div>
          {category.type !== "transfer" && (
            <>
              <div>
                <p className="text-xs font-bold text-gray-600">Monthly Budget</p>
                <p className="text-sm text-gray-700">
                  {formatCurrency(Number(category.budgetAmount) || 0)}
                </p>
              </div>
              {totals && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs font-bold text-gray-600">Spent</p>
                    <p className="text-sm text-red-700">
                      {formatCurrency(totals.totalCost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-600">Income</p>
                    <p className="text-sm text-green-700">
                      {formatCurrency(totals.totalIncome)}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
          <Button
            onClick={() => setIsEditing(true)}
            className="w-full bg-blue-400 hover:bg-blue-500"
          >
            Edit
          </Button>

          <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full bg-red-400 hover:bg-red-500">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-lg w-[95%]">
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. It will permanently delete this category.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-500" onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
