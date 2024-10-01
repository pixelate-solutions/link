import { z } from "zod";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { insertCategorySchema } from "@/db/schema";
import { useCreateCategory } from "@/features/categories/api/use-create-category";
import { useNewCategory } from "@/features/categories/hooks/use-new-category";

import { CategoryForm } from "./category-form";

// Update form schema to include budgetAmount
const formSchema = insertCategorySchema.pick({
  name: true,
  budgetAmount: true, // Include budgetAmount here
});

type FormValues = z.infer<typeof formSchema>;

export const NewCategorySheet = () => {
  const { isOpen, onClose } = useNewCategory();
  const mutation = useCreateCategory();

  const onSubmit = (values: FormValues) => {
    // Ensure 'name' is a valid string
    const name = values.name?.trim();
    const budgetAmount = values.budgetAmount?.trim(); // Ensure budgetAmount is passed

    if (!name) {
      console.error("Name is required and cannot be empty.");
      return;
    }

    mutation.mutate({ name, budgetAmount }, { // Pass budgetAmount as well
      onSuccess: () => {
        onClose();
      },
    });
  };

  return (
    <Sheet open={isOpen || mutation.isPending} onOpenChange={(open) => {
        onClose();
        setTimeout(() => {
          if (!open) {
            document.body.style.pointerEvents = ''
          }
        }, 100)
      }}>
      <SheetContent className="space-y-4">
        <SheetHeader>
          <SheetTitle>New Category</SheetTitle>
          <SheetDescription>
            Create a new category to organize your transactions.
          </SheetDescription>
        </SheetHeader>

        <CategoryForm
          defaultValues={{
            name: "", // Default empty name
            budgetAmount: "", // Default empty budgetAmount
          }}
          onSubmit={onSubmit}
          disabled={mutation.isPending}
        />
      </SheetContent>
    </Sheet>
  );
};
