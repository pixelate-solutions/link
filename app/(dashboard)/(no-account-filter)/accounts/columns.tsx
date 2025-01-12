import { ColumnDef } from "@tanstack/react-table";
import { InferResponseType } from "hono";
import { ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { client } from "@/lib/hono";
import { formatCurrency } from "@/lib/utils";

import { Actions } from "./actions";
import { Badge } from "@/components/ui/badge";

export type ResponseType = InferResponseType<
  typeof client.api.accounts.$get,
  200
>["data"][0];

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
    accessorKey: "currentBalance",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Balance
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const balance = parseFloat(row.getValue("currentBalance") as string) || 0;
      return <Badge
          variant={balance < 0 ? "destructive" : balance === 0 ? "outline" : "primary"}
          className="px-2.5 py-2.5 text-xs font-medium"
        >
          {formatCurrency(balance)}
        </Badge>;
    },
    sortingFn: (rowA, rowB, columnId) => {
      const balanceA = parseFloat(rowA.getValue(columnId) as string) || 0;
      const balanceB = parseFloat(rowB.getValue(columnId) as string) || 0;
      return balanceA - balanceB;
    },
  },
  {
    accessorKey: "availableBalance",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Available Balance
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const availableBalance =
        parseFloat(row.getValue("availableBalance") as string) || 0;
      return <Badge
        variant={availableBalance < 0 ? "destructive" : availableBalance === 0 ? "outline" : "primary"}
        className="px-2.5 py-2.5 text-xs font-medium"
      >
        {formatCurrency(availableBalance)}
      </Badge>;
    },
    sortingFn: (rowA, rowB, columnId) => {
      const availableBalanceA =
        parseFloat(rowA.getValue(columnId) as string) || 0;
      const availableBalanceB =
        parseFloat(rowB.getValue(columnId) as string) || 0;
      return availableBalanceA - availableBalanceB;
    },
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
        Cost
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
    id: "actions",
    cell: ({ row }) => <Actions id={row.original.id} />,
  },
];
