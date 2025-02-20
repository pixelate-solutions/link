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
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Copy } from "lucide-react";
import "/styles.css"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { ColorRing } from 'react-loader-spinner';
// Import the shadcn ui Switch component
import { Switch } from "@/components/ui/switch";

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
  const [copyOrCopied, setCopyOrCopied] = useState<string>('Copy');
  const [openUpgradeDialog, setOpenUpgradeDialog] = useState<boolean>(false);
  const [plaidIsOpen, setPlaidIsOpen] = useState<boolean>(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [openPlaid, setOpenPlaid] = useState<() => void>(() => () => { });
  const [isBelowAccountLimit, setIsBelowAccountLimit] = useState<boolean>(false);

  const [promoCode, setPromoCode] = useState("");
  const [featureBugRequest, setFeatureBugRequest] = useState("");
  const [stripeBalance, setStripeBalance] = useState<number | null>(null);

  // New state for notifications toggle. We assume the default is on.
  const [budgetExceeding, setBudgetExceeding] = useState<boolean>(true);

  const publishableKey = process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
    ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_TEST_KEY
    : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  
  const stripePromise = loadStripe(publishableKey!);

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

    const fetchStripeBalance = async () => {
      try {
        const response = await fetch("/api/stripe-balance");
        const data = await response.json();
        setStripeBalance(data.balance);
      } catch (error) {
        console.error("Error fetching Stripe balance:", error);
      }
    };

    const fetchPlaidAccountCount = async () => {
      try {
        const response = await fetch("/api/plaid/account-count");
        const data = await response.json();
        setIsBelowAccountLimit(data.count < 10);
      } catch (error) {
        console.error("Error fetching account count:", error);
      }
    };
    
    if (user?.id) {
      fetchPlaidAccountCount();
      fetchLinkToken();
      fetchStripeBalance();
    }
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

      await new Promise((resolve) => setTimeout(resolve, 1000));

      await fetch('/api/plaid/upload-accounts', { method: 'POST' });

      await new Promise((resolve) => setTimeout(resolve, 1000));

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

  useEffect(() => {
    if (user?.id) {
      // Check and insert default categories
      fetch("/api/categories/set-default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      .catch((error) => {
        console.error("Error checking default categories:", error);
      });
    }
  }, [user]);

  useEffect(() => {
    if (user?.id) {
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch((error) => {
        console.error("Error setting default notifications:", error);
      });
    }
  }, [user]);

  const handleNotificationToggle = async (checked: boolean) => {
    setBudgetExceeding(checked);
    try {
      const endpoint = checked ? "/api/notifications/on" : "/api/notifications/off";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error("Error toggling notification");
      }
      toast.success("Notification preference updated!");
    } catch (error) {
      console.error("Error updating notification:", error);
      toast.error("Failed to update notification preference.");
      // Revert toggle on error
      setBudgetExceeding(!checked);
    }
  };

  const handlePromoSubmit = async () => {
    const stripe: Stripe | null = await stripePromise;
    try {
      if (stripe && user?.id && user?.emailAddresses[0]?.emailAddress) {
        const response = await fetch("/api/apply-promo-code", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            promoCode,
            customerEmail: user?.primaryEmailAddress,
          }),
        });

        const data = await response.json();

        if (data.sessionId) {
          const sessionId = data.sessionId;
          const referringUserId = "user_" + promoCode;
          await fetch("/api/stripe-balance/credit-referral", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ referringUserId }),
          });

          toast.success("Successfully applied code and credited referral!");

          const result = await stripe.redirectToCheckout({ sessionId });

          if (result.error) {
            console.error(result.error.message);
            toast.error(result.error.message);
          }
        } else {
          if (data.message === "Friends & Family") {
            toast.success("Successfully applied code");
            window.location.reload();
          } else {
            toast.error("Invalid code");
          }
        }
      } else {
        console.error("Stripe object or user information is missing.");
      }
    } catch (error) {
      console.error("Error applying code:", error);
      toast.error("Failed to apply code. Please try again.");
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
        body: `A message from\n\nName: ${user?.firstName} ${user?.lastName}\nEmail: ${user?.emailAddresses}\nUser ID: ${user?.id}\n\nis as follows:\n\n"${featureBugRequest}"\n\nSincerely,\nLink`,
      }),
    });

    if (response.ok) {
      toast.success("Success!");
      window.location.reload();
    } else {
      toast.error("Error submitting request, please try again.");
    }
  };

  const handleCopy = async (event: React.MouseEvent<HTMLParagraphElement>) => {
    event.preventDefault();
    if (user?.id) {
      try {
        await navigator.clipboard.writeText(user?.id.split("_")[1] || "");
        setCopyOrCopied("Copied!");
        setTimeout(() => setCopyOrCopied("Copy"), 3000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  };

  return (
    <div className={cn("relative", montserratP.className, `p-2 md:p-6 mb-4 ${plaidIsOpen ? 'plaid-open' : ''}`)}>
      {plaidIsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-md">
          <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md mx-4 text-center space-y-6">
            {/* Spinner */}
            <div className="flex justify-center">
              <ColorRing
                visible={true}
                height="80"
                width="80"
                ariaLabel="color-ring-loading"
                wrapperStyle={{}}
                wrapperClass="color-ring-wrapper"
                colors={['#3B82F6', '#6366F1', '#7C3AED', '#9333EA', '#A855F7']}
              />
            </div>
            <h2 className="text-2xl font-semibold text-gray-800">Connecting</h2>
            <p className="text-lg text-gray-600">
              <Typewriter
                words={[
                  "This will take a few minutes...",
                  "Please be patient...",
                  "Waiting for Plaid connections...",
                  "Fetching your financial data...",
                  "Categorizing transactions...",
                  "Creating accounts...",
                ]}
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
      <div className="max-w-6xl mx-auto -mt-[80px] bg-white">
        <Card className="shadow-lg rounded-xl bg-white border-none">
          <CardHeader className={`sticky top-[100px] lg:top-[140px] p-8 border-b bg-white rounded-lg ${plaidIsOpen ? 'z-40' : 'z-50'}`}>
            <CardTitle className="text-4xl font-extrabold z-10">Settings</CardTitle>
            <Button className="hidden" disabled={true} onClick={async () => {
              await fetch(`/api/delete-token`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
              });
            }}>
              Delete Tokens
            </Button>
            <Button
              className="hidden"
              disabled={true}
              onClick={async () => {
                const body = "Testing email send";
                const userId = user?.id || "";

                if (!userId) {
                  alert("User ID not found.");
                  return;
                }

                const response = await fetch("/api/plaid/webhook/email", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ userId, body }),
                });

                const data = await response.json();

                if (response.ok) {
                  alert("Email sent successfully!");
                } else {
                  alert(`Failed to send email: ${data.error}`);
                }
              }}
            >
              Send Email
            </Button>
          </CardHeader>
          <CardContent className="p-8 space-y-10 bg-white">

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
                disabled={subscriptionStatus === "Loading..." || !isBelowAccountLimit}
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
                {subscriptionStatus === "Loading..." ? "Loading..." : isBelowAccountLimit ? "Link" : "Limit Reached"}
              </Button>
            </div>

            {/* Referral Code Section */}
            <div className="space-y-4 relative md:flex md:justify-between md:items-center">
              <div>
                <p className="font-semibold text-lg">Referral Code</p>
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  className="input border border-gray-300 rounded-lg px-4 py-2 shadow-sm w-full md:w-auto focus:outline-none mt-2"
                  placeholder="Enter code"
                />
                {subscriptionStatus !== "Free" && (<p className="font-semibold text-sm mt-2 text-gray-500">Referral codes are for free accounts.</p>)}
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
                <p className="font-semibold text-lg">Contact Us</p>
                <textarea
                  value={featureBugRequest}
                  onChange={(e) => setFeatureBugRequest(e.target.value)}
                  className="textarea border border-gray-300 rounded-lg p-4 shadow-sm w-full md:w-auto md:min-w-[350px] focus:outline-none mt-2"
                  placeholder="Enter a feature request, bug report, or any general question."
                  rows={4}
                />
              </div>
              <Button
                disabled={featureBugRequest === ""}
                className="mt-4 md:mt-0 px-6 py-3 w-full md:w-[200px]"
                onClick={handleFeatureBugSubmit}
                variant="outline"
              >
                Submit
              </Button>
            </div>

            {/* --- Notifications Section --- */}
            <div className="w-full border-t" />
            <p className="font-bold text-2xl">Email Notifications</p>
            <div className="space-y-4 relative flex justify-between items-center border p-5 rounded-xl">
              <div className="mr-10">
                <p className="font-semibold text-md">Budget Exceeding</p>
                <p className="text-gray-500 text-sm">
                  Sends an email notification when your spending exceeds your budget in a calendar month.
                </p>
              </div>
              <Switch 
                disabled={subscriptionStatus === "Free"}
                className="data-[state=checked]:bg-gradient-to-br from-blue-500 to-purple-500 data-[state=unchecked]:bg-red-500 border-transparent border-none pl-[2px]"
                checked={subscriptionStatus === "Free" ? false : budgetExceeding}
                onCheckedChange={handleNotificationToggle}
              />
            </div>
            {/* --- End Notifications Section --- */}

            {/* Referral Section */}
            <div className="border-t pt-10">
              <p className={cn("flex w-full text-sm md:text-md", montserratH.className)}>
                Referral Code: 
                <p className={cn("flex text-wrap break-all ml-2 md:ml-0 md:mx-4 max-w-[50%] text-xs md:text-sm", montserratP.className)}>
                  {user?.id.split("_")[1]}
                </p>
                <p onClick={handleCopy} className="text-gray-600 ml-2 hover:text-gray-500 hover:cursor-pointer text-sm md:text-md">
                  <Copy className="h-4" /> {copyOrCopied}
                </p>
              </p>
              <Accordion type="single" collapsible className={cn("w-[90%] sm:w-[70%] lg:w-[50%] text-left mt-4", montserratP.className)}>
                <AccordionItem className="border-none" value="item-1">
                  <AccordionTrigger className="text-xs md:text-sm hover:no-underline border hover:bg-gray-100 p-2 rounded-2xl my-2">
                    How does it work?
                  </AccordionTrigger>
                  <AccordionContent className="font-normal px-4 text-xs md:text-sm">
                    Share your referral code to earn credit! Any free user can use your referral code once per month, and if they use it, you&apos;ll receive a $5 credit towards your next payment. You cannot use your own code, and it only works for users upgrading from a free membership. To use a referral code, enter it in the referral code field and click submit.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            <div>
              {(stripeBalance !== null && stripeBalance !== undefined) ? (
                <p className={cn("flex", montserratH.className)}>
                  Current balance: 
                  <p className={stripeBalance < 0 ? "text-green-600 flex ml-2" : stripeBalance > 0 ? "text-red-600 flex ml-2" : "flex ml-2"}>
                    ${stripeBalance.toFixed(2)}
                  </p>
                </p>
              ) : (
                <p>Current balance: $0.00</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
