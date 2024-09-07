"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from '@clerk/clerk-react';
import { useEffect, useState } from "react";
import { usePlaidLink } from 'react-plaid-link';
import { UpgradePopup } from "@/components/upgrade-popup";

const SettingsPage = () => {
  const { user, isLoaded } = useUser();
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('Loading...');
  const [subscriptionButton, setSubscriptionButton] = useState<string>('Loading...');
  const [openUpgradeDialog, setOpenUpgradeDialog] = useState<boolean>(false);
  const [plaidIsOpen, setPlaidIsOpen] = useState<boolean>(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [openPlaid, setOpenPlaid] = useState<() => void>(() => () => {});

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

      console.log("Accounts and transactions uploaded");
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
    if (ready) {
      setOpenPlaid(() => open);
    }
  }, [ready, open]);

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/subscription-status?userId=${user.id}`)
        .then(response => response.json())
        .then(data => {
          const label = data.plan;
          setSubscriptionStatus(label);
          if (label === "Free") {
            setSubscriptionButton("Upgrade");
          } else if (label === "Monthly" || label === "Annual") {
            setSubscriptionButton("Update");
          } else if (label === "Lifetime") {
            setSubscriptionButton("Complete");
          }
        })
        .catch(() => setSubscriptionStatus('Error fetching subscription status'));
    }
  }, [user]);

  return (
    <div className={`relative ${plaidIsOpen ? 'blur-md' : ''}`}>
      <UpgradePopup open={openUpgradeDialog} onOpenChange={setOpenUpgradeDialog} />
      <div className={`mx-auto -mt-6 w-full max-w-screen-2xl pb-10 ${plaidIsOpen ? 'opacity-75' : ''}`}>
        <Card className="border-none drop-shadow-sm">
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
                Automate
              </p>
              <p className="hidden md:inline w-[35%] md:w-[20%] lg:w-[35%] pl-[10%] text-center md:text-left text-sm md:text-normal text-gray-500 pt-2">
                Link accounts to populate transactions automatically.
              </p>
              <p className="md:hidden w-[35%] md:w-[20%] lg:w-[35%] pl-[10%] text-center md:text-left text-sm md:text-normal text-gray-500 pt-2">
                Link accounts to populate transactions automatically.
              </p>
              <Button
                disabled={!isLoaded}
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
                Link Account
              </Button>
              <Button
                disabled={!isLoaded}
                className="md:hidden ml-[10%] md:ml-[20%] w-1/4 border"
                variant="ghost"
                onClick={() => {
                  if (subscriptionStatus !== "Free") {
                    openPlaid();
                    setPlaidIsOpen(true);
                  } else {
                    setOpenUpgradeDialog(true);
                  }
                }}>
                Link
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
