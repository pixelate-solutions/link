"use client";

import { useUser } from "@clerk/nextjs";

export const WelcomeMsg = () => {
  const { user, isLoaded } = useUser();

  return (
    <div className="mb-4 space-y-2">
      {!!user && (
        <div>
          <h2 className="text-2xl font-medium text-white lg:text-4xl">
            Welcome back{isLoaded ? ", " : " "}
            {user?.firstName}!
          </h2>
            <p className="text-sm text-[#ffffff9d] lg:text-base">
            This is your financial overview report.
          </p>
        </div>
      )}
      {!!!user && (
        <h2 className="text-2xl font-medium text-white lg:text-4xl">
          Welcome!
        </h2>
      )}
    </div>
  );
};
