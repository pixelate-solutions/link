"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** shadcn/ui Slider on Radix, styled with Link's tokens. Single thumb. */
export function Slider({ className, rangeClassName, ...props }: ComponentProps<typeof SliderPrimitive.Root> & { rangeClassName?: string }) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative flex h-6 w-full cursor-pointer touch-none select-none items-center hover:cursor-pointer data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow cursor-pointer rounded-full bg-surface-3">
        <SliderPrimitive.Range className={cn("absolute h-full rounded-full bg-accent", rangeClassName)} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-5 w-5 cursor-pointer rounded-full border border-line bg-surface shadow-soft outline-none transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-[var(--focus)] active:cursor-grabbing" />
    </SliderPrimitive.Root>
  );
}
