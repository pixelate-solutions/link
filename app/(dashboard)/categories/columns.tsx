"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Actions } from "./actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type ResponseType = {
  id: string;
  name: string | null;
  totalIncome: string;
  totalCost: string;
  budgetAmount: string | null;
  amountLeftToSpend: string | null;
};

export const columns: ColumnDef<ResponseType>[] = [
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
    accessorKey: "totalIncome",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Income
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const income = parseFloat(row.getValue("totalIncome") as string) || 0;
      return (
        <Badge
          variant="primary"
          className="px-2.5 py-2.5 text-xs font-medium"
        >
          {formatCurrency(income)}
        </Badge>
      );
    },
    sortingFn: (rowA, rowB, columnId) => {
      const incomeA = parseFloat(rowA.getValue(columnId) as string) || 0;
      const incomeB = parseFloat(rowB.getValue(columnId) as string) || 0;
      return incomeA - incomeB;
    },
  },
  {
    accessorKey: "totalCost",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Expense
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const cost = parseFloat(row.getValue("totalCost") as string) || 0;
      return (
        <Badge
          variant="destructive"
          className="px-2.5 py-2.5 text-xs font-medium"
        >
          {formatCurrency(cost)}
        </Badge>
      );
    },
    sortingFn: (rowA, rowB, columnId) => {
      const costA = parseFloat(rowA.getValue(columnId) as string) || 0;
      const costB = parseFloat(rowB.getValue(columnId) as string) || 0;
      return costA - costB;
    },
  },
  {
    accessorKey: "budgetAmount",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Budget
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const budget = parseFloat(row.getValue("budgetAmount") as string) || 0;
      
      return (
        <Badge
          variant="outline"
          className="px-2.5 py-2.5 text-xs font-medium"
        >
          {formatCurrency(budget)}
        </Badge>
      );
    },
    sortingFn: (rowA, rowB, columnId) => {
      const budgetA = parseFloat(rowA.getValue(columnId) as string) || 0;
      const budgetB = parseFloat(rowB.getValue(columnId) as string) || 0;
      return budgetA - budgetB;
    },
  },
  {
    accessorKey: "amountLeftToSpend",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Net
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const amountLeft = parseFloat(row.getValue("amountLeftToSpend") as string) || 0;

      return (
        <Badge
          variant={amountLeft > 0 ? "success" : "secondary"} // Conditionally set the variant
          className="px-2.5 py-2.5 text-xs font-medium"
        >
          {amountLeft > 0 ? formatCurrency(amountLeft) : formatCurrency(0)} {/* Ensure it's formatted */}
        </Badge>
      );
    },
    sortingFn: (rowA, rowB, columnId) => {
      const amountLeftA = parseFloat(rowA.getValue(columnId) as string) || 0;
      const amountLeftB = parseFloat(rowB.getValue(columnId) as string) || 0;
      return amountLeftA - amountLeftB;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <Actions id={row.original.id} />,
  },
];
