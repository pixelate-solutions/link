"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from '@clerk/clerk-react';
import { useEffect, useState } from "react";
import { usePlaidLink } from 'react-plaid-link';
import { UpgradePopup } from "@/components/upgrade-popup";
import { Typewriter } from 'react-simple-typewriter';
import { Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";

const montserratP = Montserrat({
  weight: "600",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

const SettingsPage = () => {
  const { user, isLoaded } = useUser();
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('Loading...');
  const [subscriptionButton, setSubscriptionButton] = useState<string>('Loading...');
  const [openUpgradeDialog, setOpenUpgradeDialog] = useState<boolean>(false);
  const [plaidIsOpen, setPlaidIsOpen] = useState<boolean>(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [openPlaid, setOpenPlaid] = useState<() => void>(() => () => {});

  const [promoCode, setPromoCode] = useState("");
  const [featureBugRequest, setFeatureBugRequest] = useState("");

  // Fetch Plaid link token and initialize the Plaid Link UI
  useEffect(() => {
    const fetchLinkToken = async () => {
      if (user?.id) {
        try {
          const response = await fetch(`/api/plaid/connect`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ userId: user.id }),
          });

          const data = await response.json();
          setLinkToken(data.link_token);
        } catch (error) {
          console.error("Error connecting Plaid:", error);
        }
      }
    };

    fetchLinkToken();
  }, [user]);

  const onSuccess = async (public_token: string) => {
    try {
      const response = await fetch('/api/plaid/set-access-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ public_token, userId: user?.id }),
      });

      // After successfully setting the access token, upload accounts and transactions
      await fetch('/api/plaid/upload-accounts', { method: 'POST' });
      await fetch('/api/plaid/upload-transactions', { method: 'POST' });
      await fetch('/api/plaid/recurring', { method: 'POST' });

      setPlaidIsOpen(false);
    } catch (error) {
      console.error("Error exchanging public token and uploading data:", error);
    }
  };

  const config = {
    token: linkToken!,
    onSuccess,
    onExit: () => {
      setPlaidIsOpen(false);
    },
  };

  const { open, ready } = usePlaidLink(config);

  useEffect(() => {
    if (ready) {
      setOpenPlaid(() => open);
    }
  }, [ready, open]);

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/subscription-status?userId=${user.id}`)
        .then(response => response.json())
        .then(async (data) => {
          const label = data.plan;
          setSubscriptionStatus(label);
          if (label === "Free") {
            setSubscriptionButton("Upgrade");
          } else if (label === "Monthly" || label === "Annual") {
            setSubscriptionButton("Manage");
          } else if (label === "Lifetime") {
            setSubscriptionButton("Complete");
          }
        })
        .catch(() => setSubscriptionStatus('Error fetching subscription status'));
    }
  }, [user]);

  const handlePromoSubmit = async () => {
    // Fetch API logic for submitting promo code
    const response = await fetch("/api/apply-promo-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        promoCode,
      }),
    });

    if (response.ok) {
      alert("Promo code applied successfully!");
    } else {
      alert("Failed to apply promo code.");
    }
  };

  const handleFeatureBugSubmit = async () => {
    // Logic for sending email
    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: "support@budgetwithlink.com",
        subject: "Feature/Bug Report",
        body: `A feature or bug request from ${user?.firstName} ${user?.lastName} is as follows:\n\n${featureBugRequest}\n\nSincerely,\nLink Helper`,
      }),
    });

    if (response.ok) {
      alert("Feature/Bug request sent successfully!");
    } else {
      alert("Failed to send the request.");
    }
  };

  return (
    <div className={cn("relative", montserratP.className)}>
      {/* Overlay background when plaidIsOpen is true */}
      {plaidIsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 min-h-screen z-50"></div>
      )}

      {/* Plaid Popup */}
      {plaidIsOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded shadow-lg">
            <h2 className="text-xl mb-4 text-center">Connecting Data</h2>
            <p className="text-lg text-center">
              <Typewriter
                words={['Fetching your financial data...', 'Categorizing your transactions...', 'Creating your accounts...', 'Organizing your dashboard...']}
                loop={true}
                cursor
                cursorStyle="|"
                typeSpeed={70}
                deleteSpeed={50}
                delaySpeed={1000}
              />
            </p>
          </div>
        </div>
      )}

      {/* Main content */}
      <UpgradePopup open={openUpgradeDialog} onOpenChange={setOpenUpgradeDialog} />
      <div className="relative mx-auto -mt-12 w-full max-w-screen-2xl pb-10 z-50">
        <Card className="border-none drop-shadow-sm">
          {plaidIsOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 rounded-lg"></div>
          )}
          <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between align-middle">
            <CardTitle className="line-clamp-1 text-xl">Settings</CardTitle>
          </CardHeader>
          <CardContent className="pb-0">
            <div className="flex w-full border-t py-3 items-center">
              <p className="w-[30%] md:w-[25%] lg:w-[20%] ml-[5%] md:ml-[10%] text-sm md:text-normal my-4 font-bold">
                Current Subscription
              </p>
              <p className="w-[35%] md:w-[20%] lg:w-[35%] pl-[10%] text-sm md:text-normal text-center md:text-left text-gray-500">
                <b>{subscriptionStatus}</b>
              </p>
              <Button
                disabled={subscriptionButton === "Loading..." || subscriptionStatus === "Lifetime"}
                className="ml-[10%] md:ml-[20%] w-1/4 border"
                variant="ghost"
                onClick={() => setOpenUpgradeDialog(true)}>
                {subscriptionButton}
              </Button>
            </div>

            <div className="flex w-full border-t py-3 items-center">
              <p className="w-[30%] md:w-[25%] lg:w-[20%] ml-[5%] md:ml-[10%] text-sm md:text-normal my-4 font-bold">
                Link Accounts
              </p>
              <p className="hidden md:inline w-[35%] md:w-[20%] lg:w-[35%] pl-[10%] text-center md:text-left text-sm md:text-normal text-gray-500 pt-2">
                Link accounts to populate transactions automatically.
              </p>
              <Button
                disabled={subscriptionStatus === "Loading..."}
                className="hidden md:inline ml-[10%] md:ml-[20%] w-1/4 border"
                variant="ghost"
                onClick={() => {
                  if (subscriptionStatus !== "Free") {
                    openPlaid();
                    setPlaidIsOpen(true);
                  } else {
                    setOpenUpgradeDialog(true);
                  }
                }}>
                {subscriptionStatus === "Loading..." ? "Loading..." : "Link Account"}
              </Button>
            </div>

            {/* Promo Code Section */}
            <div className="flex w-full border-t py-3 items-center">
              <p className="w-[30%] md:w-[25%] lg:w-[20%] ml-[5%] md:ml-[10%] text-sm md:text-normal my-4 font-bold">
                Promo Code
              </p>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="input-field w-[35%] md:w-[20%] lg:w-[35%] border p-2"
                placeholder="Enter Promo Code"
              />
              <Button
                disabled={subscriptionStatus !== "Free"}
                onClick={handlePromoSubmit}
                className={`ml-[10%] md:ml-[20%] w-1/4 border ${subscriptionStatus !== "Free" ? "opacity-50 cursor-not-allowed" : ""}`}
                variant="ghost">
                Sign Up
              </Button>
            </div>

            {/* Feature/Bug Request Section */}
            <div className="flex w-full border-t py-3 items-center">
              <p className="w-[30%] md:w-[25%] lg:w-[20%] ml-[5%] md:ml-[10%] text-sm md:text-normal my-4 font-bold">
                Feature/Bug Request
              </p>
              <textarea
                value={featureBugRequest}
                onChange={(e) => setFeatureBugRequest(e.target.value)}
                className="textarea-field w-[35%] md:w-[20%] lg:w-[35%] border p-2 min-h-[40px] max-h-[250px]"
                placeholder="Enter your feature or bug request"
              />
              <Button
                onClick={handleFeatureBugSubmit}
                className="ml-[10%] md:ml-[20%] w-1/4 border"
                variant="ghost">
                Submit Request
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
