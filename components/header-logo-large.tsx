"use client";

import Image from "next/image";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Montserrat } from "next/font/google";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

interface HeaderLogoLargeProps {
  withLink?: boolean;
}

export const HeaderLogoLarge = ({ withLink = true }: HeaderLogoLargeProps) => {
  const [logoRoute, setLogoRoute] = useState<string>("/");

  const { user } = useUser();

  useEffect(() => {
    setLogoRoute(user ? "/" : "/"); // This can be adjusted to your desired route logic
  }, [user]);

  return withLink ? (
    <Link href={logoRoute}>
      <div className={cn("flex items-center", montserratP.className)}>
        <Image src="/Link_Logo_Transparent.png" alt="Finance logo" height={50} width={50} />
        <p className="ml-2.5 text-4xl font-semibold text-white">Link</p>
      </div>
    </Link>
  ) : (
    <div className={cn("flex items-center", montserratP.className)}>
      <Image src="/Link_Logo_Transparent.png" alt="Finance logo" height={50} width={50} />
      <p className="ml-2.5 text-4xl font-semibold text-white">Link</p>
    </div>
  );
};
