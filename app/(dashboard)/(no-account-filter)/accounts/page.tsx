"use client";

import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBulkDeleteAccounts } from "@/features/accounts/api/use-bulk-delete-accounts";
import { useGetAccounts } from "@/features/accounts/api/use-get-accounts";
import { useNewAccount } from "@/features/accounts/hooks/use-new-account";
import { columns } from "./columns";
import "/styles.css";
import { cn } from "@/lib/utils";
import { Montserrat } from "next/font/google";
import { usePlaidLink } from "react-plaid-link";
import { Typewriter } from "react-simple-typewriter";
import { insertAccountSchema } from "@/db/schema";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AccountsGrid } from "@/components/accounts-grid";

// Import MobileAccounts component
import { MobileAccounts } from "@/components/mobile-accounts";

// Import shadcn Dialog and Tooltip components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

import { ColorRing } from "react-loader-spinner";
import { UpgradePopup } from "@/components/upgrade-popup";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

const fetchAccountTotals = async (from: string, to: string, accountIds: string[]) => {
  const responses = await Promise.all(
    accountIds.map((id) =>
      fetch(`/api/plaid/account-totals?from=${from}&to=${to}&accountId=${id}`)
    )
  );
  const results = await Promise.all(responses.map((res) => res.json()));
  return accountIds.map((id, index) => ({
    id,
    category: results[index]?.category,
    ...results[index],
  }));
};

const AccountsPage = () => {
  const { user } = useUser();
  const accountCategoryRef = useRef<string>("Others");
  const [plaidIsOpen, setPlaidIsOpen] = useState<boolean>(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [openPlaid, setOpenPlaid] = useState<() => void>(() => () => {});
  const [isBelowAccountLimit, setIsBelowAccountLimit] = useState<boolean>(false);
  const [openUpgradeDialog, setOpenUpgradeDialog] = useState<boolean>(false);

  // NEW: track window width for conditional rendering
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 9999
  );

  // NEW: state for the add-account dialog and selected category
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const formSchema = insertAccountSchema.pick({
    name: true,
    category: true,
    currentBalance: true,
    availableBalance: true,
  });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", category: "", currentBalance: "" },
  });

  useEffect(() => {
    if (!user?.id) return;
    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/subscription-status?userId=${user.id}`);
        const data = await response.json();
        // Set premium user flag based on the plan
        setIsPremiumUser(data.plan !== "Free");

        // If the plan is Free, trigger cleanup
        if (data.plan === "Free") {
          await fetch("/api/cancel-subscription/cleanup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch (error) {
        console.error("Error fetching subscription status:", error);
        setIsPremiumUser(false);
      }
    };
    fetchStatus();
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      // Check and insert default categories
      fetch("/api/categories/set-default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch((error) => {
        console.error("Error checking default categories:", error);
      });
    }
  }, [user]);

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
    }
  }, [user]);

  const onSuccess = async (public_token: string) => {
    try {
      const response = await fetch("/api/plaid/set-access-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ public_token, userId: user?.id }),
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));

      await fetch("/api/plaid/upload-accounts", {
        method: "POST",
        body: JSON.stringify({ category: accountCategoryRef.current }),
        headers: { "Content-Type": "application/json" },
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));

      await fetch("/api/plaid/upload-transactions", { method: "POST" });
      await fetch("/api/plaid/recurring", { method: "POST" });

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

  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const newAccount = useNewAccount();
  const deleteAccounts = useBulkDeleteAccounts();

  // Fetch manual accounts (isFromPlaid = false)
  const manualAccountsQuery = useGetAccounts(false);
  const manualAccounts = manualAccountsQuery.data || [];

  // Fetch Plaid accounts (isFromPlaid = true)
  const plaidAccountsQuery = useGetAccounts(true);
  const plaidAccounts = plaidAccountsQuery.data || [];

  // Combine IDs to fetch totals
  const accountIds = [
    ...new Set([...manualAccounts.map((acc) => acc.id), ...plaidAccounts.map((acc) => acc.id)]),
  ];

  const totalsQuery = useQuery({
    queryKey: ["accountTotals", { from, to, accountIds }],
    queryFn: () => fetchAccountTotals(from, to, accountIds),
    enabled: accountIds.length > 0,
  });

  const [isPremiumUser, setIsPremiumUser] = useState(false);

  const isDisabled =
    manualAccountsQuery.isLoading ||
    plaidAccountsQuery.isLoading ||
    deleteAccounts.isPending ||
    totalsQuery.isLoading;

  const categories = ["Credit cards", "Depository", "Investments", "Loans", "Others"];

  type Account = {
    id: string;
    name: string;
    userId: string;
    category: string;
    isFromPlaid: boolean;
    plaidAccountId: string;
    plaidAccessToken: string;
    currentBalance: string;
    availableBalance: string;
    [key: string]: any;
  };

  const groupByCategory = (accounts: Account[]): Record<string, Account[]> => {
    return categories.reduce((acc, category) => {
      const lowerCategory = category.trim().toLowerCase();
      acc[category] = accounts.filter((account) => {
        const acctCat = (account.category || "").trim().toLowerCase();
        return acctCat === lowerCategory;
      });
      return acc;
    }, {} as Record<string, Account[]>);
  };

  // Merge each account with its totals from the query
  const manualAccountsWithTotals = manualAccounts.map((account) => ({
    ...account,
    ...(totalsQuery.data?.find((total) => total.id === account.id) || {}),
    userId: account.userId || "",
    category: account.category || "Others",
    plaidAccountId: account.plaidAccountId || "",
    plaidAccessToken: account.plaidAccessToken || "",
    currentBalance: account.currentBalance || "0",
    availableBalance: account.availableBalance || "0",
  }));

  const plaidAccountsWithTotals = plaidAccounts.map((account) => ({
    ...account,
    ...(totalsQuery.data?.find((total) => total.id === account.id) || {}),
    userId: account.userId || "",
    category: account.category || "Others",
    plaidAccountId: account.plaidAccountId || "",
    plaidAccessToken: account.plaidAccessToken || "",
    currentBalance: account.currentBalance || "0",
    availableBalance: account.availableBalance || "0",
  }));

  // Combine manual and linked (Plaid) accounts into one list
  const combinedAccounts = [...manualAccountsWithTotals, ...plaidAccountsWithTotals];
  const groupedAccounts = groupByCategory(combinedAccounts);

  // Loading state
  if (
    manualAccountsQuery.isLoading ||
    plaidAccountsQuery.isLoading ||
    totalsQuery.isLoading
  ) {
    return (
      <div className={cn("mx-auto -mt-6 w-full max-w-screen-2xl pb-10", montserratP.className)}>
        <AccountsGrid />
        <Card className="border-none drop-shadow-sm">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            <div className="flex h-[500px] w-full items-center justify-center">
              <ColorRing
                visible={true}
                height="80"
                width="80"
                ariaLabel="color-ring-loading"
                wrapperStyle={{}}
                wrapperClass="color-ring-wrapper"
                colors={["#3B82F6", "#6366F1", "#7C3AED", "#9333EA", "#A855F7"]}
              />
            </div>
          </CardContent>
        </Card>
        <Card className="border-none drop-shadow-sm mt-10">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            <div className="flex h-[500px] w-full items-center justify-center">
              <ColorRing
                visible={true}
                height="80"
                width="80"
                ariaLabel="color-ring-loading"
                wrapperStyle={{}}
                wrapperClass="color-ring-wrapper"
                colors={["#3B82F6", "#6366F1", "#7C3AED", "#9333EA", "#A855F7"]}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto -mt-6 w-full max-w-screen-2xl pb-10", montserratP.className)}>
      <AccountsGrid />

      {/* ---------- PLAID POPUP MODAL ---------- */}
      {plaidIsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-md">
          <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md mx-4 text-center space-y-6">
            <div className="flex justify-center">
              <ColorRing
                visible={true}
                height="80"
                width="80"
                ariaLabel="color-ring-loading"
                wrapperStyle={{}}
                wrapperClass="color-ring-wrapper"
                colors={["#3B82F6", "#6366F1", "#7C3AED", "#9333EA", "#A855F7"]}
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

      {/* ---------- ADD ACCOUNT DIALOG ---------- */}
      <Dialog open={showAddAccountDialog} onOpenChange={setShowAddAccountDialog}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Select Account Type</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col space-y-4 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddAccountDialog(false);
                newAccount.onOpen();
              }}
            >
              Manual
            </Button>
            {isPremiumUser ? (
              <Button
                className="shadow-lg shadow-indigo-500/20"
                variant="outline"
                disabled={!isBelowAccountLimit}
                onClick={() => {
                  accountCategoryRef.current = selectedCategory;
                  openPlaid();
                  setPlaidIsOpen(true);
                  setShowAddAccountDialog(false);
                }}
              >
                Linked
              </Button>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => setOpenUpgradeDialog(true)}>
                      Linked
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="mb-4 shadow-[0_0_10px_rgba(34,68,234,0.2)]">
                    Premium Feature
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddAccountDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- ACCOUNTS CARD ---------- */}
      <Card className="border-2 drop-shadow-md">
        <CardHeader>
  <CardTitle className="text-2xl font-bold">Accounts</CardTitle>
  <div className="mt-1 flex flex-wrap items-center text-gray-400 text-sm">
    <span>Up to ten linked institutions</span>
    <span className="mx-2">•</span>
    <span>Unlimited manual entries</span>
  </div>
</CardHeader>

        <CardContent>
          {categories.map((category) => {
            const accountsForCat = groupedAccounts[category] || [];
            return (
              <div key={category} className="mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold mb-2">{category}</h3>
                  {(accountsForCat.length !== 0) && (
                    <Button
                    className="border-2 shadow lg:shadow-md mb-2 lg:mb-0"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedCategory(category);
                      setShowAddAccountDialog(true);
                    }}
                  >
                    <Plus className="lg:mr-2 size-4" /> <p className="lg:block hidden">Add {category.toLowerCase()}</p>
                  </Button>
                  )}
                </div>
                {accountsForCat.length === 0 ? (
                  <Button
                    disabled={!isBelowAccountLimit}
                    className={cn(
                      "w-full border border-dashed rounded-2xl py-10 my-2 bg-transparent text-black hover:bg-gray-100 hover:text-black",
                      montserratH.className
                    )}
                    onClick={() => {
                      setSelectedCategory(category);
                      setShowAddAccountDialog(true);
                    }}
                  >
                    Add new account
                  </Button>
                ) : (
                  <>
                    {windowWidth >= 1024 ? (
                      <DataTable
                        data={accountsForCat}
                        columns={columns}
                        filterKey="name"
                        disabled={isDisabled}
                        onDelete={(row) =>
                          deleteAccounts.mutate({
                            ids: row.map((r) => r.original.id),
                          })
                        }
                      />
                    ) : (
                      <MobileAccounts accounts={accountsForCat} categoryName={category} />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <div className={`${openUpgradeDialog && "fixed inset-0 z-50 flex items-center justify-center"}`}>
        <UpgradePopup open={openUpgradeDialog} onOpenChange={setOpenUpgradeDialog} />
      </div>
    </div>
  );
};

export default AccountsPage;
