import { describe, it, expect } from "vitest";
import type { Card } from "@/types/database";
import { resolveJoker, type ResolveJokerInput } from "./jokers";
import type { EnginePlayer } from "./engine";

const card = (value: string, suit: string | null = "spades"): Card => ({
  id: `${value}-${suit}`,
  value,
  suit,
});

const JOKER: Card = { id: "JOKER-1", value: "JOKER", suit: null };

/**
 * 3 joueurs ordonnés. Le poseur (p1) a le Joker + 3 cartes (main pleine = 4).
 * Après avoir joué le Joker il repioche 1 carte depuis le sommet de la pile.
 */
function baseInput(power: string, overrides: Partial<ResolveJokerInput> = {}): ResolveJokerInput {
  const players: EnginePlayer[] = [
    { id: "p1", profile_id: "u1", hand: [JOKER, card("2"), card("3"), card("4")] },
    { id: "p2", profile_id: "u2", hand: [card("5"), card("6"), card("7"), card("8")] },
    { id: "p3", profile_id: "u3", hand: [card("9"), card("10"), card("J"), card("Q")] },
  ];
  return {
    power,
    players,
    poserId: "p1",
    total: 40,
    direction: "cw",
    jokerCard: JOKER,
    pile: [card("K", "hearts"), card("2", "hearts"), card("3", "hearts")],
    discard: [card("4", "hearts")],
    ...overrides,
  };
}

describe("resolveJoker — mécanique commune", () => {
  it("retire le Joker de la main du poseur et le recomplète à handSize (4)", () => {
    const r = resolveJoker(baseInput("collective_drink"));
    expect(r.handsById.p1).toHaveLength(4);
    expect(r.handsById.p1.some((c) => c.value === "JOKER")).toBe(false);
    // Le Joker part à la défausse.
    expect(r.discard.some((c) => c.id === "JOKER-1")).toBe(true);
  });

  it("passe la main au joueur suivant selon le sens courant (cw → p2)", () => {
    const r = resolveJoker(baseInput("collective_drink"));
    expect(r.nextPlayerId).toBe("p2");
  });
});

describe("resolveJoker — 1) collective_drink", () => {
  it("n'altère ni le total ni le sens (effet visuel)", () => {
    const r = resolveJoker(baseInput("collective_drink"));
    expect(r.total).toBe(40);
    expect(r.direction).toBe("cw");
    expect(r.positionsChanged).toBe(false);
  });
});

describe("resolveJoker — 2) swap_hands", () => {
  it("fait tourner les mains d'un cran (chacun reçoit la main du précédent)", () => {
    const r = resolveJoker(baseInput("swap_hands"));
    // p1 reçoit la main de p3, p2 reçoit la main (repiochée) de p1, p3 celle de p2.
    expect(r.handsById.p1.map((c) => c.value)).toEqual(["9", "10", "J", "Q"]);
    expect(r.handsById.p3.map((c) => c.value)).toEqual(["5", "6", "7", "8"]);
    // p2 reçoit la main de p1 après repioche (2,3,4 + carte piochée K).
    expect(r.handsById.p2.map((c) => c.value)).toEqual(["2", "3", "4", "K"]);
  });
});

describe("resolveJoker — 3) free_distribution", () => {
  it("n'altère pas l'état de jeu (distribution gérée côté client)", () => {
    const r = resolveJoker(baseInput("free_distribution"));
    expect(r.total).toBe(40);
    expect(r.direction).toBe("cw");
    expect(r.handsById.p2.map((c) => c.value)).toEqual(["5", "6", "7", "8"]);
  });
});

describe("resolveJoker — 4) reverse", () => {
  it("inverse le sens et désigne le joueur suivant en conséquence (ccw → p3)", () => {
    const r = resolveJoker(baseInput("reverse"));
    expect(r.direction).toBe("ccw");
    expect(r.nextPlayerId).toBe("p3");
  });

  it("ccw → cw", () => {
    const r = resolveJoker(baseInput("reverse", { direction: "ccw" }));
    expect(r.direction).toBe("cw");
    expect(r.nextPlayerId).toBe("p2");
  });
});

describe("resolveJoker — 5) reset_zero", () => {
  it("remet le total à zéro", () => {
    const r = resolveJoker(baseInput("reset_zero", { total: 88 }));
    expect(r.total).toBe(0);
  });
});

describe("resolveJoker — 6) double_or_nothing", () => {
  it("arme le drapeau nextCardDoubled sans toucher au total", () => {
    const r = resolveJoker(baseInput("double_or_nothing"));
    expect(r.flags.nextCardDoubled).toBe(true);
    expect(r.total).toBe(40);
  });
});

describe("resolveJoker — 7) mirror", () => {
  it("impose la valeur de la carte précédente au joueur suivant", () => {
    const r = resolveJoker(
      baseInput("mirror", { prevTopValue: "7" }),
    );
    expect(r.flags.mirror).toEqual({ value: "7", playerId: "p2", penalty: 2 });
  });

  it("respecte une pénalité personnalisée", () => {
    const r = resolveJoker(
      baseInput("mirror", { prevTopValue: "K", flags: { mirrorPenaltySips: 4 } }),
    );
    expect(r.flags.mirror).toEqual({ value: "K", playerId: "p2", penalty: 4 });
  });

  it("ne s'arme pas si la carte précédente est un Joker", () => {
    const r = resolveJoker(baseInput("mirror", { prevTopValue: "JOKER" }));
    expect(r.flags.mirror).toBeUndefined();
  });
});

describe("resolveJoker — 8) ghost_draw", () => {
  it("fait piocher 1 carte à tous SAUF le poseur", () => {
    const r = resolveJoker(baseInput("ghost_draw"));
    // Le poseur reste à 4 (repioche normale du Joker uniquement).
    expect(r.handsById.p1).toHaveLength(4);
    // Les autres passent à 5.
    expect(r.handsById.p2).toHaveLength(5);
    expect(r.handsById.p3).toHaveLength(5);
  });
});

describe("resolveJoker — 9) immunity", () => {
  it("ajoute le poseur à la liste des joueurs immunisés", () => {
    const r = resolveJoker(baseInput("immunity"));
    expect(r.flags.immunePlayers).toContain("p1");
  });

  it("n'ajoute pas deux fois le même joueur", () => {
    const r = resolveJoker(baseInput("immunity", { flags: { immunePlayers: ["p1"] } }));
    expect(r.flags.immunePlayers).toEqual(["p1"]);
  });
});

describe("resolveJoker — 10) musical_chairs", () => {
  it("permute l'ordre des joueurs et signale le changement de positions", () => {
    // Shuffle déterministe : inverse l'ordre.
    const reverse = <T,>(items: T[]): T[] => [...items].reverse();
    const r = resolveJoker(baseInput("musical_chairs", { shuffle: reverse }));
    expect(r.positionsChanged).toBe(true);
    expect(r.order.map((p) => p.id)).toEqual(["p3", "p2", "p1"]);
    // Après inversion, le suivant de p1 (sens cw) dans [p3,p2,p1] boucle sur p3.
    expect(r.nextPlayerId).toBe("p3");
  });
});
