"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Calm, fast page entrance on navigation. Transform + opacity only. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
      {children}
    </motion.div>
  );
}
