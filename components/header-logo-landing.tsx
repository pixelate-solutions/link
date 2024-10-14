"use client";

import Image from "next/image";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";

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
    <div className="hidden lg:flex items-center">
      <Image src="/logo.svg" alt="Finance logo" height={28} width={28} />
      <p className="ml-2.5 text-2xl font-semibold text-white">Link</p>
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
