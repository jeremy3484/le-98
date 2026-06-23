"use client";

import { motion, AnimatePresence } from "framer-motion";

interface TotalGaugeProps {
  total: number;
  maxTotal?: number;
}

/**
 * Interpole une teinte néon : lime (loin de 98) → or (mi-chemin) → magenta
 * (proche de 98). Reste cohérent avec la palette festive de l'app.
 */
function gaugeColor(ratio: number): string {
  const r = Math.min(1, Math.max(0, ratio));
  let hue: number;
  if (r < 0.5) {
    hue = 82 - 40 * (r / 0.5); // lime 82 → or 42
  } else {
    hue = 42 - 64 * ((r - 0.5) / 0.5); // or 42 → magenta (-22 ≡ 338)
  }
  hue = (hue + 360) % 360;
  return `hsl(${Math.round(hue)}, 92%, 58%)`;
}

/**
 * Total courant en très gros chiffre central (police display) + anneau de
 * progression vers 98 dont la couleur néon évolue du lime au magenta, avec halo.
 */
export function TotalGauge({ total, maxTotal = 98 }: TotalGaugeProps) {
  const ratio = Math.min(1, total / maxTotal);
  const color = gaugeColor(ratio);
  const danger = ratio >= 0.82;

  const size = 200;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * ratio;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Halo d'ambiance */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full blur-2xl transition-opacity"
        style={{ background: color, opacity: 0.18 }}
      />

      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-white/5"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: circumference - dash, stroke: color }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          style={{ filter: `drop-shadow(0 0 7px ${color})` }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={total}
            initial={{ scale: 0.5, opacity: 0, y: 8 }}
            animate={
              danger
                ? { scale: [1, 1.06, 1], opacity: 1, y: 0 }
                : { scale: 1, opacity: 1, y: 0 }
            }
            exit={{ scale: 1.4, opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="font-display text-6xl font-black tabular-nums"
            style={{ color, textShadow: `0 0 24px ${color}` }}
          >
            {total}
          </motion.span>
        </AnimatePresence>
        <span className="font-display text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          / {maxTotal}
        </span>
      </div>
    </div>
  );
}
