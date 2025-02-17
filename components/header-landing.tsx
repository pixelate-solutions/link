"use client";

import { useUser } from "@clerk/nextjs";
import { ClerkLoaded, ClerkLoading, UserButton } from "@clerk/nextjs";
import { ColorRing } from 'react-loader-spinner'
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";
import { LandingNavigation } from "./landing-navigation";
import { HeaderLogo } from "./header-logo";
import "@/styles.css"

export const HeaderLanding = () => {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const handleButtonClick = () => {
    router.push("/overview");
  };

  return (
    <header
      className="px-4 py-8 lg:px-14 lg:pb-16 h-[100px] lg:h-[120px] z-50 sticky top-0 bg-transparent backdrop-blur-md"
    >
      <div className="mx-auto max-w-screen-2xl">
        <div className="mb-14 flex w-full items-center justify-between">
          <div className="flex items-center gap-x-2 lg:gap-x-16">
            <HeaderLogo />
            <LandingNavigation />
          </div>

          <div className="flex items-center gap-x-2">
            <Button
              className="px-6 py-2 lg:px-6 lg:py-4 rounded-full mt-2 mr-2 lg:mr-8 bg-white text-black text-sm lg:text-md hover:bg-gray-50 border"
              onClick={handleButtonClick}
            >
              {user ? "Dashboard" : "Get Started"}
            </Button>

            <ClerkLoaded>
              <UserButton afterSignOutUrl="/" />
            </ClerkLoaded>

            <ClerkLoading>
              <ColorRing
                visible={true}
                height="80"
                width="80"
                ariaLabel="color-ring-loading"
                wrapperStyle={{}}
                wrapperClass="color-ring-wrapper"
                colors={['#3B82F6', '#6366F1', '#7C3AED', '#9333EA', '#A855F7']}
              />
            </ClerkLoading>
          </div>
        </div>
      </div>
    </header>
  );
};
