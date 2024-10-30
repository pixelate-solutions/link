"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox
import { formatCurrency } from "@/lib/utils";
import { RecurringActions } from "./recurring-actions";

export type RecurringTransaction = {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  categoryId: string;
  categoryName: string;
  frequency: string;
  averageAmount: string;
  lastAmount: string;
  isActive: string;
  date: Date; // Add date field
};

export const recurringColumns: ColumnDef<RecurringTransaction>[] = [
  {
    id: "select", // Checkbox column
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "date", // Add the date field
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Last Date
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const date = row.getValue("date") as Date;
      return <span>{format(date, "MMMM d, yyyy")}</span>; // Format date
    },
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Name
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "accountName",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Account
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const accountName = row.getValue("accountName") as string;
      return accountName;
    },
  },
  {
    accessorKey: "categoryName", // Updated to show categoryName
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Category
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "frequency",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Frequency
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "averageAmount",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Average Amount
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const amount = (row.getValue("averageAmount") || "0").toString();
      return (
        <Badge
          variant={parseFloat(amount) < 0 ? "destructive" : "primary"}
          className="px-2.5 py-2.5 text-xs font-medium"
        >
          {formatCurrency(parseFloat(amount))}
        </Badge>
      );
    },
    sortingFn: (rowA, rowB, columnId) => {
      const amountA = parseFloat(rowA.getValue(columnId) as string) || 0;
      const amountB = parseFloat(rowB.getValue(columnId) as string) || 0;
      return amountA - amountB;
    },
  },
  {
    accessorKey: "isActive",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Status
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <Badge
        variant={row.getValue("isActive") === "true" ? "primary" : "outline"}
        className="px-2.5 py-2.5 text-xs font-medium"
      >
        {row.getValue("isActive") === "true" ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <RecurringActions id={row.original.id} />,
  },
];
