"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { useUser } from '@clerk/clerk-react';
import { useEffect, useState } from "react";

const STRIPE_PUBLISHABLE_TEST_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_TEST_KEY!;
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

const SettingsPage = () => {
  const stripePromise = loadStripe(STRIPE_PUBLISHABLE_TEST_KEY);
  const { user } = useUser();
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('Loading...');
  const [subscriptionButton, setSubscriptionButton] = useState<string>('Loading...');

  const getSubscriptionLabel = (priceId: string): string => {
    const priceLabels: Record<string, string> = {
      'price_1PtVjyFsKVJDw69rKzGengkQ': 'Test',
      'price_1PtUYSFsKVJDw69raZF7jB0v': 'Monthly',
      'price_1PtUZXFsKVJDw69rewkjf2f1': 'Annual',
      'price_1PtUbMFsKVJDw69rMOHiQqgH': 'Lifetime',
    };

    return priceId;
  };

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/subscription-status?userId=${user.id}`)
        .then(response => response.json())
        .then(data => {
          const label = getSubscriptionLabel(data.plan);
          setSubscriptionStatus(label);
          if (label === "Free") {
            setSubscriptionButton("Upgrade");
          } else if (label === "Monthly" || label === "Annual" || label === "Test") {
            setSubscriptionButton("Change");
          } else if (label === "Lifetime") {
            setSubscriptionButton("Complete");
          }
        })
        .catch(() => setSubscriptionStatus('Error fetching subscription status'));
    }
  }, [user]);

  const handleCheckout = async () => {
    try {
      const stripe: Stripe | null = await stripePromise;

      if (stripe && user?.id && user?.emailAddresses[0]?.emailAddress) {
        const response = await fetch('/api/create-checkout-session', {
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

  return (
    <div className="mx-auto -mt-6 w-full max-w-screen-2xl pb-10">
      <Card className="border-none drop-shadow-sm">
        <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="line-clamp-1 text-xl">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex w-full border-t">
            <p className="w-[30%] md:w-[25%] lg:w-[20%] ml-[5%] md:ml-[10%] text-sm md:text-normal my-4 font-bold">
                Subscription Status
            </p>
            <p className="w-[35%] md:w-[20%] lg:w-[15%] pl-[10%] text-sm md:text-normal text-center md:text-left mt-4 text-gray-500">
              {subscriptionStatus}
            </p>
            <Button className="ml-[10%] md:ml-[20%] lg:ml-[40%] w-1/4 mt-2 border" variant="ghost" onClick={handleCheckout}>
              {subscriptionButton}
            </Button>
          </div>
          <div className="flex w-full border-t">
            <p className="w-[30%] md:w-[25%] lg:w-[20%] ml-[5%] md:ml-[10%] text-sm md:text-normal mt-4 font-bold">
              Accounts
            </p>
            <p className="w-[35%] md:w-[20%] lg:w-[15%] pl-[10%] text-center md:text-left mt-4 text-sm md:text-normal text-gray-500">
              None
            </p>
            <Button className="ml-[10%] md:ml-[20%] lg:ml-[40%] w-1/4 mt-2 border" variant="ghost">
              Connect
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
