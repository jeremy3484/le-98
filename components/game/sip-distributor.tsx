"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PlayerAvatar } from "@/components/player-avatar";

export interface DistributorTarget {
  id: string;
  pseudo: string;
  avatarUrl: string | null;
}

interface SipDistributorProps {
  open: boolean;
  /** Nombre total de gorgées à répartir (multiplicateur déjà appliqué). */
  totalSips: number;
  /** Joueurs pouvant recevoir des gorgées (tous sauf celui qui distribue). */
  targets: DistributorTarget[];
  onSubmit: (distributions: { toPlayerId: string; amount: number }[]) => void;
}

/**
 * Sélecteur visuel de répartition des gorgées : chaque autre joueur a un avatar
 * tapable avec +/- ; on doit répartir TOUT le total avant de valider.
 */
export function SipDistributor({
  open,
  totalSips,
  targets,
  onSubmit,
}: SipDistributorProps) {
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  // Réinitialise à chaque nouvelle ouverture / nouveau palier.
  useEffect(() => {
    if (open) setAmounts({});
  }, [open, totalSips]);

  const assigned = Object.values(amounts).reduce((s, n) => s + n, 0);
  const remaining = totalSips - assigned;

  function bump(id: string, delta: number) {
    setAmounts((cur) => {
      const next = Math.max(0, (cur[id] ?? 0) + delta);
      // Ne pas dépasser le total restant.
      if (delta > 0 && remaining <= 0) return cur;
      return { ...cur, [id]: next };
    });
  }

  function validate() {
    const distributions = targets
      .map((t) => ({ toPlayerId: t.id, amount: amounts[t.id] ?? 0 }))
      .filter((d) => d.amount > 0);
    onSubmit(distributions);
  }

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm" showClose={false}>
        <DialogHeader>
          <DialogTitle>
            Distribue {totalSips} gorgée{totalSips > 1 ? "s" : ""} 🍺
          </DialogTitle>
          <DialogDescription>
            Répartis-les entre les joueurs. Reste à placer :{" "}
            <span
              className={`font-display font-bold ${remaining === 0 ? "text-accent" : "text-primary"}`}
            >
              {remaining}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {targets.map((t) => {
            const v = amounts[t.id] ?? 0;
            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 rounded-xl border p-2 transition ${
                  v > 0
                    ? "border-primary/60 bg-primary/10 shadow-[0_0_18px_-8px_hsl(var(--neon-pink)/0.8)]"
                    : "border-border"
                }`}
              >
                <PlayerAvatar name={t.pseudo} avatarUrl={t.avatarUrl} size={40} />
                <span className="flex-1 truncate text-sm font-medium">{t.pseudo}</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    disabled={v <= 0}
                    onClick={() => bump(t.id, -1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <motion.span
                    key={v}
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    className="w-6 text-center font-display text-lg font-black tabular-nums"
                  >
                    {v}
                  </motion.span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    disabled={remaining <= 0}
                    onClick={() => bump(t.id, 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant={remaining === 0 ? "accent" : "default"}
          size="lg"
          className="mt-2 w-full"
          disabled={remaining !== 0}
          onClick={validate}
        >
          {remaining === 0
            ? "Valider la distribution"
            : `Place encore ${remaining} gorgée${remaining > 1 ? "s" : ""}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
