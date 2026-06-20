import type { Card } from "@/types/database";

/** Couleurs (enseignes) d'un jeu standard. */
export const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
export type Suit = (typeof SUITS)[number];

/** Valeurs ordonnées d'un jeu standard. */
export const VALUES = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
] as const;
export type CardValue = (typeof VALUES)[number] | "JOKER";

/** Une enseigne rouge ? (cœur / carreau) */
export function isRedSuit(suit: string | null | undefined): boolean {
  return suit === "hearts" || suit === "diamonds";
}

/** Valeur faciale numérique d'une carte 2..10 (0 sinon). */
export function faceValue(value: string): number {
  const n = Number(value);
  return Number.isInteger(n) ? n : 0;
}

/** Construit un jeu standard de 52 cartes (+ jokers optionnels). */
export function createStandardDeck(jokerCount = 0): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ id: `${value}-${suit}`, value, suit });
    }
  }
  for (let i = 0; i < jokerCount; i++) {
    deck.push({ id: `JOKER-${i + 1}`, value: "JOKER", suit: null });
  }
  return deck;
}

/** Libellé court d'affichage (le Joker a un symbole dédié). */
export function cardLabel(value: string): string {
  return value === "JOKER" ? "🃏" : value;
}
