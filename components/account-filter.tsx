"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import qs from "query-string";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetAccounts } from "@/features/accounts/api/use-get-accounts";
import { useGetSummary } from "@/features/summary/api/use-get-summary";

export const AccountFilter = () => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { isLoading: isLoadingSummary } = useGetSummary();

  const accountId = searchParams.get("accountId") || "all";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const onChange = (newValue: string) => {
    const query = {
      accountId: newValue,
      from,
      to,
    };

    if (newValue === "all") query.accountId = "";

    const url = qs.stringifyUrl(
      {
        url: pathname,
        query,
      },
      { skipNull: true, skipEmptyString: true }
    );

    router.push(url);
  };

  const { data: userAccounts, isLoading: isLoadingUserAccounts } = useGetAccounts(false);
  const { data: plaidAccounts, isLoading: isLoadingPlaidAccounts } = useGetAccounts(true);

  // Combine accounts from both sources
  const isLoading = isLoadingUserAccounts || isLoadingPlaidAccounts || isLoadingSummary;
  const accounts = (userAccounts ?? []).concat(plaidAccounts ?? []);

  return (
    <Select
      value={accountId}
      onValueChange={onChange}
      disabled={isLoading}
    >
      <SelectTrigger className="h-9 w-full text-center rounded-md bg-white/30 px-3 font-normal text-black outline-none transition hover:bg-white/40 hover:text-black focus:bg-white/30 focus:ring-transparent focus:ring-offset-0 lg:w-auto justify-center">
        <SelectValue placeholder="Select account" />
      </SelectTrigger>

      <SelectContent>
        <SelectItem className="w-full text-center" value="all">All accounts</SelectItem>

        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
