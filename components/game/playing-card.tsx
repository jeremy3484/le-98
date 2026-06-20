"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { cardLabel, isRedSuit } from "@/lib/game-engine";
import { jokerDescription, jokerLabel } from "@/lib/supabase/jokers";
import type { Card } from "@/types/database";

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

interface PlayingCardProps {
  card?: Card;
  /** Carte face cachée (main des adversaires). */
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

interface SizeSpec {
  box: string;
  idx: string;
  idxSuit: string;
  pip: string;
}

const SIZES: Record<"sm" | "md" | "lg", SizeSpec> = {
  sm: { box: "h-14 w-10 rounded-lg", idx: "text-[10px]", idxSuit: "text-[8px]", pip: "text-xl" },
  md: { box: "h-20 w-14 rounded-xl", idx: "text-sm", idxSuit: "text-[10px]", pip: "text-3xl" },
  lg: { box: "h-28 w-20 rounded-2xl", idx: "text-lg", idxSuit: "text-xs", pip: "text-5xl" },
};

/** Carte à jouer : recto (valeur + enseigne) ou verso (dos « 98 » néon). */
export function PlayingCard({
  card,
  faceDown = false,
  size = "md",
  className,
}: PlayingCardProps) {
  const s = SIZES[size];

  if (faceDown || !card) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden border border-white/10 bg-[#12121c] shadow-[0_4px_14px_-6px_rgba(0,0,0,0.7)]",
          s.box,
          className,
        )}
      >
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(circle at 28% 18%, hsl(var(--neon-pink) / 0.55), transparent 55%), radial-gradient(circle at 78% 86%, hsl(var(--neon-cyan) / 0.5), transparent 55%)",
          }}
        />
        <div className="pointer-events-none absolute inset-[3px] rounded-[inherit] border border-white/10" />
        <span
          className={cn(
            "font-display font-black tracking-tight text-white/90",
            s.pip,
          )}
        >
          98
        </span>
      </div>
    );
  }

  if (card.value === "JOKER") {
    return <JokerCard card={card} size={size} className={className} />;
  }

  const red = isRedSuit(card.suit);
  const symbol = card.suit ? SUIT_SYMBOL[card.suit] : "";
  const label = cardLabel(card.value);
  const color = red ? "text-rose-600" : "text-neutral-900";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden border border-black/10 bg-gradient-to-br from-white to-neutral-100 shadow-[0_4px_14px_-5px_rgba(0,0,0,0.55)]",
        s.box,
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-[3px] rounded-[inherit] border border-black/5" />

      {/* Index haut-gauche */}
      <div
        className={cn(
          "absolute left-1 top-0.5 flex flex-col items-center leading-none",
          color,
        )}
      >
        <span className={cn("font-display font-bold", s.idx)}>{label}</span>
        <span className={s.idxSuit}>{symbol}</span>
      </div>

      {/* Enseigne centrale */}
      <span className={cn("leading-none", s.pip, color)}>{symbol}</span>

      {/* Index bas-droite (inversé) */}
      <div
        className={cn(
          "absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center leading-none",
          color,
        )}
      >
        <span className={cn("font-display font-bold", s.idx)}>{label}</span>
        <span className={s.idxSuit}>{symbol}</span>
      </div>
    </div>
  );
}

/** Carte Joker : foil holographique animé + badge « ? » dévoilant le pouvoir. */
function JokerCard({
  card,
  size,
  className,
}: {
  card: Card;
  size: "sm" | "md" | "lg";
  className?: string;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const s = SIZES[size];
  const power = typeof card.power === "string" ? card.power : "";
  const description =
    (typeof card.description === "string" && card.description.trim()) ||
    (power ? jokerDescription(power) : "Pouvoir spécial.");

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden border border-white/40 text-white shadow-[0_0_22px_-4px_hsl(var(--neon-pink)/0.7)]",
        s.box,
        className,
      )}
    >
      <div className="holo-foil absolute inset-0 opacity-90" />
      <div className="holo-sheen absolute inset-0 mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-[3px] rounded-[inherit] border border-white/40" />

      <span className="relative z-10 text-2xl leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
        🃏
      </span>
      <span className="relative z-10 mt-0.5 font-display text-[9px] font-bold uppercase tracking-[0.15em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
        Joker
      </span>

      {/* Badge « ? » : ne déclenche pas la pose de la carte. */}
      <span
        role="button"
        tabIndex={0}
        aria-label="Voir le pouvoir du Joker"
        onClick={(e) => {
          e.stopPropagation();
          setShowInfo((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setShowInfo((v) => !v);
          }
        }}
        className="absolute -right-1.5 -top-1.5 z-20 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-white text-xs font-black text-fuchsia-700 shadow ring-1 ring-fuchsia-300"
      >
        ?
      </span>

      {showInfo && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-1/2 z-50 mb-2 w-44 -translate-x-1/2 rounded-xl border border-white/10 bg-neutral-900/95 px-3 py-2 text-center text-xs font-medium text-white shadow-xl backdrop-blur"
        >
          <p className="font-display font-bold text-fuchsia-300">
            {power ? jokerLabel(power) : "Joker"}
          </p>
          <p className="mt-0.5 text-white/90">{description}</p>
        </div>
      )}
    </div>
  );
}
