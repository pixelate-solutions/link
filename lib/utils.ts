import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { differenceInDays, eachDayOfInterval, format, isFirstDayOfMonth, isSameDay, parse, subDays } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function convertAmountFromMilliunits(amount: number) {
  return Math.round(amount / 1000);
}

export function convertAmountToMilliunits(amount: number) {
  return Math.round(amount * 1000);
}

export function formatCurrency(value: number) {
  return Intl.NumberFormat("en-us", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function calculatePercentageChange(current: number, previous: number) {
  if (previous === 0) {
    return previous === current ? 0 : 100;
  }

  return ((current - previous) / previous) * 100;
}

export function fillMissingDays(
  activeDays: {
    date: Date;
    income: number;
    expenses: number;
  }[],
  startDate: Date,
  endDate: Date
) {
  if (activeDays.length === 0) return [];

  const allDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const transactionsByDay = allDays.map((day) => {
    const found = activeDays.find((d) => isSameDay(d.date, day));

    if (found) return found;
    else {
      return {
        date: day,
        income: 0,
        expenses: 0,
      };
    }
  });

  return transactionsByDay;
}

type Period = {
  from: string | Date | undefined;
  to: string | Date | undefined;
};

export function formatDateRange(period?: Period) {
  const defaultTo = new Date();
  const defaultFrom = subDays(defaultTo, 30);

  const parseDate = (date: string | Date | undefined): Date => {
    if (typeof date === "string") {
      return parse(date, "yyyy-MM-dd", new Date());
    } else if (date instanceof Date) {
      return date;
    }
    throw new Error("Invalid date format");
  };

  if (!period?.from) {
    return `${format(defaultFrom, "LLL dd")} - ${format(defaultTo, "LLL dd, y")}`;
  }

  if (period?.to) {
    return `${format(parseDate(period.from), "LLL dd")} - ${format(parseDate(period.to), "LLL dd, y")}`;
  }

  return format(parseDate(period.from), "LLL dd, y");
}

export function formatPercentage(
  value: number,
  options: { addPrefix?: boolean } = { addPrefix: false }
) {
  const result = new Intl.NumberFormat("en-US", {
    style: "percent",
  }).format(value / 100);

  if (options.addPrefix && value > 0) return `+${result}`;

  return result;
}

export const calculateAdjustedBudget = (
  monthlyBudget: number,
  fromDate: Date,
  toDate: Date
): number => {
  const dayCount = differenceInDays(toDate, fromDate) + 1;
  const isFullMonth =
    (isFirstDayOfMonth(fromDate) && isSameDay(toDate, new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0))) ||
    fromDate.getDate() === toDate.getDate() + 1;
    
  if (isSameDay(fromDate, toDate)) {
    // For a single day, assume an average month length (30.44 days)
    return monthlyBudget / 30.44;
  }
  return isFullMonth
    ? monthlyBudget
    : (monthlyBudget * dayCount) / 30.44;
};
