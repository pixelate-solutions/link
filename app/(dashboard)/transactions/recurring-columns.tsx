"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Actions } from "./actions"; // Import the Actions component
import { AccountColumn } from "./account-column"; // Import AccountColumn for clickable accounts
import { RecurringActions } from "./recurring-actions";

export type RecurringTransaction = {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  categoryName: string;
  frequency: string;
  averageAmount: string;
  lastAmount: string;
  isActive: string;
};

export const recurringColumns: ColumnDef<RecurringTransaction>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
  },
  {
    accessorKey: "accountName",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Account
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const accountName = row.getValue("accountName") as string;
      const accountId = row.getValue("accountId") as string;
      
      return accountName;
    },
  },
  {
    accessorKey: "categoryName",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Category
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
  },
  {
    accessorKey: "frequency",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Frequency
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
  },
  {
    accessorKey: "averageAmount",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Average Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
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
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <Badge
        variant={row.getValue("isActive") === "true" ? "primary" : "secondary"}
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
