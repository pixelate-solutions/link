import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

interface UpgradePopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const UpgradePopup = ({ open, onOpenChange }: UpgradePopupProps) => {
  const monthlyPriceId = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
  ? process.env.NEXT_PUBLIC_STRIPE_MONTHLY_TEST_PRICE_ID
  : process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID;
  
  const annualPriceId = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
  ? process.env.NEXT_PUBLIC_STRIPE_ANNUAL_TEST_PRICE_ID
  : process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID;
  
  const lifetimePriceId = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
  ? process.env.NEXT_PUBLIC_STRIPE_LIFETIME_TEST_PRICE_ID
  : process.env.NEXT_PUBLIC_STRIPE_LIFETIME_PRICE_ID;

  const publishableKey = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
  ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_TEST_KEY
  : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  
  const stripePromise = loadStripe(publishableKey!);
  const [currentSubscription, setCurrentSubscription] = useState<string>('Free');
  const [startOrSwitch, setStartOrSwitch] = useState<string>('Start');
  const [cancelPopupOpen, setCancelPopupOpen] = useState<boolean>(false);
  const [popupMessage, setPopupMessage] = useState<string>('Choose a subscription plan that suits your needs.');

  const { user } = useUser();

  const handleCheckout = async (priceId: string) => {
    try {
      const stripe: Stripe | null = await stripePromise;
      if (stripe && user?.id && user?.emailAddresses[0]?.emailAddress) {
        const response = await fetch(`/api/create-checkout-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.id,
            customerEmail: user.emailAddresses[0].emailAddress,
            priceId: priceId
          }),
        });

        const { sessionId } = await response.json();

        const result = await stripe.redirectToCheckout({ sessionId });
        if (result.error) {
          console.error(result.error.message);
        }
      } else {
        console.error('Stripe object or user information is missing.');
      }
    } catch (error) {
      console.error('Error during checkout:', error);
    }
  };

  const handleCancel = async (isSwitch = false) => {
    try {
      const response = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setCurrentSubscription('Free');
        if (user?.id) {
          fetch(`/api/subscription-status?userId=${user.id}`)
            .then(response => response.json())
            .then(data => {
              setCurrentSubscription(data.plan);
            });
        }
        // Redirect to the URL returned by the server
        if (!isSwitch) {
          window.location.href = result.redirectUrl || '/overview';
        }
        return { ok: true };
      } else {
        console.error('Failed to cancel subscription:', result.error);
      }
    } catch (error) {
      console.error('Error canceling subscription:', error);
    }
  };


  const handleSwitch = async (newPriceId: string) => {
    try {
      // Cancel the current subscription
      const cancelResult = await handleCancel(true);
      if (cancelResult) {
        if (cancelResult.ok) {
          // Proceed to checkout only if cancellation was successful
          await handleCheckout(newPriceId);
        } else {
          console.error('Failed to cancel current subscription.');
        }
      }
    } catch (error) {
      console.error('Error during subscription switch:', error);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/subscription-status?userId=${user.id}`)
        .then(response => response.json())
        .then(data => {
          setCurrentSubscription(data.plan);
        })
        .catch(() => setCurrentSubscription('Error fetching subscription status'));
    }
    if (currentSubscription === "Free") {
      setStartOrSwitch("Start");
      setPopupMessage("Choose a subscription plan that suits your needs.");
    } else {
      setStartOrSwitch("Switch");
      setPopupMessage("Change your subscription status and receive a prorated refund for unused time.")
    }
  }, [user, open, currentSubscription]);

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent className="md:p-4 p-4 rounded-lg w-[90%] md:w-full">
          <div className="flex justify-between items-center">
            <AlertDialogTitle className="text-xl font-bold">Link Premium</AlertDialogTitle>
            <Button className="hover:bg-transparent" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="w-8 h-8 p-1 border border-gray-200 shadow-md hover:shadow-none rounded-lg" />
            </Button>
          </div>
          <AlertDialogDescription className="mb-4">
            {popupMessage}
          </AlertDialogDescription>
          {/* MONTHLY */}
          <div className="flex items-center border-b pb-4">
            <div className="ml-[10%] w-1/3 font-semibold">Monthly</div>
            <div className="hidden md:inline w-1/3 text-gray-500">$7.90/mo</div>
            {(currentSubscription !== "Monthly") && (
              <AlertDialogAction asChild className="w-1/3">
                <Button variant="ghost" onClick={() => {
                  if (currentSubscription === "Free") {
                    handleCheckout(monthlyPriceId!);
                  } else {
                    handleSwitch(monthlyPriceId!);
                  }
                }} className="bg-green-100 text-black hover:bg-200 hidden md:inline w-1/2 border border-transparent hover:border-gray-300">
                  {startOrSwitch}
                </Button>
              </AlertDialogAction>
            )}
            {(currentSubscription !== "Monthly") && (
              <AlertDialogAction asChild className="w-1/3">
                <Button variant="ghost" onClick={() => {
                  if (currentSubscription === "Free") {
                    handleCheckout(monthlyPriceId!);
                  } else {
                    handleSwitch(monthlyPriceId!);
                  }
                }} className="bg-gray-100 text-black hover:bg-200 md:hidden w-1/2 border border-transparent hover:border-gray-300">
                  $7.90
                </Button>
              </AlertDialogAction>
            )}
            {(currentSubscription === "Monthly") && (
              <AlertDialogAction asChild className="w-1/3">
                <Button variant="ghost" onClick={() => setCancelPopupOpen(true)} className="bg-red-100 text-black hover:bg-200 md:inline w-1/2 border border-transparent hover:border-gray-300">
                  Cancel
                </Button>
              </AlertDialogAction>
            )}
          </div>
          {/* MONTHLY END */}
          {/* ANNUAL */}
          <div className="flex items-center border-b pb-4">
            <div className="ml-[10%] w-1/3 font-semibold">Annual</div>
            <div className="hidden md:inline w-1/3 text-gray-500">$79.00/yr</div>
            {(currentSubscription !== "Annual") && (
              <AlertDialogAction asChild className="w-1/3">
                <Button variant="ghost" onClick={() => {
                  if (currentSubscription === "Free") {
                    handleCheckout(annualPriceId!);
                  } else {
                    handleSwitch(annualPriceId!);
                  }
                }} className="bg-green-100 text-black hover:bg-200 hidden md:inline w-1/2 border border-transparent hover:border-gray-300">
                  {startOrSwitch}
                </Button>
              </AlertDialogAction>
            )}
            {(currentSubscription !== "Annual") && (
              <AlertDialogAction asChild className="w-1/3">
                <Button variant="ghost" onClick={() => {
                  if (currentSubscription === "Free") {
                    handleCheckout(annualPriceId!);
                  } else {
                    handleSwitch(annualPriceId!);
                  }
                }} className="bg-gray-100 text-black hover:bg-200 md:hidden w-1/2 border border-transparent hover:border-gray-300">
                  $79.00
                </Button>
              </AlertDialogAction>
            )}
            {(currentSubscription === "Annual") && (
              <AlertDialogAction asChild className="w-1/3">
                <Button variant="ghost" onClick={() => setCancelPopupOpen(true)} className="bg-red-100 text-black hover:bg-200 md:inline w-1/2 border border-transparent hover:border-gray-300">
                  Cancel
                </Button>
              </AlertDialogAction>
            )}
          </div>
          {/* ANNUAL END */}
          {/* LIFETIME */}
          <div className="flex items-center">
            <div className="ml-[10%] w-1/3 font-semibold">Lifetime</div>
            <div className="hidden md:inline w-1/3 text-gray-500">$395.00</div>
            {(currentSubscription !== "Lifetime") && (
              <AlertDialogAction asChild className="w-1/3">
                <Button variant="ghost" onClick={() => {
                  if (currentSubscription === "Free") {
                    handleCheckout(lifetimePriceId!);
                  } else {
                    handleSwitch(lifetimePriceId!);
                  }
                }} className="bg-green-100 text-black hover:bg-200 hidden md:inline w-1/2 border border-transparent hover:border-gray-300">
                  {startOrSwitch}
                </Button>
              </AlertDialogAction>
            )}
            {(currentSubscription !== "Lifetime") && (
              <AlertDialogAction asChild className="w-1/3">
                <Button variant="ghost" onClick={() => {
                  if (currentSubscription === "Free") {
                    handleCheckout(lifetimePriceId!);
                  } else {
                    handleSwitch(lifetimePriceId!);
                  }
                }} className="bg-gray-100 text-black hover:bg-200 md:hidden w-1/2 border border-transparent hover:border-gray-300">
                  $395.00
                </Button>
              </AlertDialogAction>
            )}
            {(currentSubscription === "Lifetime") && (
              <AlertDialogAction asChild className="w-1/3">
                <Button variant="ghost" onClick={() => setCancelPopupOpen(true)} className="bg-red-100 text-black hover:bg-200 md:inline w-1/2 border border-transparent hover:border-gray-300">
                  Cancel
                </Button>
              </AlertDialogAction>
            )}
          </div>
          {/* LIFETIME END */}
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelPopupOpen} onOpenChange={setCancelPopupOpen}>
        <AlertDialogContent className="p-4 rounded-lg w-[90%] md:w-full">
          <AlertDialogTitle className="text-xl font-bold">Confirm Cancellation</AlertDialogTitle>
          <AlertDialogDescription className="mb-4">
            Are you sure you want to cancel your subscription? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button className="text-black" onClick={() => setCancelPopupOpen(false)}>Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button className="bg-red-500 hover:bg-red-400" variant="destructive" onClick={() => {
                handleCancel();
                setCancelPopupOpen(false);
              }}>Confirm</Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
