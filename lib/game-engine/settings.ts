import type { Json } from "@/types/database";

/**
 * Paramètres effectifs d'une partie. Lus depuis `room.settings` avec des valeurs
 * par défaut, afin de rester personnalisables (Phase 5) sans changer le moteur.
 */
export interface GameSettings {
  /** Total à ne pas dépasser. Défaut : 98. */
  maxTotal: number;
  /** Valeur fixée par le Roi. Défaut : 70. */
  kingValue: number;
  /** Variation apportée par le Valet. Défaut : -10. */
  jackDelta: number;
  /** Total plancher (jamais en dessous). Défaut : 0. */
  minTotal: number;
  /** Nombre de cartes en main. Défaut : 4. */
  handSize: number;
  /** Les deux valeurs possibles de l'As. Défaut : [1, 11]. */
  aceValues: [number, number];
  /** Premier joueur du tour après une manche perdue : 'loser' ou 'host'. */
  firstPlayerAfterLoss: "loser" | "host";

  // --- Paliers à gorgées (Phase 4) -------------------------------------------
  /** Pas des paliers : tout multiple de ce pas déclenche un palier. Défaut 10. */
  sipStep: number;
  /** Bornes [min, max] des totaux qui déclenchent un palier. Défaut [10, 90]. */
  sipRange: [number, number];
  /** Gorgées spéciales en atteignant pile `maxTotal` ("presque la fin"). Défaut 0. */
  nearEndSips: number;
  /** Qui répartit les gorgées d'un palier. Défaut 'player_who_played'. */
  sipAssignedBy: "player_who_played" | "all_choose" | "random";
  /** Multiplicateur global des gorgées (ex: 2 = "tout compte double"). Défaut 1. */
  sipsMultiplier: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  maxTotal: 98,
  kingValue: 70,
  jackDelta: -10,
  minTotal: 0,
  handSize: 4,
  aceValues: [1, 11],
  firstPlayerAfterLoss: "loser",
  sipStep: 10,
  sipRange: [10, 90],
  nearEndSips: 0,
  sipAssignedBy: "player_who_played",
  sipsMultiplier: 1,
};

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Construit des paramètres effectifs à partir du JSON brut de `room.settings`.
 * Toute valeur absente ou invalide retombe sur le défaut.
 */
export function resolveSettings(raw: Json | null | undefined): GameSettings {
  const s = (raw ?? {}) as Record<string, unknown>;
  const ace = Array.isArray(s.aceValues) ? s.aceValues : null;
  const range = Array.isArray(s.sipRange) ? s.sipRange : null;
  const assignedBy =
    s.sipAssignedBy === "all_choose" || s.sipAssignedBy === "random"
      ? s.sipAssignedBy
      : "player_who_played";

  return {
    maxTotal: numberOr(s.maxTotal, DEFAULT_SETTINGS.maxTotal),
    kingValue: numberOr(s.kingValue, DEFAULT_SETTINGS.kingValue),
    jackDelta: numberOr(s.jackDelta, DEFAULT_SETTINGS.jackDelta),
    minTotal: numberOr(s.minTotal, DEFAULT_SETTINGS.minTotal),
    handSize: numberOr(s.handSize, DEFAULT_SETTINGS.handSize),
    aceValues:
      ace && ace.length === 2
        ? [numberOr(ace[0], 1), numberOr(ace[1], 11)]
        : DEFAULT_SETTINGS.aceValues,
    firstPlayerAfterLoss:
      s.firstPlayerAfterLoss === "host" ? "host" : "loser",
    sipStep: numberOr(s.sipStep, DEFAULT_SETTINGS.sipStep),
    sipRange:
      range && range.length === 2
        ? [numberOr(range[0], 10), numberOr(range[1], 90)]
        : DEFAULT_SETTINGS.sipRange,
    nearEndSips: numberOr(s.nearEndSips, DEFAULT_SETTINGS.nearEndSips),
    sipAssignedBy: assignedBy,
    sipsMultiplier: numberOr(s.sipsMultiplier, DEFAULT_SETTINGS.sipsMultiplier),
  };
}
