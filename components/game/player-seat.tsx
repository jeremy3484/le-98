"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/player-avatar";

interface PlayerSeatProps {
  pseudo: string;
  avatarUrl: string | null;
  cardCount: number;
  isActive: boolean;
  isHost?: boolean;
  isSelf?: boolean;
}

/**
 * Siège d'un adversaire autour du plateau : avatar, dos de cartes (nombre en
 * main), et anneau pulsant clair indiquant le joueur dont c'est le tour.
 */
export function PlayerSeat({
  pseudo,
  avatarUrl,
  cardCount,
  isActive,
  isHost = false,
  isSelf = false,
}: PlayerSeatProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <motion.div
          animate={
            isActive
              ? { boxShadow: "0 0 0 3px hsl(var(--primary))", scale: 1.05 }
              : { boxShadow: "0 0 0 0px transparent", scale: 1 }
          }
          transition={{ duration: 0.25 }}
          className="rounded-full"
        >
          <PlayerAvatar name={pseudo} avatarUrl={avatarUrl} size={48} />
        </motion.div>

        {/* Mini dos de cartes empilées */}
        <div className="absolute -bottom-1 -right-2 flex">
          {Array.from({ length: Math.min(cardCount, 4) }).map((_, i) => (
            <span
              key={i}
              className="h-4 w-3 rounded-[2px] border border-white/40 bg-gradient-to-br from-indigo-600 to-indigo-800"
              style={{ marginLeft: i === 0 ? 0 : -6 }}
            />
          ))}
        </div>

        {isActive && (
          <motion.span
            className="absolute -inset-1 rounded-full ring-2 ring-primary"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        )}
      </div>

      <div className="flex items-center gap-1">
        <span
          className={cn(
            "max-w-[80px] truncate text-xs font-medium",
            isActive && "text-primary",
          )}
        >
          {isSelf ? "Toi" : pseudo}
        </span>
        {isHost && <Crown className="h-3 w-3 text-amber-500" />}
      </div>
      <span className="text-[10px] text-muted-foreground">{cardCount} cartes</span>
    </div>
  );
}
