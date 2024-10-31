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

interface HeaderLogoProps {
  withLink?: boolean; // Optional prop to control whether the logo is a link
}

export const HeaderLogoLanding = ({ withLink = true }: HeaderLogoProps) => {
  const [logoRoute, setLogoRoute] = useState<string>("/");

  const { user } = useUser();

  useEffect(() => {
    setLogoRoute(user ? "/" : "/"); // Adjust this logic to your routing needs
  }, [user]);

  const LogoContent = (
    <div className={cn("hidden lg:flex items-center bg-white bg-opacity-10 rounded-2xl", montserratP.className)}>
      <Image src="/Link_Logo_Full.png" alt="Link logo" height={85} width={85} />
    </div>
  );

  return withLink ? (
    <Link href={logoRoute}>
      {LogoContent}
    </Link>
  ) : (
    LogoContent
  );
};
