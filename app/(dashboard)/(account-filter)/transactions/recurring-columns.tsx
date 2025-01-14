"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format, parse } from "date-fns";
import { ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  date: Date;
};

export const recurringColumns = (windowWidth: number): ColumnDef<RecurringTransaction>[] => [
  {
    id: "select",
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
    accessorKey: "date",
    header: ({ column }) => (
      <Button
        className="text-xs md:text-sm"
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Last Date
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const stringDate = row.getValue("date") as string;
      const date = parse(stringDate, "yyyy-MM-dd", new Date())

      return <span className="lg:ml-4">{format(date, "M/d/yy")}</span>;
    },
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        className="text-xs md:text-sm"
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
        className="hidden lg:flex"
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Account
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const accountName = row.getValue("accountName") as string;
      if (windowWidth >= 1024) {
        return accountName;
      } else {
        return null
      }
    },
  },
  {
    accessorKey: "categoryName",
    header: ({ column }) => (
      <Button
        className="hidden lg:flex"
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Category
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      if (windowWidth < 1024) {
        return null;
      } else {
        return row.getValue("categoryName");
      }
    },
  },
  {
    accessorKey: "frequency",
    header: ({ column }) => (
      <Button
        className="hidden lg:flex"
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Frequency
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      if (windowWidth < 1024) {
        return null;
      } else {
        return row.getValue("frequency");
      }
    },
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <Button
        className="text-xs md:text-sm -ml-[40px] lg:ml-0"
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Last Amount
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const amount = (row.getValue("amount") || "0").toString();
      return (
        <Badge
          variant={parseFloat(amount) < 0 ? "destructive" : "primary"}
          className="px-2.5 py-2.5 text-xs font-medium -ml-[40px] lg:ml-0"
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
        className="hidden lg:flex"
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
        className="px-2.5 py-2.5 text-xs font-medium hidden lg:inline"
      >
        {row.getValue("isActive") === "true" ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <div className="-ml-[40px] lg:ml-0"><RecurringActions id={row.original.id} /></div>,
  },
];
