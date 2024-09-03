"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from '@clerk/clerk-react';
import { useEffect, useState } from "react";
import { UpgradePopup } from "@/components/upgrade-popup";

const SettingsPage = () => {
  const { user } = useUser();
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('Loading...');
  const [subscriptionButton, setSubscriptionButton] = useState<string>('Loading...');
  const [openUpgradeDialog, setOpenUpgradeDialog] = useState<boolean>(false);
  const [activeOrCancel, setActiveOrCancel] = useState<string>('');

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/subscription-status?userId=${user.id}`)
        .then(response => response.json())
        .then(data => {
          const label = data.plan;
          setSubscriptionStatus(label);
          if (label === "Free") {
            setSubscriptionButton("Upgrade");
          } else if (label === "Monthly" || label === "Annual" || label === "Test") {
            setSubscriptionButton("Update");
          } else if (label === "Lifetime") {
            setSubscriptionButton("Complete");
          }
          if (data.cancelAtPeriodEnd) {
            setActiveOrCancel(`: Canceling ${new Date(data.cancelAt * 1000).toLocaleString()}`)
          } else {
            setActiveOrCancel(": Active");
          }
        })
        .catch(() => setSubscriptionStatus('Error fetching subscription status'));
    }
  }, [user]);

  return (
    <div>
      <UpgradePopup open={openUpgradeDialog} onOpenChange={setOpenUpgradeDialog} />
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
              <p className="w-[35%] md:w-[20%] lg:w-[35%] pl-[10%] text-sm md:text-normal text-center md:text-left mt-4 text-gray-500">
                <b>{subscriptionStatus}</b>{activeOrCancel}
              </p>
              <Button disabled={subscriptionButton === "Loading..." || subscriptionStatus === "Lifetime"} className="ml-[10%] md:ml-[20%] w-1/4 mt-2 border" variant="ghost" onClick={() => setOpenUpgradeDialog(true)}>
                {subscriptionButton}
              </Button>
            </div>
            <div className="flex w-full border-t">
              <p className="w-[30%] md:w-[25%] lg:w-[20%] ml-[5%] md:ml-[10%] text-sm md:text-normal mt-4 font-bold">
                Accounts
              </p>
              <p className="w-[35%] md:w-[20%] lg:w-[35%] pl-[10%] text-center md:text-left mt-4 text-sm md:text-normal text-gray-500">
                None
              </p>
              <Button className="ml-[10%] md:ml-[20%] w-1/4 mt-2 border" variant="ghost">
                Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
