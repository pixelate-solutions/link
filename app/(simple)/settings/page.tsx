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
import { toast } from "sonner";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "700",
  subsets: ["latin"],
});

const SettingsPage = () => {
  const { user } = useUser();
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('Loading...');
  const [subscriptionButton, setSubscriptionButton] = useState<string>('Loading...');
  const [openUpgradeDialog, setOpenUpgradeDialog] = useState<boolean>(false);
  const [plaidIsOpen, setPlaidIsOpen] = useState<boolean>(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [openPlaid, setOpenPlaid] = useState<() => void>(() => () => {});

  const [promoCode, setPromoCode] = useState("");
  const [featureBugRequest, setFeatureBugRequest] = useState("");

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

      await fetch('/api/plaid/upload-accounts', { method: 'POST' });
      await fetch('/api/plaid/upload-transactions', { method: 'POST' });
      await fetch('/api/plaid/recurring', { method: 'POST' });

      setPlaidIsOpen(false);

      window.location.reload();
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
    try {
      const response = await fetch("/api/apply-promo-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          promoCode: promoCode.trim(),
        }),
      });

      if (response.ok) {
        toast.success("Valid promo code!");
        window.location.reload();
      } else {
        toast.error("Please try again with a valid promo code.");
      }
    } catch (error) {
      console.error("Error submitting promo code:", error);
      toast.error("Something went wrong. Please try again later.");
    }
  };

  const handleFeatureBugSubmit = async () => {
    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: "support@budgetwithlink.com",
        subject: "Feature/Bug Report",
        body: `A feature or bug request from\n\nName: ${user?.firstName} ${user?.lastName}\nEmail: ${user?.emailAddresses}\nUser ID: ${user?.id}\n\nis as follows:\n\n"${featureBugRequest}"\n\nSincerely,\nLink`,
      }),
    });

    if (response.ok) {
        toast.success("Success!");
        window.location.reload();
      } else {
        toast.error("Error submitting request, please try again.");
      }
  };

  return (
    <div className={cn("relative", montserratP.className, "p-6 -mt-[120px] z-50")}>
      {plaidIsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
          <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
            <h2 className="text-2xl font-bold mb-4">Connecting Your Data</h2>
            <p className="text-lg text-gray-600">
              <Typewriter
                words={['Fetching your financial data...', 'Categorizing transactions...', 'Creating accounts...']}
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

      <UpgradePopup open={openUpgradeDialog} onOpenChange={setOpenUpgradeDialog} />
      <div className="max-w-5xl mx-auto py-12">
        <Card className="bg-white shadow-lg rounded-lg">
          <CardHeader className="p-8 border-b">
            <CardTitle className="text-4xl font-extrabold">Settings</CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-10">

            {/* Subscription Section */}
            <div className="space-y-4 relative md:flex md:justify-between md:items-center">
              <div>
                <p className="font-semibold text-lg">Current Subscription</p>
                <p className="text-gray-500">{subscriptionStatus}</p>
              </div>
              <Button
                disabled={subscriptionButton === "Loading..." || subscriptionStatus === "Lifetime"}
                className="mt-4 md:mt-0 px-6 py-3 w-full md:w-[200px]"
                variant="outline"
                onClick={() => setOpenUpgradeDialog(true)}
              >
                {subscriptionButton}
              </Button>
            </div>

            {/* Link Accounts Section */}
            <div className="space-y-4 relative md:flex md:justify-between md:items-center">
              <div>
                <p className="font-semibold text-lg">Link Accounts</p>
                <p className="text-gray-500">Sync transactions automatically.</p>
              </div>
              <Button
                disabled={subscriptionStatus === "Loading..."}
                className={cn("bg-gradient-to-br from-blue-500 to-purple-500 hover:opacity-85 text-white font-bold mt-4 md:mt-0 px-6 py-3 w-full md:w-[200px]", montserratH.className)}
                onClick={() => {
                  if (subscriptionStatus !== "Free") {
                    openPlaid();
                    setPlaidIsOpen(true);
                  } else {
                    setOpenUpgradeDialog(true);
                  }
                }}
              >
                {subscriptionStatus === "Loading..." ? "Loading..." : "Link"}
              </Button>
            </div>

            {/* Promo Code Section */}
            <div className="space-y-4 relative md:flex md:justify-between md:items-center">
              <div>
                <p className="font-semibold text-lg">Promo Code</p>
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  className="input border border-gray-300 rounded-lg px-4 py-2 shadow-sm w-full md:w-auto focus:outline-none mt-2"
                  placeholder="Enter promo code"
                />
              </div>
              <Button
                disabled={subscriptionStatus !== "Free" || promoCode === ""}
                className="mt-4 md:mt-0 px-6 py-3 w-full md:w-[200px]"
                variant="outline"
                onClick={handlePromoSubmit}
              >
                Submit
              </Button>
            </div>

            {/* Feature/Bug Section */}
            <div className="space-y-4 relative md:flex md:justify-between md:items-center">
              <div>
                <p className="font-semibold text-lg">Feature/Bug Request</p>
                <textarea
                  value={featureBugRequest}
                  onChange={(e) => setFeatureBugRequest(e.target.value)}
                  className="textarea border border-gray-300 rounded-lg p-4 shadow-sm w-full md:w-auto md:min-w-[350px] focus:outline-none mt-2"
                  placeholder="Enter your feature or bug request"
                  rows={4}
                />
              </div>
              <Button
                disabled={subscriptionStatus !== "Free" || featureBugRequest === ""}
                className="mt-4 md:mt-0 px-6 py-3 w-full md:w-[200px]"
                onClick={handleFeatureBugSubmit}
                variant="outline"
              >
                Submit
              </Button>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
