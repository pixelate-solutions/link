"use client";

import { Link, Plus } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { insertAccountSchema } from "@/db/schema";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AccountsGrid } from "@/components/accounts-grid";

// Import the new MobileAccounts component
import { MobileAccounts } from "@/components/mobile-accounts";

import { ColorRing } from 'react-loader-spinner'

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

  // NEW: track window width for conditional rendering
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 9999
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const Categories = ["Credit cards", "Depository", "Investments", "Loans", "Others"];
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

      // Wait a moment or handle the response
      setTimeout(() => {}, 2000);

      await fetch("/api/plaid/upload-accounts", {
        method: "POST",
        body: JSON.stringify({ category: accountCategoryRef.current }),
        headers: { "Content-Type": "application/json" },
      });

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

  const userId = user?.id || "";

  // Check subscription status
  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (userId) {
        try {
          await fetch(`/api/subscription-status?userId=${userId}`)
            .then((response) => response.json())
            .then((data) => {
              setIsPremiumUser(data.plan !== "Free");
            });
        } catch (error) {
          console.error("Error fetching subscription status:", error);
          setIsPremiumUser(false);
        }
      }
    };
    fetchSubscriptionStatus();
  }, [userId]);

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
    [key: string]: any; // Additional dynamic fields if needed
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

  const groupedManualAccounts = groupByCategory(manualAccountsWithTotals);
  const groupedPlaidAccounts = groupByCategory(plaidAccountsWithTotals);

  // Loading state
  if (
    manualAccountsQuery.isLoading ||
    plaidAccountsQuery.isLoading ||
    totalsQuery.isLoading
  ) {
    return (
      <div
        className={cn(
          "mx-auto -mt-6 w-full max-w-screen-2xl pb-10",
          montserratP.className
        )}
      >
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
                colors={['#3B82F6', '#6366F1', '#7C3AED', '#9333EA', '#A855F7']}
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
                colors={['#3B82F6', '#6366F1', '#7C3AED', '#9333EA', '#A855F7']}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className={cn(
        `mx-auto -mt-6 w-full max-w-screen-2xl pb-10 ${
          plaidIsOpen ? "plaid-open" : ""
        }`,
        montserratP.className
      )}
    >
      <AccountsGrid />
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
                "Training virtual assistant...",
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

      {/* ========== LINKED (Plaid) ACCOUNTS ========== */}
      {isPremiumUser && (
        <Card className="border-2 drop-shadow-md">
          <CardHeader className="gap-y-2 md:flex-row md:items-center md:justify-between">
            <CardTitle className="line-clamp-1 text-2xl font-bold">
              Linked Accounts
            </CardTitle>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => {
                  accountCategoryRef.current = data.category || "Others";
                  openPlaid();
                  setPlaidIsOpen(true);
                })}
                autoCapitalize="off"
                autoComplete="off"
                className="space-y-4 pt-4"
              >
                <div className="md:flex items-center md:space-x-4">
                  {/* Dropdown for Category Selection */}
                  <FormField
                    name="category"
                    control={form.control}
                    defaultValue="Others"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Category</FormLabel>
                        <FormControl>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value || ""}
                          >
                            <SelectTrigger className="md:w-48 w-full">
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent>
                              {Categories.map((category) => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Button to Trigger Plaid */}
                  <Button
                    type="submit"
                    className="bg-gradient-to-br from-blue-500 to-purple-500 hover:opacity-80 w-full md:w-auto mt-5 md:mt-0"
                    disabled={!form.watch("category") || !isBelowAccountLimit}
                  >
                    <Link className="mr-2 size-4" />
                    Link New
                  </Button>
                </div>
              </form>
            </Form>
          </CardHeader>

          <CardContent>
            {categories.map((category) => {
              const accountsForCat = groupedPlaidAccounts[category] || [];
              const isEmpty = accountsForCat.length === 0;

              return (
                <div key={category} className="mt-4">
                  <h3 className="text-lg font-semibold mb-2">{category}</h3>

                  {/* If no accounts in this category, show the "Link new account" button */}
                  {isEmpty && (
                    <Button
                      disabled={!isBelowAccountLimit}
                      className={cn(
                        "w-full border border-dashed rounded-2xl py-10 my-2 bg-transparent text-black hover:bg-gray-100 hover:text-black",
                        montserratH.className
                      )}
                      onClick={() => {
                        accountCategoryRef.current = category;
                        openPlaid();
                        setPlaidIsOpen(true);
                      }}
                    >
                      Link new account
                    </Button>
                  )}

                  {/* Otherwise show either DataTable or MobileAccounts */}
                  {!isEmpty && (
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
                        <MobileAccounts
                          accounts={accountsForCat}
                          categoryName={category}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ========== MANUAL ACCOUNTS ========== */}
      <Card className={cn("border-2 drop-shadow-md", isPremiumUser ? "mt-10" : "")}>
        <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="line-clamp-1 text-2xl font-bold">
            {isPremiumUser ? "Manual Accounts" : "Accounts"}
          </CardTitle>
          <Button size="sm" onClick={newAccount.onOpen}>
            <Plus className="mr-2 size-4" /> Add new
          </Button>
        </CardHeader>
        <CardContent>
          {categories.map((category) => {
            const accountsForCat = groupedManualAccounts[category] || [];
            const isEmpty = accountsForCat.length === 0;

            return (
              <div key={category} className="mt-4">
                <h3 className="text-lg font-semibold mb-2">{category}</h3>

                {/* If no accounts in this category, show the "Add new account" button */}
                {isEmpty && (
                  <Button
                    disabled={!isBelowAccountLimit}
                    className={cn(
                      "w-full border border-dashed rounded-2xl py-10 my-2 bg-transparent text-black hover:bg-gray-100 hover:text-black",
                      montserratH.className
                    )}
                    onClick={newAccount.onOpen}
                  >
                    Add new account
                  </Button>
                )}

                {/* Otherwise show either DataTable or MobileAccounts */}
                {!isEmpty && (
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
                      <MobileAccounts
                        accounts={accountsForCat}
                        categoryName={category}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountsPage;
