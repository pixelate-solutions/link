"use client";

import Image from "next/image";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";

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
      <div className="flex items-center">
        <Image src="/logo.svg" alt="Finance logo" height={80} width={80} />
        <p className="ml-2.5 text-4xl font-semibold text-white">Link</p>
      </div>
    </Link>
  ) : (
    <div className="flex items-center">
      <Image src="/logo.svg" alt="Finance logo" height={80} width={80} />
      <p className="ml-2.5 text-4xl font-semibold text-white">Link</p>
    </div>
  );
};
