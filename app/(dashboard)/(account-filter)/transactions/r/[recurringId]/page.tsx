"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// shadcn components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// We can reuse the formatCurrency from utils
import { formatCurrency } from "@/lib/utils";

interface RecurringTransaction {
  id: string;
  userId: string;
  name: string;
  payee: string | null;
  accountId: string;
  categoryId: string | null;
  frequency: string;
  averageAmount: string;     // stored as text
  lastAmount: string | null; // also text or null
  date: string;   // typically "YYYY-MM-DD"
  isActive: string;
  streamId: string;
}

interface Transaction {
  id: string;                    // Primary key
  userId: string;                // Required (not null in DB)
  amount: number;                // Stored as text in DB, but use number here
  payee: string | null;          // Not required in DB, so it can be null
  notes: string | null;          // Not required in DB, so it can be null
  date: string;                  // "YYYY-MM-DD" or another date format
  accountId: string;             // Not null, references accounts.id
  categoryId: string | null;     // Can be null
  isFromPlaid: boolean;          // Default false, not null
  plaidTransactionId: string;    // Unique, not null
}

interface ApiRecurringResponse {
  error?: string;
  data?: {
    recurringTx: RecurringTransaction;
    siblings: Transaction[];
  };
}

// For categories + accounts
interface Category {
  id: string;
  name: string;
  budgetAmount: string | null;
}

interface Account {
  id: string;
  name: string;
  // other fields if needed
}

// We’ll store sibling transactions in an infinite scroll approach
const PAGE_SIZE = 20;

export default function RecurringTransactionPage() {
  // If you prefer to get the ID from the props:  function RecurringTransactionPage({ params }: PageProps)
  // But your standard code uses useParams, so let's keep consistent:
  const { recurringId } = useParams() as { recurringId: string };
  const router = useRouter();

  // Recurring transaction + siblings
  const [recurringTx, setRecurringTx] = useState<RecurringTransaction | null>(null);
  const [siblings, setSiblings] = useState<Transaction[]>([]);

  // For infinite scrolling siblings
  const [visibleSiblings, setVisibleSiblings] = useState<Transaction[]>([]);
  const [hasMore, setHasMore] = useState(false);

  // For loading & error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // For editing
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Dropdown data
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  // Form data for editing
  const [formData, setFormData] = useState({
    name: "",
    payee: "",
    date: "",
    accountId: "",
    categoryId: "",
    frequency: "",
    averageAmount: "",
    lastAmount: "",
    isActive: "",
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // 1. Fetch recurring transaction + siblings
  const fetchRecurringTransaction = async () => {
    try {
      const res = await fetch(`/api/recurring-page/${recurringId}`, {
        credentials: "include",
      });
      const json: ApiRecurringResponse = await res.json();

      if (!res.ok) {
        setError(json.error || "Request failed");
        return;
      }

      if (json.data?.recurringTx) {
        setRecurringTx(json.data.recurringTx);
        setSiblings(json.data.siblings || []);
      } else {
        setError("Recurring transaction not found.");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch categories + accounts to display names
  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/categories", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch categories");
      const { data } = await res.json();
      setCategories(data || []);
    } catch (error) {
      console.error(error);
    }
  };
  const fetchAllAccounts = async () => {
    // We fetch from both endpoints or unify them
    try {
      // fetch non-Plaid
      const resFalse = await fetch("/api/accounts?isFromPlaid=false", {
        credentials: "include",
      });
      const jsonFalse = await resFalse.json();
      const dataFalse = resFalse.ok ? jsonFalse.data || [] : [];

      // fetch Plaid
      const resTrue = await fetch("/api/accounts?isFromPlaid=true", {
        credentials: "include",
      });
      const jsonTrue = await resTrue.json();
      const dataTrue = resTrue.ok ? jsonTrue.data || [] : [];

      setAccounts([...dataFalse, ...dataTrue]);
    } catch (error) {
      console.error(error);
    }
  };

  // 3. On mount, fetch data
  useEffect(() => {
    if (!recurringId) return;
    fetchRecurringTransaction();
    fetchCategories();
    fetchAllAccounts();
  }, [recurringId]);

  // 4. Once siblings are loaded, set up for infinite scroll
  useEffect(() => {
    if (siblings.length > 0) {
      const initial = siblings.slice(0, PAGE_SIZE);
      setVisibleSiblings(initial);
      setHasMore(siblings.length > PAGE_SIZE);
    } else {
      setVisibleSiblings([]);
      setHasMore(false);
    }
  }, [siblings]);

  // 5. For editing: prefill formData from recurringTx
  useEffect(() => {
    if (recurringTx && isEditing) {
      setFormData({
        name: recurringTx.name || "",
        payee: recurringTx.payee || "",
        date: recurringTx.date, // "YYYY-MM-DD"
        accountId: recurringTx.accountId || "",
        categoryId: recurringTx.categoryId || "",
        frequency: recurringTx.frequency || "",
        averageAmount: recurringTx.averageAmount?.toString() || "",
        lastAmount: recurringTx.lastAmount?.toString() || "",
        isActive: recurringTx.isActive || "",
      });
      // Also set selectedDate for the calendar
      if (recurringTx.date) {
        setSelectedDate(new Date(recurringTx.date));
      }
    }
  }, [recurringTx, isEditing]);

  // 6. Handle changes to form
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 7. Save changes (PATCH request)
  const handleSave = async () => {
    if (!recurringTx) return;
    setIsSaving(true);

    try {
      let dateString = formData.date;
      if (selectedDate) {
        dateString = selectedDate.toISOString().split("T")[0];
      }

      const body = {
        ...formData,
        date: dateString,
      };

      // Make sure to call the correct PATCH endpoint for recurring
      const res = await fetch(`/api/recurring-page/${recurringTx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error("Failed to update recurring transaction.");
      }

      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }

      // Update local state
      const updated: RecurringTransaction = json.data; // e.g. { data: updatedTx } returned
      setRecurringTx(updated);
      setIsEditing(false);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to update recurring transaction");
    } finally {
      setIsSaving(false);
    }
  };

  // 8. Sibling infinite scroll
  const loadMoreSiblings = () => {
    if (!siblings) return;
    const currentLength = visibleSiblings.length;
    const more = siblings.slice(currentLength, currentLength + PAGE_SIZE);
    setVisibleSiblings([...visibleSiblings, ...more]);
    if (visibleSiblings.length + more.length >= siblings.length) {
      setHasMore(false);
    }
  };

  // Helper to get the account name from accounts
  const getAccountName = (acctId: string) => {
    const acct = accounts.find((a) => a.id === acctId);
    return acct ? acct.name : "Unknown account";
  };
  // Helper to get category name
  const getCategoryName = (catId: string | null) => {
    if (!catId) return "Uncategorized";
    const cat = categories.find((c) => c.id === catId);
    return cat ? cat.name : "Uncategorized";
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 animate-spin"></div>
      </div>
    );
  }
  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  if (!recurringTx) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 animate-spin"></div>
      </div>
    );
  }

  if (isSaving) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 animate-spin"></div>
      </div>
    );
  }

  // Display Mode vs. Editing Mode
  return (
    <div className="p-4 -mt-6 mb-6 max-w-md mx-auto border border-gray-200 rounded-md shadow-md bg-white">
      {/* Back button (like standard transaction page) */}
      {!isEditing && (
        <div className="mb-4 -ml-2 flex justify-start">
          <Button
            variant="ghost"
            className="flex items-center gap-2 text-gray-800 border shadow-sm rounded-lg text-sm"
            onClick={() => router.push("/transactions")}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
      )}

      <h1 className="text-lg font-bold text-gray-800 mb-4">
        Recurring Transaction Details
      </h1>

      {isEditing ? (
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
              type="text"
            />
          </div>

          {/* Payee */}
          <div>
            <Label htmlFor="payee" className="text-xs font-bold text-gray-600">
              Payee
            </Label>
            <Input
              id="payee"
              name="payee"
              value={formData.payee}
              onChange={handleChange}
              className="mt-1"
              type="text"
            />
          </div>

          {/* Date (Calendar popover) */}
          <div>
            <Label htmlFor="date" className="text-xs font-bold text-gray-600">
              Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="mt-1 w-full justify-start text-left font-normal"
                >
                  {selectedDate
                    ? format(
                        new Date(
                          selectedDate.getUTCFullYear(),
                          selectedDate.getUTCMonth(),
                          selectedDate.getUTCDate()
                        ),
                        "PP"
                      )
                    : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={
                    selectedDate
                      ? new Date(
                          selectedDate.getUTCFullYear(),
                          selectedDate.getUTCMonth(),
                          selectedDate.getUTCDate()
                        )
                      : new Date()
                  }
                  onSelect={(date) => {
                    if (date) {
                      const utcDate = new Date(
                        Date.UTC(
                          date.getFullYear(),
                          date.getMonth(),
                          date.getDate()
                        )
                      );
                      setSelectedDate(utcDate);
                    } else {
                      setSelectedDate(new Date());
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Account (shadcn Select) */}
          <div>
            <Label
              htmlFor="accountId"
              className="text-xs font-bold text-gray-600"
            >
              Account
            </Label>
            <Select
              value={formData.accountId}
              onValueChange={(value) => {
                setFormData((prev) => ({ ...prev, accountId: value }));
              }}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acct) => (
                  <SelectItem key={acct.id} value={acct.id}>
                    {acct.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category (shadcn Select) */}
          <div>
            <Label
              htmlFor="categoryId"
              className="text-xs font-bold text-gray-600"
            >
              Category
            </Label>
            <Select
              value={formData.categoryId}
              onValueChange={(value) => {
                setFormData((prev) => ({ ...prev, categoryId: value }));
              }}
            >
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frequency */}
          <div>
            <Label
              htmlFor="frequency"
              className="text-xs font-bold text-gray-600"
            >
              Frequency
            </Label>
            <Input
              id="frequency"
              name="frequency"
              value={formData.frequency}
              onChange={handleChange}
              className="mt-1"
              type="text"
              placeholder="e.g. monthly, weekly..."
            />
          </div>

          {/* Average Amount */}
          <div>
            <Label
              htmlFor="averageAmount"
              className="text-xs font-bold text-gray-600"
            >
              Average Amount
            </Label>
            <Input
              id="averageAmount"
              name="averageAmount"
              value={formData.averageAmount}
              onChange={handleChange}
              className="mt-1"
              type="number"
              step="0.01"
            />
          </div>

          {/* Last Amount */}
          <div>
            <Label
              htmlFor="lastAmount"
              className="text-xs font-bold text-gray-600"
            >
              Last Amount
            </Label>
            <Input
              id="lastAmount"
              name="lastAmount"
              value={formData.lastAmount}
              onChange={handleChange}
              className="mt-1"
              type="number"
              step="0.01"
            />
          </div>

          {/* isActive */}
          <div>
            <Label
                htmlFor="isActive"
                className="text-xs font-bold text-gray-600"
            >
                Is Active
            </Label>
            <Select
                value={formData.isActive}
                onValueChange={(value) => {
                setFormData((prev) => ({ ...prev, isActive: value }));
                }}
            >
                <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Select active status" />
                </SelectTrigger>
                <SelectContent>
                <SelectItem value="true">true</SelectItem>
                <SelectItem value="false">false</SelectItem>
                </SelectContent>
            </Select>
          </div>
          {/* Save button */}
          <Button onClick={handleSave} className="w-full bg-blue-500 text-white">
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Display mode */}
          <div>
            <p className="text-xs font-bold text-gray-600">Name</p>
            <p className="text-sm text-gray-800">{recurringTx.name}</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Payee</p>
            <p className="text-sm text-gray-800">{recurringTx.payee}</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Date</p>
            <p className="text-sm text-gray-800">
              {new Date(recurringTx.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}
            </p>
          </div>

          {/* Show account name, not ID */}
          <div>
            <p className="text-xs font-bold text-gray-600">Account</p>
            <p className="text-sm text-gray-800">
              {getAccountName(recurringTx.accountId)}
            </p>
          </div>

          {/* Show category name, not ID */}
          <div>
            <p className="text-xs font-bold text-gray-600">Category</p>
            <p className="text-sm text-gray-800">
              {getCategoryName(recurringTx.categoryId)}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Frequency</p>
            <p className="text-sm text-gray-800">{recurringTx.frequency}</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Average Amount</p>
            <p className="text-sm text-gray-800">
              {recurringTx.averageAmount
                ? formatCurrency(parseFloat(recurringTx.averageAmount))
                : "$0.00"}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Last Amount</p>
            <p className="text-sm text-gray-800">
              {recurringTx.lastAmount
                ? formatCurrency(parseFloat(recurringTx.lastAmount))
                : "$0.00"}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Is Active</p>
            <p className="text-sm text-gray-800">{recurringTx.isActive}</p>
          </div>

          <Button
            variant="default"
            onClick={() => setIsEditing(true)}
            className="w-full bg-blue-400 text-white"
          >
            Edit
          </Button>
        </div>
      )}

      {/* Divider */}
      <hr className="my-6" />

      {/* Sibling transactions (infinite scroll style), no streamId displayed */}
      <h2 className="text-lg font-semibold mb-2">
        All Occurences
      </h2>

      {visibleSiblings.length === 0 ? (
        <p className="text-sm text-gray-600">No occurences found.</p>
      ) : (
        <div>
          {visibleSiblings.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between border-b border-gray-200 py-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium">{tx.payee}</span>
                <span className="text-xs text-gray-500">
                  {format(new Date(tx.date).toLocaleDateString(), "PP")}
                </span>
              </div>
              <div className="text-right">
                <span className="block">
                  {getCategoryName(tx.categoryId)}
                </span>
                <span
                  className={
                    parseFloat(tx.amount.toString() ?? "0") >= 0
                      ? "text-green-600 font-semibold"
                      : "text-red-500 font-semibold"
                  }
                >
                  {tx.amount
                    ? formatCurrency(tx.amount)
                    : "$0.00"}
                </span>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center mt-2">
              <Button
                variant="outline"
                onClick={loadMoreSiblings}
                className="text-sm"
              >
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
