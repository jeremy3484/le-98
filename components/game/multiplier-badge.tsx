"use client";

import { motion } from "framer-motion";
import { Flame } from "lucide-react";

interface MultiplierBadgeProps {
  multiplier: number;
}

/**
 * Badge permanent affiché tant que le modificateur global de gorgées est actif
 * (sipsMultiplier > 1). Ex : "x2 actif".
 */
export function MultiplierBadge({ multiplier }: MultiplierBadgeProps) {
  if (multiplier <= 1) return null;
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="inline-flex items-center gap-1 rounded-full bg-neon-gold/15 px-2 py-0.5 text-xs font-bold text-neon-gold ring-1 ring-neon-gold/40"
      title={`Toutes les gorgées comptent x${multiplier}`}
    >
      <Flame className="h-3 w-3" />
      x{multiplier} actif
    </motion.span>
  );
}
