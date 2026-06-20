"use client";

import { AnimatePresence, motion } from "framer-motion";

export interface CustomRuleBannerData {
  label: string;
  actionType: string;
  /** Pseudo du joueur qui a posé la carte déclenchant la règle. */
  byPseudo: string;
}

interface CustomRuleBannerProps {
  data: CustomRuleBannerData | null;
}

/** Ligne d'action contextuelle selon le type de règle. */
function actionLine(actionType: string, byPseudo: string): string {
  switch (actionType) {
    case "cul_sec":
      return `Cul sec pour ${byPseudo} ! 🥂`;
    case "sips_fixed":
      return `${byPseudo} distribue des gorgées 🍺`;
    default:
      return `Déclenchée par ${byPseudo}`;
  }
}

/**
 * Bannière animée bien visible affichée à TOUS les joueurs lorsqu'une règle
 * personnalisée se déclenche (event 'custom_rule_triggered').
 */
export function CustomRuleBanner({ data }: CustomRuleBannerProps) {
  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: -24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -16 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
          className="pointer-events-none absolute inset-x-0 top-40 z-50 mx-auto w-fit max-w-[90%] rounded-2xl border border-white/20 px-7 py-4 text-center"
          style={{
            background: "linear-gradient(135deg, hsl(188 95% 50%), hsl(268 90% 62%))",
            boxShadow: "0 0 36px -6px hsl(188 95% 55% / 0.6)",
          }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/85">
            🎯 Règle activée
          </p>
          <p className="font-display text-xl font-black text-white drop-shadow">
            {data.label}
          </p>
          <p className="text-sm font-semibold text-white/95">
            {actionLine(data.actionType, data.byPseudo)}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
