"use client";

import { useUser } from "@clerk/nextjs";
import { ClerkLoaded, ClerkLoading, UserButton } from "@clerk/nextjs";
import { ColorRing } from "react-loader-spinner";

import { Filters } from "./filters";
import { HeaderLogo } from "./header-logo";
import { Navigation } from "./navigation";
import { WelcomeMsg } from "./welcome-msg";
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

export const Header = () => {
  const { user } = useUser();

  return (
    <header
      className={cn(
        "relative px-4 py-8 lg:px-14 lg:pb-8",
        montserratP.className
      )}
    >
      <div className="absolute inset-0 -z-10 overflow-x-clip">
        {/* Shape 1 */}
        <div className="absolute -top-44 left-[40%] w-[200px] h-[400px] md:w-[400px] md:h-[700px] rotate-[40deg] bg-blue-400 opacity-30 rounded-full blur-3xl" />
        {/* Shape 2 */}
        <div className="absolute top-[400px] right-0 w-[200px] h-[400px] md:w-[400px] md:h-[800px] rotate-[45deg] bg-blue-400 opacity-30 rounded-full blur-3xl overflow-hidden" />
        {/* Shape 3 */}
        <div className="absolute top-[10%] left-10 w-[200px] h-[400px] md:w-[400px] md:h-[400px] bg-purple-400 opacity-30 rounded-full blur-3xl" />
        {/* Shape 4 */}
        <div className="absolute -bottom-96 right-[65%] w-[200px] h-[400px] md:w-[300px] md:h-[500px] bg-purple-400 opacity-30 rounded-full blur-3xl" />
      </div>

      {/* Header Content */}
      <div className="mx-auto max-w-screen-2xl relative z-10">
        {/* Top Row: Logo + Navigation + User Button */}
        <div className="mb-14 flex w-full items-center justify-between">
          <div className="flex items-center lg:gap-x-16">
            <HeaderLogo />
            <Navigation />
          </div>

          <div className="flex items-center gap-x-2 border-2 rounded-full">
            <ClerkLoaded>
              <UserButton afterSignOutUrl="/" />
            </ClerkLoaded>

            <ClerkLoading>
              <ColorRing
                visible={true}
                height="40"
                width="40"
                ariaLabel="color-ring-loading"
                wrapperStyle={{}}
                wrapperClass="color-ring-wrapper"
                colors={[
                  "#3B82F6",
                  "#6366F1",
                  "#7C3AED",
                  "#9333EA",
                  "#A855F7",
                ]}
              />
            </ClerkLoading>
          </div>
        </div>

        {/* Secondary Row: WelcomeMsg + Filters (only if user is logged in) */}
        <div className="z-10">
          <WelcomeMsg />
          {!!user && <Filters />}
        </div>
      </div>
    </header>
  );
};
