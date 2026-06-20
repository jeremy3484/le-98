import type { Card, GameDirection } from "@/types/database";
import { DEFAULT_SETTINGS, type GameSettings } from "./settings";
import { drawCards, identityShuffle, type EnginePlayer, type Shuffle } from "./engine";

/**
 * Les 10 pouvoirs de carte Joker (source de vérité = JOKER_CATALOG côté client).
 * Dupliqué en union pour le moteur pur sans dépendre du code Supabase.
 */
export type JokerPower =
  | "collective_drink"
  | "swap_hands"
  | "free_distribution"
  | "reverse"
  | "reset_zero"
  | "double_or_nothing"
  | "mirror"
  | "ghost_draw"
  | "immunity"
  | "musical_chairs";

/** Drapeaux d'effet Joker persistés dans `room.settings`. */
export interface JokerFlags {
  /** « Double ou rien » : la prochaine carte compte double. */
  nextCardDoubled?: boolean;
  /** Joueurs ignorant le prochain palier qui les viserait. */
  immunePlayers?: string[];
  /** Contrainte « carte miroir » imposée au joueur suivant. */
  mirror?: { value: string; playerId: string; penalty: number };
  /** Pénalité (gorgées) par défaut d'une carte miroir ratée. */
  mirrorPenaltySips?: number;
}

export interface ResolveJokerInput {
  power: string;
  /** Joueurs actifs, ordonnés par position croissante, avec leurs mains. */
  players: EnginePlayer[];
  poserId: string;
  total: number;
  direction: GameDirection;
  /** La carte Joker jouée (présente dans la main du poseur). */
  jokerCard: Card;
  pile: Card[];
  discard: Card[];
  /** Valeur de la carte précédemment au sommet de la défausse (carte miroir). */
  prevTopValue?: string | null;
  flags?: JokerFlags;
  settings?: GameSettings;
  shuffle?: Shuffle;
}

export interface ResolveJokerResult {
  total: number;
  direction: GameDirection;
  /** Ordre des joueurs après coup (permuté par la chaise musicale). */
  order: EnginePlayer[];
  /** Mains par id de joueur après application du pouvoir. */
  handsById: Record<string, Card[]>;
  pile: Card[];
  discard: Card[];
  nextPlayerId: string;
  /** Les positions ont-elles changé (chaise musicale) ? */
  positionsChanged: boolean;
  /** Drapeaux mis à jour à persister dans `room.settings`. */
  flags: JokerFlags;
}

/**
 * Résout le pouvoir d'une carte Joker — fonction PURE (jumelle de `handleJoker`
 * dans l'Edge Function play-card). Le Joker est toujours jouable, retire la carte
 * de la main du poseur (qui repioche jusqu'à handSize), puis applique l'effet et
 * passe la main au joueur suivant. Ne modifie JAMAIS directement le total sauf
 * `reset_zero`.
 */
export function resolveJoker(input: ResolveJokerInput): ResolveJokerResult {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const shuffle = input.shuffle ?? identityShuffle;
  const flags: JokerFlags = { ...(input.flags ?? {}) };

  // Retire le Joker de la main du poseur, repioche jusqu'à handSize.
  const poser = input.players.find((p) => p.id === input.poserId);
  const poserHand = poser ? poser.hand : [];
  const handWithout = poserHand.filter((c) => c.id !== input.jokerCard.id);
  let discardAfter = [...input.discard, input.jokerCard];
  const need = Math.max(0, settings.handSize - handWithout.length);
  const drawP = drawCards(input.pile, discardAfter, need, shuffle, input.jokerCard);
  let pile = drawP.pile;
  discardAfter = drawP.discard;

  // Snapshot des mains par id (le poseur a déjà repioché).
  const handsById: Record<string, Card[]> = {};
  for (const p of input.players) {
    handsById[p.id] =
      p.id === input.poserId ? [...handWithout, ...drawP.drawn] : [...p.hand];
  }

  let order = [...input.players];
  let newDirection: GameDirection = input.direction;
  let newTotal = input.total;
  let positionsChanged = false;

  switch (input.power) {
    case "reverse":
      newDirection = input.direction === "cw" ? "ccw" : "cw";
      break;
    case "reset_zero":
      newTotal = 0;
      break;
    case "double_or_nothing":
      flags.nextCardDoubled = true;
      break;
    case "swap_hands": {
      const n = order.length;
      const rotated: Record<string, Card[]> = {};
      for (let i = 0; i < n; i++) {
        const giver = order[(i - 1 + n) % n];
        rotated[order[i].id] = handsById[giver.id];
      }
      for (const id of Object.keys(rotated)) handsById[id] = rotated[id];
      break;
    }
    case "ghost_draw": {
      for (const p of order) {
        if (p.id === input.poserId) continue;
        const d = drawCards(pile, discardAfter, 1, shuffle, input.jokerCard);
        handsById[p.id] = [...handsById[p.id], ...d.drawn];
        pile = d.pile;
        discardAfter = d.discard;
      }
      break;
    }
    case "immunity": {
      const list = Array.isArray(flags.immunePlayers) ? [...flags.immunePlayers] : [];
      if (!list.includes(input.poserId)) list.push(input.poserId);
      flags.immunePlayers = list;
      break;
    }
    case "musical_chairs":
      order = shuffle(order);
      positionsChanged = true;
      break;
    // collective_drink, free_distribution : effet purement visuel / client.
    default:
      break;
  }

  // Joueur suivant selon le sens courant et l'ordre (éventuellement remélangé).
  const curIdx = order.findIndex((p) => p.id === input.poserId);
  const step = newDirection === "cw" ? 1 : -1;
  const nextPlayer = order[(curIdx + step + order.length) % order.length];

  // Carte miroir : le joueur suivant devra rejouer la valeur de la carte
  // précédente, sinon il boit.
  if (
    input.power === "mirror" &&
    input.prevTopValue &&
    input.prevTopValue !== "JOKER"
  ) {
    flags.mirror = {
      value: input.prevTopValue,
      playerId: nextPlayer.id,
      penalty:
        typeof flags.mirrorPenaltySips === "number" ? flags.mirrorPenaltySips : 2,
    };
  }

  return {
    total: newTotal,
    direction: newDirection,
    order,
    handsById,
    pile,
    discard: discardAfter,
    nextPlayerId: nextPlayer.id,
    positionsChanged,
    flags,
  };
}
