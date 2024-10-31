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
      <div className={cn("flex items-center bg-white bg-opacity-10 rounded-full hover:bg-opacity-20 transition-all", montserratP.className)}>
        <Image src="/Link_Logo_Full.png" alt="Link logo" height={80} width={80} />
      </div>
    </Link>
  ) : (
    <div className={cn("flex items-center bg-white bg-opacity-10 rounded-full", montserratP.className)}>
      <Image src="/Link_Logo_Full.png" alt="Link logo" height={150} width={150} />
    </div>
  );
};
