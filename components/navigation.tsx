"use client";

import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useMedia } from "react-use";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

import { NavButton } from "./nav-button";
import { cn } from "@/lib/utils";
import { Montserrat } from "next/font/google";

const routes = [
  {
    href: "/overview",
    label: "Overview",
  },
  {
    href: "/transactions",
    label: "Transactions",
  },
  {
    href: "/logic",
    label: "Logic",
  },
  {
    href: "/categories",
    label: "Categories",
  },
  {
    href: "/accounts",
    label: "Accounts",
  },
  {
    href: "/settings",
    label: "Settings",
  },
];

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

export const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useMedia("(max-width: 1024px)", false);

  const onClick = (href: string) => {
    router.push(href);
    setIsOpen(false);
  };

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("border-none bg-white/10 font-normal text-white outline-none transition hover:bg-white/20 hover:text-white focus:bg-white/30 focus-visible:ring-transparent focus-visible:ring-offset-0", montserratP.className)}
          >
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>

        <SheetContent side="left" className="px-2">
          <nav className="flex flex-col gap-y-2 pt-6">
            {routes.map((route) => (
              <Button
                key={route.href}
                variant={route.href === pathname ? "secondary" : "ghost"}
                onClick={() => onClick(route.href)}
                className="w-full justify-start"
              >
                {route.label}
              </Button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <nav className="hidden items-center gap-x-2 overflow-x-auto lg:flex">
      {routes.map((route) => (
        <NavButton
          key={route.href}
          label={route.label}
          href={route.href}
          isActive={route.href === pathname}
        />
      ))}
    </nav>
  );
};
