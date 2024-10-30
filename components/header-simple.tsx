"use client";

import { useUser } from "@clerk/nextjs";

import { ClerkLoaded, ClerkLoading, UserButton } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

import { HeaderLogo } from "./header-logo";
import { Navigation } from "./navigation";
import { Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

export const HeaderSimple = () => {
  const { user, isLoaded } = useUser();

  return (
    <header className={cn("sticky top-0 bg-gradient-to-br from-blue-500 to-purple-500 px-4 py-8 lg:px-14 lg:pb-16 z-50", montserratP.className)}>
      <div className="mx-auto max-w-screen-2xl">
        <div className="mb-14 flex w-full items-center justify-between">
          <div className="flex items-center lg:gap-x-16">
            <HeaderLogo />
            <Navigation />
          </div>

          <div className="flex items-center gap-x-2">
            <ClerkLoaded>
              <UserButton afterSignOutUrl="/" />
            </ClerkLoaded>

            <ClerkLoading>
              <Loader2 className="size-8 animate-spin text-slate-400" />
            </ClerkLoading>
          </div>
        </div>

      </div>
    </header>
  );
};
