"use client";

import React, { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { useParams } from "next/navigation";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

// Shadcn UI components (adjust paths as needed)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { format } from "date-fns"; // for formatting dates in the UI
import { useUser } from "@clerk/nextjs";

interface Category {
  id: string;
  name: string;
  budgetAmount: string | null;
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

const TransactionDetails = () => {
  const { id } = useParams(); // Transaction ID from the URL
  const router = useRouter();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { user } = useUser();
  const userId = user?.id;

  // Form data is stored as strings, but we'll convert as needed before PATCH
  const [formData, setFormData] = useState({
    payee: "",
    date: "",       // "YYYY-MM-DD"
    categoryId: "",
    amount: "",     // "99.95" (will convert to number)
    notes: "",
  });

  // Local state for the calendar popover
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  /**
   * Fetch all categories for the user (once).
   */
  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      const json = await response.json();
      setCategories(json.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  /**
   * Fetch the transaction details by ID.
   */
  const fetchTransaction = async (transactionId: string) => {
    try {
      const transactionResponse = await fetch(`/api/transactions/${transactionId}`);
      if (!transactionResponse.ok) throw new Error("Failed to fetch transaction.");

      const { data }: { data: Transaction } = await transactionResponse.json();
      setTransaction(data);

      // Populate the form data for editing
      setFormData({
        payee: data.payee || "",
        date: new Date(data.date).toISOString().split("T")[0],
        categoryId: data.categoryId || "",
        amount: data.amount.toString(),
        notes: data.notes || "",
      });

      // Set up the local date for the Calendar
      setSelectedDate(new Date(data.date));
    } catch (error) {
      console.error("Error fetching transaction details:", error);
    }
  };

  /**
   * On component mount or when `id` changes, fetch transaction & categories
   */
  useEffect(() => {
    if (!id) return;
    const transactionId = Array.isArray(id) ? id[0] : id;

    fetchTransaction(transactionId);
    fetchCategories();
  }, [id]);

  /**
   * Update form state when user changes payee, amount, notes, etc.
   */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Handler for saving the transaction after editing.
   */
  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Ensure the date in formData is properly set from selectedDate
      let dateString = formData.date;
      if (selectedDate) {
        // convert Date to "YYYY-MM-DD"
        dateString = selectedDate.toISOString().split("T")[0];
      }

      // Convert amount to a number so it matches the schema
      if (!transaction) {
        return;
      }

      const uniquePlaidId = transaction.plaidTransactionId
        ? transaction.plaidTransactionId
        : null;

      // Build the payload
      const payload = {
        userId: userId,
        amount: formData.amount,
        payee: formData.payee,
        notes: formData.notes || null,
        date: dateString,               
        accountId: transaction.accountId,
        categoryId: formData.categoryId || null,
        plaidTransactionId: uniquePlaidId,
        isFromPlaid: transaction.isFromPlaid || null,
      };

      const response = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to update transaction.");
      
      const { data }: { data: Transaction } = await response.json();
      setTransaction(data); // Update local state with newly saved data
      setIsEditing(false);
      setIsLoading(false);
    } catch (error) {
      console.error(error);
    }
  };

  if (!transaction) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 animate-spin"></div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 animate-spin"></div>
      </div>
    );
  }

  // Find the name of the category based on the transaction’s categoryId
  const currentCategory = categories.find((cat) => cat.id === transaction.categoryId);
  const currentCategoryName = currentCategory?.name || "Uncategorized";

  return (
    <div className="p-4 -mt-6 mb-6 max-w-md mx-auto border border-gray-200 rounded-md shadow-md bg-white">
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
      <h1 className="text-lg font-bold text-gray-800 mb-4">Transaction Details</h1>

      {isEditing ? (
        <div className="space-y-4">
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
                    ? format(new Date(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate()), "PP")
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
                      : new Date() // Fallback to current date if selectedDate is null
                  }
                  onSelect={(date) => {
                    if (date) {
                      // Convert the selected date to UTC
                      const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                      setSelectedDate(utcDate);
                    } else {
                      setSelectedDate(new Date()); // Fallback to current date
                    }
                  }}
                  initialFocus
                />

              </PopoverContent>
            </Popover>
          </div>

          {/* Category (shadcn Select) */}
          <div>
            <Label htmlFor="categoryId" className="text-xs font-bold text-gray-600">
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

          {/* Amount */}
          <div>
            <Label htmlFor="amount" className="text-xs font-bold text-gray-600">
              Amount
            </Label>
            <Input
              id="amount"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              className="mt-1"
              type="number"
              step="0.01"
            />
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-xs font-bold text-gray-600">
              Notes
            </Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="mt-1"
            />
          </div>

          {/* Save button */}
          <Button onClick={handleSave} className="w-full bg-blue-400">
            Save
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-gray-600">Payee</p>
            <p className="text-sm text-gray-800">{transaction.payee}</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Date</p>
            <p className="text-sm text-gray-800">
              {new Date(transaction.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Category</p>
            <p className="text-sm text-gray-800">{currentCategoryName}</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Amount</p>
            <p className="text-sm text-gray-800">
              {formatCurrency(transaction.amount)}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600">Notes</p>
            <p className="text-sm text-gray-800">{transaction.notes || "No notes provided."}</p>
          </div>

          <Button variant="default" onClick={() => setIsEditing(true)} className="w-full bg-gradient-to-br bg-blue-400">
            Edit
          </Button>
        </div>
      )}
    </div>
  );
};

export default TransactionDetails;
