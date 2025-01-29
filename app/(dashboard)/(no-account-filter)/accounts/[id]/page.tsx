"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Shadcn UI
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
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

import { formatCurrency } from "@/lib/utils";
import { Montserrat } from "next/font/google";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

interface Account {
  id: string;
  userId: string;
  name: string;
  category: string;
  currentBalance?: string;
  availableBalance?: string;
  isFromPlaid: boolean;
  // ...any other fields in your Accounts table
}

interface TotalsData {
  income: number; // total income
  cost: number;   // total expenses
  // other fields if needed
}

// If you store categories separately, you might fetch them here:
const accountCategories = [
  "Credit cards",
  "Depositories",
  "Investments",
  "Loans",
  "Others",
];

export default function AccountDetails() {
  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();

  // If you have date filters from the URL:
  const from = searchParams?.get("from") || "";
  const to = searchParams?.get("to") || "";

  const [account, setAccount] = useState<Account | null>(null);
  const [totals, setTotals] = useState<TotalsData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Local form state
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    currentBalance: "",
    availableBalance: "",
  });

  // ====== Fetch Single Account ======
  const fetchAccount = async (accountId: string) => {
    try {
      const res = await fetch(`/api/accounts/${accountId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch account");
      }
      const json = await res.json();
      const acc: Account = json.data;
      setAccount(acc);

      // Initialize form data
      setFormData({
        name: acc.name || "",
        category: acc.category || "",
        currentBalance: acc.currentBalance || "0",
        availableBalance: acc.availableBalance || "0",
      });
    } catch (error) {
      console.error(error);
    }
  };

  // ====== Fetch Totals (income/cost) for this account ======
  const fetchTotals = async (accountId: string) => {
    try {
      // Same endpoint you used in accounts/page.tsx:
      // /api/plaid/account-totals?from=...&to=...&accountId=...
      const url = `/api/plaid/account-totals?from=${from}&to=${to}&accountId=${accountId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch totals");

      const json = await res.json();
      // The endpoint might return something like { income, cost, ... }
      // Adjust to match your actual response shape
      setTotals({
        income: json.totalIncome ?? 0,
        cost: json.totalCost ?? 0,
      });
    } catch (error) {
      console.error(error);
    }
  };

  // ====== Load Data on Mount ======
  useEffect(() => {
    // Early return if "id" is null/undefined
    if (!id) return;

    // If "id" is an array, take the first element; otherwise use it as is
    const accountId = Array.isArray(id) ? id[0] : id;

    fetchAccount(accountId);
    fetchTotals(accountId);
    }, [id, from, to]);


  // ====== Handle Form Changes ======
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (value: string) => {
    setFormData((prev) => ({ ...prev, category: value }));
  };

  // ====== PATCH Account ======
  const handleSave = async () => {
    if (!account) return;
    setIsLoading(true);

    try {
      const payload = {
        name: formData.name,
        category: formData.category,
        currentBalance: formData.currentBalance,
        availableBalance: formData.availableBalance,
      };

      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to update account");
      }

      const json = await response.json();
      const updated: Account = json.data;
      setAccount(updated); // update local state
      setIsEditing(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // ====== DELETE Account ======
  const handleDelete = async () => {
    if (!account) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete account");
      }

      // After delete, navigate back to main accounts list
      router.push("/accounts");
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
      setIsDeleteOpen(false);
    }
  };

  // ====== Loading or not found ======
  if (!account) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 animate-spin"></div>
      </div>
    );
  }

  // ====== Layout ======
  return (
    <div className={`p-4 -mt-6 mb-6 max-w-md mx-auto bg-white rounded-md shadow-sm ${montserratP.className}`}>
      {/* Back button, if not in edit mode */}
      {!isEditing && (
        <div className="mb-4 -ml-2">
          <Button
            variant="ghost"
            className="flex items-center gap-2 text-gray-800 border shadow-sm rounded-lg text-sm"
            onClick={() => router.push("/accounts")}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
      )}

      <h1 className="text-lg font-bold text-gray-800 mb-4">Account Details</h1>

      {isEditing ? (
        // ====================== EDIT MODE ======================
        <div className="space-y-4">
          {/* Name */}
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

          {/* Category (Select) */}
          <div>
            <Label className="text-xs font-bold text-gray-600">Category</Label>
            <Select
              value={formData.category}
              onValueChange={handleCategoryChange}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {accountCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Current Balance */}
          <div>
            <Label htmlFor="currentBalance" className="text-xs font-bold text-gray-600">
              Current Balance
            </Label>
            <Input
              id="currentBalance"
              name="currentBalance"
              type="number"
              value={formData.currentBalance}
              onChange={handleChange}
              className="mt-1"
            />
          </div>

          {/* Available Balance */}
          <div>
            <Label htmlFor="availableBalance" className="text-xs font-bold text-gray-600">
              Available Balance
            </Label>
            <Input
              id="availableBalance"
              name="availableBalance"
              type="number"
              value={formData.availableBalance}
              onChange={handleChange}
              className="mt-1"
            />
          </div>

          {/* Income & Cost are derived from transactions, so typically read-only */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold text-gray-600">Income</Label>
              <p className="text-sm">
                {totals ? formatCurrency(totals.income) : "$0.00"}
              </p>
            </div>
            <div>
              <Label className="text-xs font-bold text-gray-600">Cost</Label>
              <p className="text-sm">
                {totals ? formatCurrency(totals.cost) : "$0.00"}
              </p>
            </div>
          </div>

          {/* Save Changes */}
          <Button
            onClick={handleSave}
            className="w-full bg-blue-500 hover:bg-blue-600"
            disabled={isLoading}
          >
            Save
          </Button>
        </div>
      ) : (
        // ====================== VIEW MODE ======================
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-gray-600">Name</p>
            <p className="text-sm">{account.name}</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Category</p>
            <p className="text-sm">{account.category || "Others"}</p>
          </div>

          <div>
            <p className={`text-xs font-bold text-gray-600`}>Balance</p>
            <p className={`text-sm font-bold ${Number(account.currentBalance) >= 0 ? "text-green-700" : "text-red-700"}`}>
              {formatCurrency(Number(account.currentBalance) || 0)}
            </p>
          </div>

          <div>
            <p className={`text-xs font-bold text-gray-600`}>Available Balance</p>
            <p className={`text-sm font-bold ${Number(account.availableBalance) >= 0 ? "text-green-700" : "text-red-700"}`}>
              {formatCurrency(Number(account.availableBalance) || 0)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-gray-600">Income</p>
              <p className={`text-sm ${Number(totals?.income) >= 0 ? "text-green-700" : "text-red-700"}`}>
                {totals ? formatCurrency(totals.income) : "$0.00"}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-600">Cost</p>
              <p className={`text-sm ${Number(totals?.income) >= 0 ? "text-green-700" : "text-red-700"}`}>
                {totals ? formatCurrency(totals.cost) : "$0.00"}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <Button
            onClick={() => setIsEditing(true)}
            className="w-full bg-blue-400 hover:bg-blue-500"
          >
            Edit
          </Button>

          <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full bg-red-400 hover:bg-red-500"
              >
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-lg w-[95%]">
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete this account
                  and all of its related data.
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
