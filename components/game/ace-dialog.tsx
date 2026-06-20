"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { AceChoice } from "@/lib/game-engine";

interface AceDialogProps {
  open: boolean;
  /** Total avant la pose, pour montrer le résultat de chaque choix. */
  currentTotal: number;
  maxTotal?: number;
  onChoose: (choice: AceChoice) => void;
  onCancel: () => void;
}

/** Modale de choix de la valeur de l'As : +1 ou +11. */
export function AceDialog({
  open,
  currentTotal,
  maxTotal = 98,
  onChoose,
  onCancel,
}: AceDialogProps) {
  const plus1 = currentTotal + 1;
  const plus11 = currentTotal + 11;
  const over11 = plus11 > maxTotal;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Valeur de l&apos;As ?</DialogTitle>
          <DialogDescription>
            Choisis combien vaut ton As.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-auto flex-col py-4"
            onClick={() => onChoose(1)}
          >
            <span className="text-2xl font-black">+1</span>
            <span className="text-xs text-muted-foreground">→ {plus1}</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col py-4"
            disabled={over11}
            onClick={() => onChoose(11)}
          >
            <span className="text-2xl font-black">+11</span>
            <span className="text-xs text-muted-foreground">
              {over11 ? "dépasse 98" : `→ ${plus11}`}
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
