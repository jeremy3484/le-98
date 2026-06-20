"use client";

import { Beer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PlayerAvatar } from "@/components/player-avatar";
import { MultiplierBadge } from "@/components/game/multiplier-badge";

export interface ScoreboardEntry {
  playerId: string;
  pseudo: string;
  avatarUrl: string | null;
}

interface ScoreboardProps {
  open: boolean;
  onClose: () => void;
  /** Joueurs de la session (pour l'affichage avatar + pseudo). */
  entries: ScoreboardEntry[];
  /** Map game_player_id → total de gorgées reçues sur la soirée. */
  scores: Record<string, number>;
  multiplier: number;
}

/**
 * Tableau des gorgées reçues par chaque joueur, cumulé sur toute la session.
 * Trié du plus arrosé au moins arrosé.
 */
export function Scoreboard({
  open,
  onClose,
  entries,
  scores,
  multiplier,
}: ScoreboardProps) {
  const ranked = [...entries].sort(
    (a, b) => (scores[b.playerId] ?? 0) - (scores[a.playerId] ?? 0),
  );
  const max = Math.max(1, ...ranked.map((e) => scores[e.playerId] ?? 0));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 sm:justify-start">
            <Beer className="h-5 w-5 text-neon-gold" />
            Gorgées de la soirée
            <MultiplierBadge multiplier={multiplier} />
          </DialogTitle>
          <DialogDescription>
            Cumul des gorgées reçues par chaque joueur.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-2">
          {ranked.map((e, i) => {
            const total = scores[e.playerId] ?? 0;
            return (
              <li key={e.playerId} className="flex items-center gap-3">
                <span className="w-6 text-center text-base font-bold">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (
                    <span className="text-sm text-muted-foreground">{i + 1}</span>
                  )}
                </span>
                <PlayerAvatar name={e.pseudo} avatarUrl={e.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.pseudo}</span>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(total / max) * 100}%`,
                        background:
                          "linear-gradient(90deg, hsl(var(--neon-gold)), hsl(var(--neon-pink)))",
                      }}
                    />
                  </div>
                </div>
                <span className="shrink-0 font-display text-sm font-black tabular-nums">
                  {total} 🍺
                </span>
              </li>
            );
          })}
          {ranked.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucune gorgée distribuée pour l&apos;instant.
            </p>
          )}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
