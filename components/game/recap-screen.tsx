"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown, Beer, X } from "lucide-react";
import { PlayerAvatar } from "@/components/player-avatar";
import { Button } from "@/components/ui/button";

export interface RecapEntry {
  playerId: string;
  profileId: string;
  pseudo: string;
  avatarUrl: string | null;
}

interface RecapScreenProps {
  open: boolean;
  onClose: () => void;
  /** Joueurs de la session. */
  entries: RecapEntry[];
  /** Map game_player_id → gorgées reçues sur la soirée. */
  scores: Record<string, number>;
  /** Map profile_id → manches perdues sur la soirée. */
  roundsLost: Record<string, number>;
}

/**
 * Écran de fin de soirée : récap festif et partageable en capture d'écran.
 * Couronne le « Roi de la soirée » (le plus arrosé) puis classe tous les
 * joueurs avec leurs gorgées reçues et le nombre de manches perdues.
 */
export function RecapScreen({
  open,
  onClose,
  entries,
  scores,
  roundsLost,
}: RecapScreenProps) {
  const ranked = [...entries].sort(
    (a, b) => (scores[b.playerId] ?? 0) - (scores[a.playerId] ?? 0),
  );
  const king = ranked[0] ?? null;
  const max = Math.max(1, ...ranked.map((e) => scores[e.playerId] ?? 0));
  const totalSips = ranked.reduce((s, e) => s + (scores[e.playerId] ?? 0), 0);
  const totalRounds = Object.values(roundsLost).reduce((s, n) => s + n, 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] overflow-y-auto bg-background/95 backdrop-blur-md"
        >
          <div className="mx-auto flex min-h-dvh max-w-md flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-black leading-none text-gradient-festive">
                98
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Fermer le récap"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05 }}
              className="mt-2 text-center"
            >
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
                Fin de la soirée
              </p>
              <h1 className="mt-1 font-display text-3xl font-black text-gradient-festive">
                Stats de la soirée
              </h1>
            </motion.div>

            {/* Roi de la soirée */}
            {king && (
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.1 }}
                className="relative mt-5 overflow-hidden rounded-3xl border border-neon-gold/40 px-6 py-7 text-center"
              >
                <div className="holo-foil absolute inset-0 opacity-20" />
                <div className="glass absolute inset-0" />
                <div className="relative">
                  <motion.div
                    animate={{ rotate: [0, -8, 8, 0], y: [0, -4, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity }}
                    className="mx-auto flex h-10 w-10 items-center justify-center"
                  >
                    <Crown className="h-9 w-9 text-neon-gold drop-shadow-[0_0_10px_hsl(var(--neon-gold)/0.7)]" />
                  </motion.div>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.25em] text-neon-gold">
                    Roi·Reine de la soirée
                  </p>
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <PlayerAvatar
                      name={king.pseudo}
                      avatarUrl={king.avatarUrl}
                      size={72}
                      ring
                      ringClassName="ring-neon-gold"
                    />
                    <p className="font-display text-2xl font-black text-glow-pink">
                      {king.pseudo}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {scores[king.playerId] ?? 0} gorgées encaissées 🍺
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Classement complet */}
            <ol className="mt-5 flex flex-col gap-2">
              {ranked.map((e, i) => {
                const sips = scores[e.playerId] ?? 0;
                const lost = roundsLost[e.profileId] ?? 0;
                return (
                  <motion.li
                    key={e.playerId}
                    initial={{ x: -12, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.15 + i * 0.05 }}
                    className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card/60 px-3 py-2.5"
                  >
                    <span className="w-6 text-center text-base font-bold">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (
                        <span className="text-sm text-muted-foreground">{i + 1}</span>
                      )}
                    </span>
                    <PlayerAvatar name={e.pseudo} avatarUrl={e.avatarUrl} size={40} />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {e.pseudo}
                      </span>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(sips / max) * 100}%`,
                            background:
                              "linear-gradient(90deg, hsl(var(--neon-gold)), hsl(var(--neon-pink)))",
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end leading-tight">
                      <span className="font-display text-sm font-black tabular-nums">
                        {sips} 🍺
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {lost} 💥
                      </span>
                    </div>
                  </motion.li>
                );
              })}
              {ranked.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Pas de stats pour cette soirée.
                </p>
              )}
            </ol>

            {/* Totaux de la soirée */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/5 bg-card/60 px-4 py-3 text-center">
                <Beer className="mx-auto h-5 w-5 text-neon-gold" />
                <p className="mt-1 font-display text-2xl font-black tabular-nums">
                  {totalSips}
                </p>
                <p className="text-xs text-muted-foreground">gorgées au total</p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-card/60 px-4 py-3 text-center">
                <span className="text-xl">💥</span>
                <p className="mt-1 font-display text-2xl font-black tabular-nums">
                  {totalRounds}
                </p>
                <p className="text-xs text-muted-foreground">manches perdues</p>
              </div>
            </div>

            <div className="flex-1" />

            <Button className="mt-6 w-full" size="lg" onClick={onClose}>
              Terminer
            </Button>

            <p className="mt-4 pb-2 text-center text-xs text-muted-foreground">
              🥂 Joue de manière responsable — l&apos;abus d&apos;alcool est
              dangereux pour la santé.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
