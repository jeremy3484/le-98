import { describe, it, expect } from "vitest";
import {
  JOKER_CATALOG,
  MAX_JOKERS,
  jokerDef,
  jokerLabel,
  jokerDescription,
  type JokerPower,
} from "./jokers";

const EXPECTED_POWERS: JokerPower[] = [
  "collective_drink",
  "swap_hands",
  "free_distribution",
  "reverse",
  "reset_zero",
  "double_or_nothing",
  "mirror",
  "ghost_draw",
  "immunity",
  "musical_chairs",
];

describe("JOKER_CATALOG — catalogue des 10 pouvoirs", () => {
  it("contient exactement les 10 pouvoirs attendus", () => {
    expect(JOKER_CATALOG).toHaveLength(10);
    expect(JOKER_CATALOG.map((d) => d.power)).toEqual(EXPECTED_POWERS);
  });

  it("chaque pouvoir a un libellé, une icône et une description non vides", () => {
    for (const def of JOKER_CATALOG) {
      expect(def.label.trim().length).toBeGreaterThan(0);
      expect(def.icon.trim().length).toBeGreaterThan(0);
      expect(def.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("les pouvoirs sont uniques", () => {
    const set = new Set(JOKER_CATALOG.map((d) => d.power));
    expect(set.size).toBe(JOKER_CATALOG.length);
  });

  it("MAX_JOKERS limite le paquet à 4 cartes Joker", () => {
    expect(MAX_JOKERS).toBe(4);
  });
});

describe("helpers de lookup Joker", () => {
  it("jokerDef renvoie la définition d'un pouvoir connu", () => {
    expect(jokerDef("reverse")?.label).toBe("Inversion du sens");
  });

  it("jokerDef renvoie undefined pour un pouvoir inconnu", () => {
    expect(jokerDef("inconnu")).toBeUndefined();
  });

  it("jokerLabel / jokerDescription retombent sur un repli générique", () => {
    expect(jokerLabel("inconnu")).toBe("Joker");
    expect(jokerDescription("inconnu")).toBe("Pouvoir spécial.");
  });
});
