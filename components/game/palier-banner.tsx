"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { PalierKind } from "@/lib/game-engine";

export interface PalierBannerData {
  kind: PalierKind;
  total: number;
  sips: number;
}

interface PalierBannerProps {
  data: PalierBannerData | null;
}

/**
 * Bannière animée affichée à TOUS les joueurs quand un palier est franchi.
 * - palier classique : "Palier 80 ! 8 gorgées à distribuer 🍻"
 * - near_end (pile maxTotal) : message spécial "presque la fin".
 */
export function PalierBanner({ data }: PalierBannerProps) {
  return (
    <AnimatePresence>
      {data && data.kind !== "none" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: -24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -16 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
          className="pointer-events-none absolute inset-x-0 top-24 z-50 mx-auto w-fit max-w-[90%] rounded-2xl border border-white/20 px-7 py-4 text-center"
          style={{
            background:
              data.kind === "near_end"
                ? "linear-gradient(135deg, hsl(330 96% 60%), hsl(268 90% 60%))"
                : "linear-gradient(135deg, hsl(42 100% 56%), hsl(330 95% 58%))",
            boxShadow:
              data.kind === "near_end"
                ? "0 0 38px -6px hsl(330 96% 60% / 0.7)"
                : "0 0 38px -6px hsl(42 100% 56% / 0.6)",
          }}
        >
          {data.kind === "near_end" ? (
            <>
              <p className="font-display text-xl font-black text-white drop-shadow">
                😱 {data.total} — presque la fin !
              </p>
              <p className="text-sm font-semibold text-white/95">
                {data.sips > 0
                  ? `${data.sips} gorgée${data.sips > 1 ? "s" : ""} à distribuer 🍻`
                  : "Le prochain qui dépasse explose…"}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-xl font-black text-white drop-shadow">
                🍻 Palier {data.total} !
              </p>
              <p className="text-sm font-semibold text-white/95">
                {data.sips} gorgée{data.sips > 1 ? "s" : ""} à distribuer
              </p>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
