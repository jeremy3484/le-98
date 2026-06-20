"use client";

import { AnimatePresence, motion } from "framer-motion";
import { jokerDescription, jokerLabel } from "@/lib/supabase/jokers";

export interface JokerBannerData {
  power: string;
  /** Description embarquée dans la carte (repli sur le catalogue). */
  description?: string | null;
  /** Pseudo du joueur qui a posé le Joker. */
  byPseudo: string;
}

interface JokerBannerProps {
  data: JokerBannerData | null;
}

/**
 * Moment fort : superpose un flash plein écran et une bannière animée à TOUS
 * les joueurs lorsqu'un Joker est activé (event 'joker_activated').
 */
export function JokerBanner({ data }: JokerBannerProps) {
  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key="joker-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-6"
        >
          {/* Flash coloré néon */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.92, 0.6] }}
            transition={{ duration: 0.5, times: [0, 0.2, 1] }}
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at center, hsl(330 96% 60% / 0.95) 0%, hsl(268 90% 50% / 0.85) 42%, hsl(240 40% 6%) 100%)",
            }}
          />

          <motion.div
            initial={{ scale: 0.5, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/30 px-6 py-8 text-center shadow-2xl"
          >
            <div className="holo-foil absolute inset-0 opacity-25" />
            <div className="glass absolute inset-0" />
            <div className="relative">
              <motion.div
                animate={{ rotate: [0, -12, 12, 0], scale: [1, 1.18, 1] }}
                transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.4 }}
                className="text-6xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
              >
                🃏
              </motion.div>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.25em] text-white/75">
                Joker activé
              </p>
              <p className="mt-1 font-display text-2xl font-black text-white text-glow-pink">
                {jokerLabel(data.power)}
              </p>
              <p className="mt-2 text-sm font-medium text-white/90">
                {data.description?.trim() || jokerDescription(data.power)}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-fuchsia-200">
                par {data.byPseudo}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
