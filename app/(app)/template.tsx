"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Quick fade on navigation; nothing moves, so tab switches feel immediate. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
