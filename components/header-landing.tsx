"use client";

import { useUser } from "@clerk/nextjs";

import { ClerkLoaded, ClerkLoading, UserButton } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

import { Button } from "./ui/button";
import { useRouter } from "next/navigation";
import { HeaderLogoLanding } from "./header-logo-landing";
import { LandingNavigation } from "./landing-navigation";

export const HeaderLanding = () => {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  
  const handleButtonClick = () => {
    router.push("/overview");
  };

  return (
    <header className="bg-gradient-to-br from-blue-500 to-purple-500 px-4 py-8 lg:px-14 lg:pb-16 h-[150px] lg:h-[250px] z-0">
      <div className="mx-auto max-w-screen-2xl">
        <div className="mb-14 flex w-full items-center justify-between">
          <div className="flex items-center gap-x-2 lg:gap-x-16">
            <HeaderLogoLanding withLink={false} />
            <LandingNavigation />
          </div>

          <div className="flex items-center gap-x-2">
            <Button
                className="px-6 py-2 lg:px-6 lg:py-4 rounded-full mt-2 mr-2 lg:mr-8 bg-white text-black text-sm lg:text-md hover:bg-gray-200"
                onClick={handleButtonClick}
            >
                {user ? "Dashboard" : "Get Started"}
            </Button>
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
