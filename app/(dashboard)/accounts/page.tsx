"use client";

import { Link, Loader2, Plus } from "lucide-react";
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
import "/styles.css"
import { cn } from "@/lib/utils";
import { Montserrat } from "next/font/google";
import { usePlaidLink } from 'react-plaid-link';
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
  const [openPlaid, setOpenPlaid] = useState<() => void>(() => () => { });
  const [isBelowAccountLimit, setIsBelowAccountLimit] = useState<boolean>(false);

  const Categories = ["Credit cards", "Depositories", "Investments", "Loans", "Real estate", "Others"];
  const formSchema = insertAccountSchema.pick({
    name: true,
    category: true,
  });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {name: "", category: ""},
  });
  
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
      const response = await fetch('/api/plaid/set-access-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ public_token, userId: user?.id }),
      });

      setTimeout(() => {}, 2000);

      await fetch('/api/plaid/upload-accounts', {
        method: 'POST',
        body: JSON.stringify({ category: accountCategoryRef.current }),
        headers: { 'Content-Type': 'application/json' },
      });

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

  const accountIds = [...new Set([...manualAccounts.map(acc => acc.id), ...plaidAccounts.map(acc => acc.id)])];

  const totalsQuery = useQuery({
    queryKey: ["accountTotals", { from, to, accountIds }],
    queryFn: () => fetchAccountTotals(from, to, accountIds),
    enabled: accountIds.length > 0, // Ensures the query runs only if there are account IDs
  });

  const [isPremiumUser, setIsPremiumUser] = useState(false);

  const isDisabled = manualAccountsQuery.isLoading || plaidAccountsQuery.isLoading || deleteAccounts.isPending || totalsQuery.isLoading;

  const userId = user?.id || "";

  // Always call useEffect, even if userId might not be set yet
  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (userId) {
        try {
          const response = await fetch(`/api/subscription-status?userId=${userId}`)
            .then(response => response.json())
            .then(async (data) => {
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

  const categories = ["Credit cards", "Depository", "Investments", "Loans", "Real estate", "Others"];
  type Account = {
    id: string;
    name: string;
    userId: string;
    category: string;
    isFromPlaid: boolean;
    plaidAccountId: string;
    plaidAccessToken: string;
    [key: string]: any; // Add additional dynamic fields if needed
  };

  const groupByCategory = (accounts: Account[]): Record<string, Account[]> => {
    return categories.reduce((acc, category) => {
      // Ensure account.category is defined and handle the case where it might be undefined or null
      acc[category] = accounts.filter((account) => {
        const accountCategory = account.category?.trim().toLowerCase(); // Safely access category and trim it
        return accountCategory === category.trim().toLowerCase(); // Normalize and compare categories
      });
      return acc;
    }, {} as Record<string, Account[]>);
  };

  const manualAccountsWithTotals = manualAccounts.map((account) => ({
    ...account,
    ...(totalsQuery.data?.find((total) => total.id === account.id) || {}),
  }));

  const plaidAccountsWithTotals = plaidAccounts.map((account) => ({
    ...account,
    ...(totalsQuery.data?.find((total) => total.id === account.id) || {}),
  }));

  const groupedManualAccounts = groupByCategory(manualAccountsWithTotals);
  const groupedPlaidAccounts = groupByCategory(plaidAccountsWithTotals);

  if (manualAccountsQuery.isLoading || plaidAccountsQuery.isLoading || totalsQuery.isLoading) {
    return (
      <div className={cn("mx-auto -mt-6 w-full max-w-screen-2xl pb-10", montserratP.className)}>
        <AccountsGrid />
        <Card className="border-none drop-shadow-sm">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>

          <CardContent>
            <div className="flex h-[500px] w-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-slate-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-none drop-shadow-sm mt-10">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>

          <CardContent>
            <div className="flex h-[500px] w-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-slate-300" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn(`mx-auto -mt-6 w-full max-w-screen-2xl pb-10 ${plaidIsOpen ? "plaid-open" : ""}`, montserratP.className)}>
      <AccountsGrid />
      {plaidIsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
          <div className="bg-white p-8 rounded-lg shadow-lg w-80 text-center">
            <h2 className="text-2xl font-bold mb-4">Connecting</h2>
            <p className="text-lg text-gray-600">
              <Typewriter
                words={['This will take a few minutes...', 'Please be patient...', 'Waiting for Plaid connections...', 'Waiting for Plaid connections...', 'Waiting for Plaid connections...', 'Fetching your financial data...', 'Categorizing transactions...', 'Creating accounts...', 'Training virtual assistant...']}
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
      {/* Plaid Accounts */}
      {isPremiumUser && (
        <Card>
          <CardHeader className="gap-y-2 md:flex-row md:items-center md:justify-between">
            <CardTitle className="line-clamp-1 text-2xl font-bold">Linked Accounts</CardTitle>
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
                      <FormItem className="">
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
                    disabled={!form.watch('category') || !isBelowAccountLimit}
                  >
                    <Link className="mr-2 size-4" /> Link New
                  </Button>
                </div>
              </form>
            </Form>
          </CardHeader>
          <CardContent>
          {categories.map((category) => (
            <div key={category}>
              <div className={`${groupedPlaidAccounts[category].length === 0 ? "hidden" : ""}`} key={category}>
                <h3 className="text-lg font-semibold mt-4">{category}</h3>
                <DataTable
                  data={groupedPlaidAccounts[category] || []}
                  columns={columns}
                  filterKey="name"
                  disabled={isDisabled}
                  onDelete={(row) => deleteAccounts.mutate({ ids: row.map((r) => r.original.id) })}
                />
              </div>
              <div className={`${groupedPlaidAccounts[category].length === 0 ? "w-full" : "hidden"}`}>
                <h3 className="text-lg font-semibold mt-4">{category}</h3>
                <Button
                  disabled={!isBelowAccountLimit}
                  className={cn("w-full border border-dashed rounded-2xl py-10 my-2 bg-transparent text-black hover:bg-gray-100 hover:text-black", montserratH.className)}
                  onClick={() => {
                    accountCategoryRef.current = category;
                    openPlaid();
                    setPlaidIsOpen(true);
                  }}
                >
                  Link new account
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
        </Card>
      )}
      {/* Manual Accounts */}
      <Card className={`border-none drop-shadow-sm ${isPremiumUser ? "mt-10" : ""}`}>
        <CardHeader className="gap-y-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="line-clamp-1 text-2xl font-bold">{isPremiumUser ? "Manual Accounts" : "Accounts"}</CardTitle>
          <Button size="sm" onClick={newAccount.onOpen}>
            <Plus className="mr-2 size-4" /> Add new
          </Button>
        </CardHeader>
        <CardContent>
          {categories.map((category) => (
            <div key={category}>
              <div className={`${groupedManualAccounts[category].length === 0 ? "hidden" : ""}`} key={category}>
                <h3 className="text-lg font-semibold mt-4">{category}</h3>
                <DataTable
                  data={groupedManualAccounts[category] || []}
                  columns={columns}
                  filterKey="name"
                  disabled={isDisabled}
                  onDelete={(row) => deleteAccounts.mutate({ ids: row.map((r) => r.original.id) })}
                />
              </div>
              <div className={`${groupedManualAccounts[category].length === 0 ? "w-full" : "hidden"}`}>
                <h3 className="text-lg font-semibold mt-4">{category}</h3>
                <Button
                  disabled={!isBelowAccountLimit}
                  className={cn("w-full border border-dashed rounded-2xl py-10 my-2 bg-transparent text-black hover:bg-gray-100 hover:text-black", montserratH.className)}
                  onClick={newAccount.onOpen}
                >
                  Add new account
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountsPage;
