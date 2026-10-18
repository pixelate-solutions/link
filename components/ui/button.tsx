"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "quiet" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3",
  ghost: "text-fg hover:bg-surface-2",
  quiet: "text-muted hover:text-fg",
  danger: "bg-caution-soft text-caution hover:opacity-90",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-full gap-1.5",
  md: "h-10 px-4 text-sm rounded-full gap-2",
  lg: "h-12 px-6 text-[15px] rounded-full gap-2",
  icon: "h-10 w-10 rounded-full",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
}

/** Pressable with subtle tactile feedback; never celebratory. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", busy, className, children, disabled, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || busy ? undefined : { scale: 0.97 }}
      className={cn(
        "relative inline-flex select-none items-center justify-center font-medium transition-[background-color,opacity,color] duration-150 disabled:opacity-40 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-[inherit]", busy && "opacity-0")}>{children as React.ReactNode}</span>
      {busy && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        </span>
      )}
    </motion.button>
  );
});
