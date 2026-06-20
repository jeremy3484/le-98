import { describe, it, expect } from "vitest";
import type { Card } from "@/types/database";
import { drawCards, resolvePlay, type EnginePlayer } from "./engine";

const card = (value: string, suit: string | null = "spades"): Card => ({
  id: `${value}-${suit}`,
  value,
  suit,
});

function makePlayers(): EnginePlayer[] {
  return [
    { id: "p1", profile_id: "u1", hand: [card("5"), card("3"), card("9"), card("2")] },
    { id: "p2", profile_id: "u2", hand: [card("4"), card("6"), card("8"), card("7")] },
  ];
}

describe("drawCards", () => {
  it("pioche depuis le sommet de la pile", () => {
    const pile = [card("2"), card("3"), card("4")];
    const r = drawCards(pile, [], 2);
    expect(r.drawn.map((c) => c.value)).toEqual(["2", "3"]);
    expect(r.pile.map((c) => c.value)).toEqual(["4"]);
  });

  it("remélange la défausse (sauf le sommet) quand la pile est vide", () => {
    const discard = [card("9"), card("8"), card("7")]; // 7 = sommet conservé
    const r = drawCards([], discard, 1);
    // recyclable = [9, 8] (identité), tire le premier → 9
    expect(r.drawn.map((c) => c.value)).toEqual(["9"]);
    expect(r.discard.map((c) => c.value)).toEqual(["7"]);
  });

  it("s'arrête s'il n'y a plus rien à piocher", () => {
    const r = drawCards([], [card("7")], 3, undefined, card("7"));
    expect(r.drawn).toHaveLength(0);
  });
});

describe("resolvePlay — coup légal", () => {
  it("ajoute la carte, recomplète la main, passe au joueur suivant", () => {
    const players = makePlayers();
    const res = resolvePlay({
      players,
      currentPlayerId: "p1",
      total: 10,
      direction: "cw",
      card: card("5"),
      pile: [card("K", "hearts")],
      discard: [],
    });

    expect(res.ok).toBe(true);
    if (!res.ok || res.result.kind !== "played") throw new Error("attendu played");
    expect(res.result.total).toBe(15);
    expect(res.result.nextPlayerId).toBe("p2");
    // main : retire le 5, repioche le K → toujours 4 cartes
    expect(res.result.playerHand).toHaveLength(4);
    expect(res.result.playerHand.some((c) => c.value === "5")).toBe(false);
    expect(res.result.discard.map((c) => c.id)).toContain("5-spades");
  });

  it("Dame inverse le sens et choisit le joueur suivant en conséquence", () => {
    const players = makePlayers();
    const res = resolvePlay({
      players,
      currentPlayerId: "p1",
      total: 40,
      direction: "cw",
      card: card("Q"),
      pile: [card("2", "hearts")],
      discard: [],
    });
    if (!res.ok || res.result.kind !== "played") throw new Error("attendu played");
    expect(res.result.total).toBe(40);
    expect(res.result.direction).toBe("ccw");
    // ccw depuis p1 → p2 (bouclage)
    expect(res.result.nextPlayerId).toBe("p2");
  });

  it("Roi fixe le total à 70", () => {
    const players = makePlayers();
    const res = resolvePlay({
      players,
      currentPlayerId: "p1",
      total: 96,
      direction: "cw",
      card: card("K"),
      pile: [card("2", "hearts")],
      discard: [],
    });
    if (!res.ok || res.result.kind !== "played") throw new Error("attendu played");
    expect(res.result.total).toBe(70);
  });
});

describe("resolvePlay — validations & bust", () => {
  it("rejette une carte qui dépasse quand un coup légal existe", () => {
    const players: EnginePlayer[] = [
      { id: "p1", profile_id: "u1", hand: [card("9"), card("2")] },
      { id: "p2", profile_id: "u2", hand: [card("4")] },
    ];
    const res = resolvePlay({
      players,
      currentPlayerId: "p1",
      total: 95,
      direction: "cw",
      card: card("9"),
      pile: [],
      discard: [],
    });
    expect(res.ok).toBe(false);
  });

  it("dépassement forcé → manche perdue par le joueur courant", () => {
    const players: EnginePlayer[] = [
      { id: "p1", profile_id: "u1", hand: [card("9"), card("8")] },
      { id: "p2", profile_id: "u2", hand: [card("4")] },
    ];
    const res = resolvePlay({
      players,
      currentPlayerId: "p1",
      total: 95,
      direction: "cw",
      card: card("8"), // 8 dépasse moins que 9 ? 95+8=103, 95+9=104 → 8 minimal
      pile: [],
      discard: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok || res.result.kind !== "round_lost") {
      throw new Error("attendu round_lost");
    }
    expect(res.result.loserId).toBe("p1");
  });
});
