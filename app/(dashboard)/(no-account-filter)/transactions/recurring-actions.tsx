"use client";

import { useState } from "react";
import { Edit, MoreHorizontal, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteRecurringTransaction } from "@/features/transactions/api/use-delete-recurring-transaction";
import { useConfirm } from "@/hooks/use-confirm";
import { EditRecurringTransactionSheet } from "@/features/transactions/components/edit-recurring-transaction-sheet";

type RecurringActionsProps = {
  id: string;
};

export const RecurringActions = ({ id }: RecurringActionsProps) => {
  const deleteMutation = useDeleteRecurringTransaction(id);

  // State to manage opening the sheet and passing the selected id
  const [openSheet, setOpenSheet] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // State to manage the dropdown open/close behavior
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [ConfirmDialog, confirm] = useConfirm(
    "Are you sure?",
    "You are about to delete this recurring transaction."
  );

  const handleDelete = async () => {
    const ok = await confirm();

    if (ok) {
      deleteMutation.mutate();
      setIsDropdownOpen(false); // Close the dropdown after deletion
    }
  };

  const handleEditClick = (id: string) => {
    setSelectedId(id);
    setOpenSheet(true);
    setIsDropdownOpen(false); // Close the dropdown after clicking edit
  };

  return (
    <>
      <ConfirmDialog />
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-8 p-0">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={deleteMutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              handleEditClick(id);
            }}
          >
            <Edit className="mr-2 size-4" />
            Edit
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={deleteMutation.isPending}
            onClick={handleDelete}
          >
            <Trash className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Include the Edit Recurring Transaction Sheet */}
      {openSheet && selectedId && (
        <EditRecurringTransactionSheet
          id={selectedId}
          onClose={() => setOpenSheet(false)}
        />
      )}
    </>
  );
};
