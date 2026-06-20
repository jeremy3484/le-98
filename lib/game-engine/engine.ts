import type { Card, GameDirection } from "@/types/database";
import { DEFAULT_SETTINGS, type GameSettings } from "./settings";
import {
  applyCard,
  nextPlayerId,
  validateMove,
  type AceChoice,
  type MoveValidation,
} from "./rules";

/** Fonction de mélange injectable (déterministe en test, sécurisée en prod). */
export type Shuffle = <T>(items: T[]) => T[];

/** Mélange identité (préserve l'ordre) — utile pour des tests déterministes. */
export const identityShuffle: Shuffle = (items) => [...items];

/** Joueur minimal nécessaire au moteur (ordonné par position). */
export interface EnginePlayer {
  id: string;
  profile_id: string;
  hand: Card[];
}

/** Entrée de résolution d'un coup. */
export interface PlayInput {
  players: EnginePlayer[]; // actifs, ordonnés par position croissante
  currentPlayerId: string;
  total: number;
  direction: GameDirection;
  card: Card; // carte jouée (présente dans la main du joueur courant)
  aceChoice?: AceChoice;
  pile: Card[]; // pioche (remaining_cards)
  discard: Card[]; // défausse (discard_pile)
  settings?: GameSettings;
  shuffle?: Shuffle;
}

/** Résultat d'un coup VALIDE qui ne perd pas la manche. */
export interface PlayResult {
  kind: "played";
  total: number;
  direction: GameDirection;
  nextPlayerId: string;
  /** Main mise à jour du joueur courant (carte retirée + recomplétée à handSize). */
  playerHand: Card[];
  pile: Card[];
  discard: Card[];
  reverses: boolean;
}

/** Résultat d'un coup qui fait perdre la manche (dépassement forcé). */
export interface RoundLostResult {
  kind: "round_lost";
  loserId: string;
  /** Total atteint au moment du dépassement (informational). */
  bustTotal: number;
}

export type PlayResolution =
  | { ok: true; result: PlayResult | RoundLostResult }
  | { ok: false; validation: MoveValidation };

/**
 * Retire `count` cartes du sommet de la pioche. Si la pioche est insuffisante,
 * remélange la défausse (en gardant la carte du sommet `keepTop`) puis poursuit.
 * Fonction PURE : renvoie de nouveaux tableaux.
 */
export function drawCards(
  pile: Card[],
  discard: Card[],
  count: number,
  shuffle: Shuffle = identityShuffle,
  keepTop?: Card,
): { drawn: Card[]; pile: Card[]; discard: Card[] } {
  let pileOut = [...pile];
  let discardOut = [...discard];
  const drawn: Card[] = [];

  for (let i = 0; i < count; i++) {
    if (pileOut.length === 0) {
      // Remélange la défausse, en conservant la dernière carte posée.
      const top =
        keepTop ??
        (discardOut.length > 0 ? discardOut[discardOut.length - 1] : undefined);
      const recyclable = discardOut.filter((c) => !top || c.id !== top.id);
      if (recyclable.length === 0) break; // plus rien à piocher
      pileOut = shuffle(recyclable);
      discardOut = top ? [top] : [];
    }
    drawn.push(pileOut[0]);
    pileOut = pileOut.slice(1);
  }

  return { drawn, pile: pileOut, discard: discardOut };
}

/**
 * Résout un coup de façon PURE (aucun effet de bord, aucune écriture DB).
 * L'Edge Function applique ensuite le résultat de manière autoritaire.
 */
export function resolvePlay(input: PlayInput): PlayResolution {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const shuffle = input.shuffle ?? identityShuffle;

  const player = input.players.find((p) => p.id === input.currentPlayerId);
  if (!player) {
    return {
      ok: false,
      validation: { valid: false, bust: false, reason: "OVER_LIMIT" },
    };
  }

  const validation = validateMove(
    player.hand,
    input.total,
    input.card,
    input.aceChoice,
    settings,
  );
  if (!validation.valid) {
    return { ok: false, validation };
  }

  // Dépassement forcé → manche perdue par le joueur courant.
  if (validation.bust) {
    const effect = applyCard(input.total, input.card, input.aceChoice, settings);
    return {
      ok: true,
      result: {
        kind: "round_lost",
        loserId: input.currentPlayerId,
        bustTotal: effect.total,
      },
    };
  }

  // Coup légal : applique l'effet.
  const effect = applyCard(input.total, input.card, input.aceChoice, settings);
  const newDirection: GameDirection = effect.reverses
    ? input.direction === "cw"
      ? "ccw"
      : "cw"
    : input.direction;

  // Retire la carte jouée, l'ajoute au sommet de la défausse.
  const handWithout = player.hand.filter((c) => c.id !== input.card.id);
  const discardAfterPlay = [...input.discard, input.card];

  // Recomplète la main jusqu'à handSize.
  const need = Math.max(0, settings.handSize - handWithout.length);
  const draw = drawCards(
    input.pile,
    discardAfterPlay,
    need,
    shuffle,
    input.card,
  );

  const playerHand = [...handWithout, ...draw.drawn];
  const nextId = nextPlayerId(input.players, input.currentPlayerId, newDirection);

  return {
    ok: true,
    result: {
      kind: "played",
      total: effect.total,
      direction: newDirection,
      nextPlayerId: nextId,
      playerHand,
      pile: draw.pile,
      discard: draw.discard,
      reverses: effect.reverses,
    },
  };
}
