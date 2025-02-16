"use client";

import { format, subDays } from "date-fns";
import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import qs from "query-string";
import { useState } from "react";
import { useMediaQuery } from 'react-responsive';
import { type DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateRange } from "@/lib/utils";

export const DateFilter = () => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const accountId = searchParams.get("accountId");
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const defaultTo = new Date();
  const defaultFrom = subDays(defaultTo, 30);

  type Period = {
    from: string | Date | undefined;
    to: string | Date | undefined;
  };

  function convertDateRangeToPeriod(dateRange: DateRange | undefined): Period {
    return {
      from: dateRange?.from ?? undefined,
      to: dateRange?.to ?? undefined,
    };
  }


  const paramState = {
    from: from
      ? new Date(`${from}T12:00:00`) 
      : new Date(defaultFrom.setHours(12, 0, 0, 0)),
    to: to
      ? new Date(`${to}T12:00:00`) 
      : new Date(defaultTo.setHours(12, 0, 0, 0)),
  };

  const [date, setDate] = useState<DateRange | undefined>(paramState);

  const isSmallScreen = useMediaQuery({ maxWidth: '640px' }); // Tailwind's `sm` screen size is 640px

  const pushToUrl = (dateRange: DateRange | undefined) => {
    const adjustedFrom = dateRange?.from
      ? new Date(dateRange.from.setHours(12, 0, 0, 0))
      : new Date(defaultFrom.setHours(12, 0, 0, 0));
    const adjustedTo = dateRange?.to
      ? new Date(dateRange.to.setHours(12, 0, 0, 0))
      : new Date(defaultTo.setHours(12, 0, 0, 0));

    const query = {
      from: format(adjustedFrom, "yyyy-MM-dd"),
      to: format(adjustedTo, "yyyy-MM-dd"),
      accountId,
    };

    const url = qs.stringifyUrl(
      {
        url: pathname,
        query,
      },
      { skipEmptyString: true, skipNull: true }
    );

    router.push(url);
  };

  const onReset = () => {
    setDate(undefined);
    pushToUrl(undefined);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          disabled={false}
          size="sm"
          variant="outline"
          className="h-9 w-full rounded-md border bg-white/30 px-3 font-normal text-black outline-none transition hover:bg-white/40 hover:text-black focus:bg-white/30 focus:ring-transparent focus:ring-offset-0 lg:w-auto"
        >
          <span>{formatDateRange(convertDateRangeToPeriod(date))}</span>

          <ChevronDown className="ml-2 size-4 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-full p-0 lg:w-auto" align="start">
        <Calendar
          disabled={false}
          initialFocus
          mode="range"
          defaultMonth={date?.from}
          selected={date}
          onSelect={(range) => {
            setDate({
              from: range?.from ? new Date(range.from.setHours(12, 0, 0, 0)) : undefined,
              to: range?.to ? new Date(range.to.setHours(12, 0, 0, 0)) : undefined,
            });
          }}
          numberOfMonths={isSmallScreen ? 1 : 2}
        />

        <div className="flex w-full items-center gap-x-2 p-4">
          <PopoverClose asChild>
            <Button
              onClick={onReset}
              disabled={!date?.from || !date?.to}
              className="w-full"
              variant="outline"
            >
              Reset
            </Button>
          </PopoverClose>

          <PopoverClose asChild>
            <Button
              onClick={() => {
                pushToUrl(date);
              }}
              disabled={!date?.from || !date?.to}
              className="w-full"
            >
              Apply
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
};
