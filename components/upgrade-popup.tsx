import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export const UpgradePopup = () => {
  return (
    <AlertDialog>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Upgrade Your Subscription</AlertDialogTitle>
          <AlertDialogDescription>
            Choose a subscription plan that suits your needs.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col gap-2">
          <AlertDialogAction asChild>
            <Button variant="ghost" className="w-full">
              Monthly - $7.50/month
            </Button>
          </AlertDialogAction>
          <AlertDialogAction asChild>
            <Button variant="ghost" className="w-full">
              Annual - $75/year
            </Button>
          </AlertDialogAction>
          <AlertDialogAction asChild>
            <Button variant="ghost" className="w-full">
              Lifetime - $90
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default UpgradePopup;
