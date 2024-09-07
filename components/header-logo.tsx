"use client";

import Image from "next/image";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";

export const HeaderLogo = () => {
  const [logoRoute, setLogoRoute] = useState<string>("/");

  const { user } = useUser();

  useEffect(() => {
    setLogoRoute(user ? "/overview" : "/");
  }, [user]);

  return (
    <Link href={logoRoute}>
      <div className="hidden items-center lg:flex">
        <Image src="/logo.svg" alt="Finance logo" height={28} width={28} />
        <p className="ml-2.5 text-2xl font-semibold text-white">Link</p>
      </div>
    </Link>
  );
};
