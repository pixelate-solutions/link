import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from "@/components/ui/alert-dialog";
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
  // Change test
  const STRIPE_PUBLISHABLE_TEST_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_TEST_KEY!;

  const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!;
  const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
  // Change test
  const stripePromise = loadStripe(STRIPE_PUBLISHABLE_TEST_KEY);
  const [currentSubscription, setCurrentSubscription] = useState<string>('Free');
  const [canceling, setCanceling] = useState<boolean>(false);

  const { user } = useUser();

  const handleCheckout = async (url: string) => {
    try {
      const stripe: Stripe | null = await stripePromise;

      if (stripe && user?.id && user?.emailAddresses[0]?.emailAddress) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.id,
            customerEmail: user.emailAddresses[0].emailAddress,
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

  const handleCancel = async (url: string) => {
    try {
      const response = await fetch(url, {
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
        console.log('Subscription canceled successfully:', result);
        setCurrentSubscription('Free');
        // Inform the parent component to update its state
        if (user?.id) {
          fetch(`/api/subscription-status?userId=${user.id}`)
            .then(response => response.json())
            .then(data => {
              setCurrentSubscription(data.plan);
            });
        }
      } else {
        console.error('Failed to cancel subscription:', result.error);
      }
    } catch (error) {
      console.error('Error canceling subscription:', error);
    }
  };

  const handleSwitch = async (newPriceId: string) => {
    try {
      const response = await fetch('/api/switch-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPriceId }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Subscription switched successfully:', data);
        // Handle successful subscription switch (e.g., update UI, show success message)
      } else {
        console.error('Failed to switch subscription:', data.error);
        // Handle errors (e.g., show error message)
      }
    } catch (error) {
      console.error('Error switching subscription:', error);
    }
  };


  useEffect(() => {
    if (user?.id) {
      fetch(`/api/subscription-status?userId=${user.id}`)
        .then(response => response.json())
        .then(data => {
          setCurrentSubscription(data.plan);
          if (data.cancelAtPeriodEnd) {
            setCanceling(true);
          } else {
            setCanceling(false);
          }
        })
        .catch(() => setCurrentSubscription('Error fetching subscription status'));
    }
  }, [user, open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="md:p-4 p-4 rounded-lg w-[90%] md:w-full">
        <div className="flex justify-between items-center">
          <AlertDialogTitle className="text-xl font-bold">Link Premium</AlertDialogTitle>
          <Button className="hover:bg-transparent" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="w-8 h-8 p-1 border border-gray-200 shadow-md hover:shadow-none rounded-lg" />
          </Button>
        </div>
        <AlertDialogDescription className="mb-4">
          Choose a subscription plan that suits your needs.
        </AlertDialogDescription>
        {/* TEST */}
        <div className="flex items-center">
          <div className="ml-[10%] w-1/3 font-semibold">Test</div>
          <div className="hidden md:inline w-1/3 text-gray-500">$0.00</div>
          {(currentSubscription !== "Test" || canceling) && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={canceling} variant="ghost" onClick={() => {
                if (currentSubscription === "Free") {
                  handleCheckout('/api/create-test-checkout-session');
                } else {
                  handleSwitch(process.env.STRIPE_TEST_PRICE_ID!);
                }
              }} className="bg-gray-100 text-black hover:bg-200 hidden md:inline w-1/2 border border-transparent hover:border-gray-300">
                Select
              </Button>
            </AlertDialogAction>
          )}
          {currentSubscription !== "Test" && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={canceling} variant="ghost" onClick={() => {
                if (currentSubscription === "Free") {
                  handleCheckout('/api/create-test-checkout-session');
                } else {
                  handleSwitch(process.env.STRIPE_TEST_PRICE_ID!);
                }
              }} className="bg-gray-100 text-black hover:bg-200 md:hidden w-1/2 border border-transparent hover:border-gray-300">
                $0.00
              </Button>
            </AlertDialogAction>
          )}
          {(currentSubscription === "Test" && !canceling) && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={currentSubscription !== "Test" || canceling} variant="ghost" onClick={() => handleCancel('/api/cancel-test-subscription')} className="bg-gray-100 text-black hover:bg-200 hidden md:inline w-1/2 border border-transparent hover:border-gray-300">
                Cancel
              </Button>
            </AlertDialogAction>
          )}
        </div>
        {/* TEST END */}
        {/* MONTHLY */}
        <div className="flex items-center">
          <div className="ml-[10%] w-1/3 font-semibold">Monthly</div>
          <div className="hidden md:inline w-1/3 text-gray-500">$7.50/month</div>
          {(currentSubscription !== "Monthly" || canceling) && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={canceling} variant="ghost" onClick={() => {
                if (currentSubscription === "Free") {
                  handleCheckout('/api/create-monthly-checkout-session');
                } else {
                  handleSwitch(process.env.STRIPE_MONTHLY_PRICE_ID!);
                }
              }} className="bg-gray-100 text-black hover:bg-200 hidden md:inline w-1/2 border border-transparent hover:border-gray-300">
                Select
              </Button>
            </AlertDialogAction>
          )}
          {currentSubscription !== "Monthly" && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={canceling} variant="ghost" onClick={() => {
                if (currentSubscription === "Free") {
                  handleCheckout('/api/create-monthly-checkout-session');
                } else {
                  handleSwitch(process.env.STRIPE_MONTHLY_PRICE_ID!);
                }
              }} className="bg-gray-100 text-black hover:bg-200 md:hidden w-1/2 border border-transparent hover:border-gray-300">
                $7.50
              </Button>
            </AlertDialogAction>
          )}
          {(currentSubscription === "Monthly" && !canceling) && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={currentSubscription !== "Monthly"  || canceling} variant="ghost" onClick={() => handleCancel('/api/cancel-monthly-subscription')} className="bg-gray-100 text-black hover:bg-200 hidden md:inline w-1/2 border border-transparent hover:border-gray-300">
                Cancel
              </Button>
            </AlertDialogAction>
          )}
        </div>
        {/* MONTHLY END */}
        {/* ANNUAL */}
        <div className="flex items-center">
          <div className="ml-[10%] w-1/3 font-semibold">Annual</div>
          <div className="hidden md:inline w-1/3 text-gray-500">$75.00/year</div>
          {(currentSubscription !== "Annual" || canceling) && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={false} variant="ghost" onClick={() => {
                if (currentSubscription === "Free") {
                  handleCheckout('/api/create-annual-checkout-session');
                } else {
                  handleSwitch(process.env.STRIPE_ANNUAL_PRICE_ID!);
                }
              }} className="bg-gray-100 text-black hover:bg-200 hidden md:inline w-1/2 border border-transparent hover:border-gray-300">
                Select
              </Button>
            </AlertDialogAction>
          )}
          {currentSubscription !== "Annual" && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={canceling} variant="ghost" onClick={() => {
                if (currentSubscription === "Free") {
                  handleCheckout('/api/create-annual-checkout-session');
                } else {
                  handleSwitch(process.env.STRIPE_ANNUAL_PRICE_ID!);
                }
              }} className="bg-gray-100 text-black hover:bg-200 md:hidden w-1/2 border border-transparent hover:border-gray-300">
                $75.00
              </Button>
            </AlertDialogAction>
          )}
          {(currentSubscription === "Annual" && !canceling) && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={currentSubscription !== "Annual"  || canceling} variant="ghost" onClick={() => handleCancel('/api/cancel-annual-subscription')} className="bg-gray-100 text-black hover:bg-200 hidden md:inline w-1/2 border border-transparent hover:border-gray-300">
                Cancel
              </Button>
            </AlertDialogAction>
          )}
        </div>
        {/* ANNUAL END */}
        {/* LIFETIME */}
        <div className="flex items-center">
          <div className="ml-[10%] w-1/3 font-semibold">Lifetime</div>
          <div className="hidden md:inline w-1/3 text-gray-500">$90.00</div>
          {(currentSubscription !== "Lifetime" || canceling) && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={canceling} variant="ghost" onClick={() => {
                if (currentSubscription === "Free") {
                  handleCheckout('/api/create-lifetime-checkout-session');
                } else {
                  handleSwitch(process.env.STRIPE_LIFETIME_PRICE_ID!);
                }
              }} className="bg-gray-100 text-black hover:bg-200 hidden md:inline w-1/2 border border-transparent hover:border-gray-300">
                Select
              </Button>
            </AlertDialogAction>
          )}
          {currentSubscription !== "Lifetime" && (
            <AlertDialogAction asChild className="w-1/3">
              <Button disabled={canceling} variant="ghost" onClick={() => {
                if (currentSubscription === "Free") {
                  handleCheckout('/api/create-lifetime-checkout-session');
                } else {
                  handleSwitch(process.env.STRIPE_LIFETIME_PRICE_ID!);
                }
              }} className="bg-gray-100 text-black hover:bg-200 md:hidden w-1/2 border border-transparent hover:border-gray-300">
                $90.00
              </Button>
            </AlertDialogAction>
          )}
        </div>
        {/* LIFETIME END */}
      </AlertDialogContent>
    </AlertDialog>
  );
};
