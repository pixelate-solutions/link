import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavButtonProps = {
  href: string;
  label: string;
  isActive: boolean;
  onClick?: () => void;
};

export const NavButton = ({ href, label, isActive, onClick }: NavButtonProps) => {
  return (
    <Button
      size="sm"
      className={cn(
        "w-full justify-between font-normal bg-white/50 hover:bg-white/40 text-black transition hover:scale-[102%] hover:text-black focus:opacity-90 focus-visible:ring-transparent focus-visible:ring-offset-0 lg:w-auto text-md",
        isActive ? "bg-gradient-to-br from-white to-indigo-500/30" : "bg-transparent"
      )}
      asChild
      onClick={onClick}
    >
      <Link href={href}>{label}</Link>
    </Button>
  );
};
