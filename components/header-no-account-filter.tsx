"use client";

import { useUser } from "@clerk/nextjs";

import { ClerkLoaded, ClerkLoading, UserButton } from "@clerk/nextjs";
import { ColorRing } from 'react-loader-spinner'

import { HeaderLogo } from "./header-logo";
import { Navigation } from "./navigation";
import { WelcomeMsg } from "./welcome-msg";
import { Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";
import { FiltersNoAccount } from "./filters-no-account";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

export const HeaderNoAccountFilter = () => {
  const { user, isLoaded } = useUser();

  return (
    <header className={cn("relative px-4 py-8 lg:px-14 lg:pb-14", montserratP.className)}>
      <div className="absolute inset-0 -z-10 overflow-x-clip">
        {/* Shape 1 */}
        <div className="absolute -top-44 left-[40%] w-[200px] h-[400px] md:w-[400px] md:h-[700px] rotate-[40deg] bg-blue-400 opacity-30 rounded-full blur-3xl" />
        {/* Shape 2 */}
        <div className="absolute top-[300px] right-0 w-[200px] h-[400px] md:w-[400px] md:h-[800px] rotate-[45deg] bg-blue-400 opacity-30 rounded-full blur-3xl" />
        {/* Shape 3 */}
        <div className="absolute top-[10%] left-10 w-[200px] h-[400px] md:w-[400px] md:h-[400px] bg-purple-400 opacity-30 rounded-full blur-3xl" />
        {/* Shape 4 */}
        <div className="absolute -bottom-96 right-[65%] w-[200px] h-[400px] md:w-[300px] md:h-[500px] bg-purple-400 opacity-30 rounded-full blur-3xl" />
      </div>
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
              <ColorRing
                visible={true}
                height="40"
                width="40"
                ariaLabel="color-ring-loading"
                wrapperStyle={{}}
                wrapperClass="color-ring-wrapper"
                colors={['#3B82F6', '#6366F1', '#7C3AED', '#9333EA', '#A855F7']}
              />
            </ClerkLoading>
          </div>
        </div>

        <WelcomeMsg />
        {!!user && (
          <FiltersNoAccount />
        )}
      </div>
    </header>
  );
};
