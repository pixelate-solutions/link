"use client";

import { AnimatePresence, motion, type PanInfo, useReducedMotion } from "motion/react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Contextual surface: a draggable bottom sheet on phones, a side panel on
 * larger screens. Focus is trapped and restored by Radix.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle,
  children,
  className,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hideTitle?: boolean;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const reduce = useReducedMotion();
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onOpenChange(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/25 dark:bg-black/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={cn(
                  "fixed z-50 flex flex-col bg-surface text-fg shadow-soft outline-none",
                  desktop
                    ? cn("inset-y-3 right-3 rounded-lg", wide ? "w-[min(560px,calc(100vw-24px))]" : "w-[min(440px,calc(100vw-24px))]")
                    : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-lg",
                  className,
                )}
                initial={desktop ? { x: reduce ? 0 : 40, opacity: 0 } : { y: reduce ? 0 : "100%" }}
                animate={desktop ? { x: 0, opacity: 1 } : { y: 0 }}
                exit={desktop ? { x: reduce ? 0 : 40, opacity: 0 } : { y: reduce ? 0 : "100%" }}
                transition={{ type: "spring", stiffness: 420, damping: 40 }}
                drag={desktop || reduce ? false : "y"}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={onDragEnd}
              >
                {!desktop && <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line" aria-hidden />}
                <div className={cn("flex shrink-0 items-center justify-between px-5 pt-4 pb-2", hideTitle && "sr-only")}>
                  <Dialog.Title className="text-[15px] font-semibold tracking-tight">{title}</Dialog.Title>
                  <Dialog.Close className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
                    <X size={16} />
                  </Dialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 safe-bottom">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
