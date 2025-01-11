import { z } from "zod";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { insertAccountSchema } from "@/db/schema";
import { useCreateAccount } from "@/features/accounts/api/use-create-account";
import { useNewAccount } from "@/features/accounts/hooks/use-new-account";

import { AccountForm } from "./account-form";

const formSchema = insertAccountSchema.pick({
  name: true,
  category: true,
  currentBalance: true,
});

type FormValues = z.infer<typeof formSchema>;

export const NewAccountSheet = () => {
  const { isOpen, onClose } = useNewAccount();
  const mutation = useCreateAccount();

  const onSubmit = (values: FormValues) => {
    const accountData = {
      ...values,
      isFromPlaid: false,
    };

    mutation.mutate(accountData, {
      onSuccess: () => {
        onClose();
      },
    });
  };

  return (
    <Sheet
      open={isOpen || mutation.isPending}
      onOpenChange={(open) => {
        onClose();
        setTimeout(() => {
          if (!open) {
            document.body.style.pointerEvents = "";
          }
        }, 100);
      }}
    >
      <SheetContent className="space-y-4">
        <SheetHeader>
          <SheetTitle>New Account</SheetTitle>
          <SheetDescription>
            Create a new account to track your transactions.
          </SheetDescription>
        </SheetHeader>

        <AccountForm
          defaultValues={{
            name: "",
            category: "",
            currentBalance: "",
            availableBalance: "",
          }}
          onSubmit={onSubmit}
          disabled={mutation.isPending}
        />
      </SheetContent>
    </Sheet>
  );
};
