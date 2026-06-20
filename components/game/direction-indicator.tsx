"use client";

import { motion } from "framer-motion";
import { RotateCw, RotateCcw } from "lucide-react";
import type { GameDirection } from "@/types/database";

interface DirectionIndicatorProps {
  direction: GameDirection;
  className?: string;
}

/**
 * Flèche circulaire indiquant le sens du tour. Bascule visuellement (flip +
 * rotation) quand une Dame inverse le sens.
 */
export function DirectionIndicator({
  direction,
  className,
}: DirectionIndicatorProps) {
  const cw = direction === "cw";
  return (
    <motion.div
      key={direction}
      initial={{ rotateY: 90, scale: 0.6, opacity: 0 }}
      animate={{ rotateY: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className={className}
      title={cw ? "Sens horaire" : "Sens anti-horaire"}
    >
      {cw ? (
        <RotateCw className="h-6 w-6 text-primary" />
      ) : (
        <RotateCcw className="h-6 w-6 text-primary" />
      )}
    </motion.div>
  );
}
