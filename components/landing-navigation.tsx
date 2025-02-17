"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { useMedia } from "react-use";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NavButton } from "./nav-button";
import { usePathname } from "next/navigation";
import { Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const routes = [
  {
    href: "#features",
    label: "Features",
  },
  {
    href: "#pricing",
    label: "Pricing",
  },
  {
    href: "#faq",
    label: "FAQ",
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
      staggerChildren: 0.1,
    },
  },
};

const childVariants = {
  hidden: { opacity: 0, y: -10 },
  show: { opacity: 1, y: 0 },
};

export const LandingNavigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useMedia("(max-width: 1024px)", false);
  const pathname = usePathname();

  const scrollToSection = (id: string) => {
    const elementId = id.replace("#", ""); // Remove the `#` for getElementById
    const element = document.getElementById(elementId);

    if (element) {
      // Update the URL hash without jumping
      window.history.pushState(null, "", id);

      // Smooth scroll to the section
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      setIsOpen(false);
    }
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
          <motion.nav
            initial="hidden"
            animate="show"
            variants={parentVariants}
            className="flex flex-col gap-y-2 pt-6"
          >
            {routes.map((route) => (
              <motion.div key={route.href} variants={childVariants}>
                <Button
                  variant="ghost"
                  onClick={() => scrollToSection(route.href)}
                  className="w-full justify-start text-lg border-b bg-transparent"
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
    <nav className="hidden items-center gap-x-2 overflow-x-auto lg:flex">
      {routes.map((route) => (
        <NavButton
          key={route.href}
          label={route.label}
          href={route.href}
          isActive={route.href === pathname}
          onClick={() => scrollToSection(route.href)}
        />
      ))}
    </nav>
  );
};
