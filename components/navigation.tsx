"use client";

import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useMedia } from "react-use";
import { motion } from "framer-motion";

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
  // {
  //   href: "/guide",
  //   label: "Guide",
  // },
  {
    href: "/categories",
    label: "Categories",
  },
  {
    href: "/transactions",
    label: "Transactions",
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

// Framer Motion Variants for Staggered Animation
const parentVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1, // delay between children animations
    },
  },
};

const childVariants = {
  hidden: { opacity: 0, y: -10 },
  show: { opacity: 1, y: 0 },
};

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
            className={cn(
              "border bg-white/20 font-normal text-black outline-none transition hover:bg-white/30 hover:text-black focus:bg-white/30 focus-visible:ring-transparent focus-visible:ring-offset-0",
              montserratP.className
            )}
          >
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>

        <SheetContent
          side="left"
          className="px-2 border bg-gradient-to-br from-white to-blue-500/20"
        >
          {/* Motion nav with staggered children */}
          <motion.nav
            initial="hidden"
            animate="show"
            variants={parentVariants}
            className="flex flex-col gap-y-2 pt-6"
          >
            {routes.map((route) => (
              <motion.div key={route.href} variants={childVariants}>
                <Button
                  variant={route.href === pathname ? "secondary" : "ghost"}
                  onClick={() => onClick(route.href)}
                  className={cn(
                    "w-full justify-start text-lg border-b bg-transparent",
                    route.href === "/settings" && "border-none"
                  )}
                >
                  {route.label}
                </Button>
              </motion.div>
            ))}
          </motion.nav>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <nav className="hidden items-center gap-x-2 overflow-x-auto lg:flex text-black">
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
