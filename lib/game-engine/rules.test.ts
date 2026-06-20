import { describe, it, expect } from "vitest";
import type { Card } from "@/types/database";
import {
  applyCard,
  canCardStay,
  computePalier,
  hasPlayableCard,
  leastOvershootCard,
  nextPlayerId,
  playableCards,
  validateMove,
} from "./rules";
import { DEFAULT_SETTINGS } from "./settings";

const card = (value: string, suit: string | null = "spades"): Card => ({
  id: `${value}-${suit}`,
  value,
  suit,
});

describe("applyCard", () => {
  it("ajoute la valeur faciale pour 2..10", () => {
    expect(applyCard(10, card("7")).total).toBe(17);
    expect(applyCard(0, card("2")).total).toBe(2);
    expect(applyCard(50, card("10")).total).toBe(60);
  });

  it("As : +1 ou +11 selon le choix", () => {
    expect(applyCard(90, card("A"), 1).total).toBe(91);
    expect(applyCard(80, card("A"), 11).total).toBe(91);
  });

  it("As : défaut à 11 si aucun choix", () => {
    expect(applyCard(80, card("A")).total).toBe(91);
  });

  it("Valet : -10 sans descendre sous 0", () => {
    expect(applyCard(50, card("J")).total).toBe(40);
    expect(applyCard(5, card("J")).total).toBe(0);
  });

  it("Dame : +0 et inverse le sens", () => {
    const e = applyCard(42, card("Q"));
    expect(e.total).toBe(42);
    expect(e.reverses).toBe(true);
  });

  it("Roi : fixe le total à 70", () => {
    expect(applyCard(10, card("K")).total).toBe(70);
    expect(applyCard(96, card("K")).total).toBe(70);
  });
});

describe("canCardStay / playableCards", () => {
  it("une carte qui ferait dépasser 98 ne peut pas rester", () => {
    expect(canCardStay(95, card("7"))).toBe(false);
    expect(canCardStay(95, card("3"))).toBe(true); // 98 pile OK
  });

  it("As reste jouable si +1 garde sous la limite", () => {
    expect(canCardStay(98, card("A"))).toBe(false); // 99 > 98 même avec +1
    expect(canCardStay(97, card("A"))).toBe(true); // 98 avec +1
  });

  it("Valet/Dame/Roi restent toujours jouables", () => {
    expect(canCardStay(98, card("J"))).toBe(true);
    expect(canCardStay(98, card("Q"))).toBe(true);
    expect(canCardStay(98, card("K"))).toBe(true);
  });

  it("playableCards filtre la main", () => {
    const hand = [card("9"), card("3"), card("K")];
    expect(playableCards(hand, 95).map((c) => c.value)).toEqual(["3", "K"]);
  });
});

describe("hasPlayableCard / leastOvershootCard", () => {
  it("détecte l'absence de coup légal", () => {
    const hand = [card("9"), card("8"), card("7")];
    expect(hasPlayableCard(hand, 95)).toBe(false);
  });

  it("renvoie la carte au dépassement minimal", () => {
    const hand = [card("9"), card("8"), card("7")];
    // total 95 → 7 donne 102, 8 donne 103, 9 donne 104 → le 7 dépasse le moins
    expect(leastOvershootCard(hand, 95)?.value).toBe("7");
  });
});

describe("validateMove", () => {
  it("refuse une carte qui dépasse quand un coup légal existe", () => {
    const hand = [card("9"), card("3")];
    const v = validateMove(hand, 95, card("9"), undefined);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe("OVER_LIMIT");
  });

  it("exige le choix de l'As quand il peut rester", () => {
    const hand = [card("A"), card("3")];
    const v = validateMove(hand, 50, card("A"), undefined);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe("ACE_CHOICE_REQUIRED");
  });

  it("accepte un coup légal", () => {
    const hand = [card("9"), card("3")];
    const v = validateMove(hand, 95, card("3"), undefined);
    expect(v.valid).toBe(true);
    expect(v.bust).toBe(false);
  });

  it("bust forcé : accepte seulement la carte au dépassement minimal", () => {
    const hand = [card("9"), card("8"), card("7")];
    const ok = validateMove(hand, 95, card("7"), undefined);
    expect(ok).toEqual({ valid: true, bust: true });

    const ko = validateMove(hand, 95, card("9"), undefined);
    expect(ko.valid).toBe(false);
    expect(ko.bust).toBe(true);
    expect(ko.reason).toBe("NOT_LEAST_OVERSHOOT");
  });
});

describe("nextPlayerId", () => {
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("sens horaire = position croissante avec bouclage", () => {
    expect(nextPlayerId(players, "a", "cw")).toBe("b");
    expect(nextPlayerId(players, "c", "cw")).toBe("a");
  });

  it("sens anti-horaire = position décroissante avec bouclage", () => {
    expect(nextPlayerId(players, "a", "ccw")).toBe("c");
    expect(nextPlayerId(players, "b", "ccw")).toBe("a");
  });
});

describe("settings par défaut", () => {
  it("limite à 98, roi à 70", () => {
    expect(DEFAULT_SETTINGS.maxTotal).toBe(98);
    expect(DEFAULT_SETTINGS.kingValue).toBe(70);
  });
});

describe("computePalier", () => {
  it("chaque multiple exact de 10 entre 10 et 90 déclenche total/10 gorgées", () => {
    expect(computePalier(10)).toEqual({ kind: "palier", total: 10, sips: 1 });
    expect(computePalier(50)).toEqual({ kind: "palier", total: 50, sips: 5 });
    expect(computePalier(80)).toEqual({ kind: "palier", total: 80, sips: 8 });
    expect(computePalier(90)).toEqual({ kind: "palier", total: 90, sips: 9 });
  });

  it("un total non multiple de 10 ne déclenche rien", () => {
    expect(computePalier(55).kind).toBe("none");
    expect(computePalier(42).kind).toBe("none");
    expect(computePalier(0).kind).toBe("none"); // 0 hors borne basse
  });

  it("98 pile = événement spécial near_end (0 gorgée par défaut)", () => {
    expect(computePalier(98)).toEqual({ kind: "near_end", total: 98, sips: 0 });
  });

  it("un dépassement de 98 ne déclenche aucun palier", () => {
    expect(computePalier(100).kind).toBe("none");
    expect(computePalier(110).kind).toBe("none");
  });

  it("sipsMultiplier double les gorgées", () => {
    const s = { ...DEFAULT_SETTINGS, sipsMultiplier: 2 };
    expect(computePalier(80, s).sips).toBe(16);
    expect(computePalier(30, s).sips).toBe(6);
  });

  it("near_end applique aussi le multiplicateur sur nearEndSips", () => {
    const s = { ...DEFAULT_SETTINGS, nearEndSips: 3, sipsMultiplier: 2 };
    expect(computePalier(98, s)).toEqual({ kind: "near_end", total: 98, sips: 6 });
  });
});
