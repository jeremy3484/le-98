import type { Card, GameDirection } from "@/types/database";
import { faceValue } from "./cards";
import { DEFAULT_SETTINGS, type GameSettings } from "./settings";

export type AceChoice = 1 | 11;

/** Effet du jeu d'une carte sur le total courant. */
export interface CardEffect {
  /** Nouveau total après application (borné à [minTotal, +∞)). */
  total: number;
  /** La Dame inverse le sens du tour. */
  reverses: boolean;
}

/**
 * Applique une carte au total courant — fonction PURE, cœur des règles du 98.
 *
 * - 2 à 10 : + valeur faciale
 * - As (A) : + aceChoice (1 ou 11, défaut 11)
 * - Valet (J) : jackDelta (défaut -10), borné au plancher
 * - Dame (Q) : +0 et inverse le sens
 * - Roi (K) : fixe le total à kingValue (défaut 70)
 * - JOKER : neutre en Phase 3 (pouvoirs définis en Phase 6)
 */
export function applyCard(
  currentTotal: number,
  card: Pick<Card, "value">,
  aceChoice: AceChoice | undefined = undefined,
  settings: GameSettings = DEFAULT_SETTINGS,
): CardEffect {
  const value = card.value;

  switch (value) {
    case "A": {
      const add = aceChoice ?? (settings.aceValues[1] as AceChoice);
      return { total: currentTotal + add, reverses: false };
    }
    case "J":
      return {
        total: Math.max(settings.minTotal, currentTotal + settings.jackDelta),
        reverses: false,
      };
    case "Q":
      return { total: currentTotal, reverses: true };
    case "K":
      return { total: settings.kingValue, reverses: false };
    case "JOKER":
      return { total: currentTotal, reverses: false };
    default:
      return { total: currentTotal + faceValue(value), reverses: false };
  }
}

/** Le total résultant respecte-t-il la limite (≤ maxTotal) ? */
export function isWithinLimit(
  total: number,
  settings: GameSettings = DEFAULT_SETTINGS,
): boolean {
  return total <= settings.maxTotal;
}

/**
 * Plus petit total atteignable en jouant cette carte (As → choix le plus bas).
 * Sert à déterminer si une carte « peut rester » sous la limite.
 */
export function minTotalForCard(
  currentTotal: number,
  card: Pick<Card, "value">,
  settings: GameSettings = DEFAULT_SETTINGS,
): number {
  if (card.value === "A") {
    const low = Math.min(settings.aceValues[0], settings.aceValues[1]) as AceChoice;
    return applyCard(currentTotal, card, low, settings).total;
  }
  return applyCard(currentTotal, card, undefined, settings).total;
}

/** Cette carte peut-elle être jouée en restant ≤ maxTotal ? */
export function canCardStay(
  currentTotal: number,
  card: Pick<Card, "value">,
  settings: GameSettings = DEFAULT_SETTINGS,
): boolean {
  return isWithinLimit(minTotalForCard(currentTotal, card, settings), settings);
}

/** Sous-ensemble de la main jouable sans dépasser la limite. */
export function playableCards(
  hand: Card[],
  currentTotal: number,
  settings: GameSettings = DEFAULT_SETTINGS,
): Card[] {
  return hand.filter((c) => canCardStay(currentTotal, c, settings));
}

/** Le joueur a-t-il au moins un coup légal (qui reste ≤ maxTotal) ? */
export function hasPlayableCard(
  hand: Card[],
  currentTotal: number,
  settings: GameSettings = DEFAULT_SETTINGS,
): boolean {
  return hand.some((c) => canCardStay(currentTotal, c, settings));
}

/**
 * Quand aucune carte ne permet de rester sous la limite : renvoie la carte qui
 * « dépasse le moins » (total résultant minimal). En cas d'égalité, première
 * carte rencontrée. Renvoie null si la main est vide.
 */
export function leastOvershootCard(
  hand: Card[],
  currentTotal: number,
  settings: GameSettings = DEFAULT_SETTINGS,
): Card | null {
  let best: Card | null = null;
  let bestTotal = Infinity;
  for (const c of hand) {
    const t = minTotalForCard(currentTotal, c, settings);
    if (t < bestTotal) {
      bestTotal = t;
      best = c;
    }
  }
  return best;
}

/**
 * Validité d'un coup donné (carte + choix d'As) pour un joueur.
 *
 * - Si le joueur possède au moins un coup légal, il DOIT rester ≤ maxTotal :
 *   la carte choisie est valide seulement si elle reste sous la limite.
 * - Si le joueur n'a AUCUN coup légal (bust forcé), il doit jouer la carte qui
 *   dépasse le moins : seule une carte au dépassement minimal est acceptée.
 */
export interface MoveValidation {
  valid: boolean;
  /** Le coup déclenche la perte de la manche (dépassement forcé). */
  bust: boolean;
  reason?: "OVER_LIMIT" | "NOT_LEAST_OVERSHOOT" | "ACE_CHOICE_REQUIRED";
}

export function validateMove(
  hand: Card[],
  currentTotal: number,
  card: Card,
  aceChoice: AceChoice | undefined,
  settings: GameSettings = DEFAULT_SETTINGS,
): MoveValidation {
  const forcedBust = !hasPlayableCard(hand, currentTotal, settings);

  if (!forcedBust) {
    // Un coup légal existe : l'As doit être tranché s'il peut rester.
    if (card.value === "A" && aceChoice === undefined) {
      return { valid: false, bust: false, reason: "ACE_CHOICE_REQUIRED" };
    }
    const effect = applyCard(currentTotal, card, aceChoice, settings);
    if (!isWithinLimit(effect.total, settings)) {
      return { valid: false, bust: false, reason: "OVER_LIMIT" };
    }
    return { valid: true, bust: false };
  }

  // Bust forcé : la carte doit être au dépassement minimal.
  const minForChosen = minTotalForCard(currentTotal, card, settings);
  let globalMin = Infinity;
  for (const c of hand) {
    globalMin = Math.min(globalMin, minTotalForCard(currentTotal, c, settings));
  }
  if (minForChosen !== globalMin) {
    return { valid: false, bust: true, reason: "NOT_LEAST_OVERSHOOT" };
  }
  return { valid: true, bust: true };
}

/** Nature d'un palier de gorgées déclenché par un total. */
export type PalierKind = "none" | "palier" | "near_end";

export interface PalierResult {
  kind: PalierKind;
  /** Total ayant déclenché le palier (0 si aucun). */
  total: number;
  /** Gorgées à distribuer, multiplicateur global déjà appliqué. */
  sips: number;
}

/**
 * Détermine si un total déclenche un palier de gorgées — fonction PURE.
 *
 * - total === maxTotal → "near_end" ("presque la fin") : `nearEndSips` gorgées
 *   (0 par défaut, mais bannière spéciale côté UI).
 * - total multiple de `sipStep` dans [sipRange] → "palier" : `total / sipStep`
 *   gorgées (ex : 80 → 8 gorgées).
 * - sinon → "none".
 *
 * Un dépassement (> maxTotal) ne déclenche JAMAIS de palier : il est géré par la
 * pénalité de manche perdue. Le `sipsMultiplier` est appliqué au résultat.
 */
export function computePalier(
  total: number,
  settings: GameSettings = DEFAULT_SETTINGS,
): PalierResult {
  const mult = settings.sipsMultiplier;

  if (total > settings.maxTotal) return { kind: "none", total: 0, sips: 0 };

  if (total === settings.maxTotal) {
    return { kind: "near_end", total, sips: settings.nearEndSips * mult };
  }

  const [lo, hi] = settings.sipRange;
  if (
    settings.sipStep > 0 &&
    total >= lo &&
    total <= hi &&
    total % settings.sipStep === 0
  ) {
    return { kind: "palier", total, sips: (total / settings.sipStep) * mult };
  }

  return { kind: "none", total: 0, sips: 0 };
}

/**
 * Joueur suivant selon le sens. `players` est ordonné par position croissante.
 * 'cw' = position croissante, 'ccw' = décroissante (avec bouclage).
 */
export function nextPlayerId<T extends { id: string }>(
  players: T[],
  currentId: string,
  direction: GameDirection,
): string {
  if (players.length === 0) return currentId;
  const idx = players.findIndex((p) => p.id === currentId);
  if (idx === -1) return players[0].id;
  const step = direction === "cw" ? 1 : -1;
  const nextIdx = (idx + step + players.length) % players.length;
  return players[nextIdx].id;
}
