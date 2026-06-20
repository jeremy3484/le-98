import { describe, it, expect } from "vitest";
import type { Card } from "@/types/database";
import { applyCard, canCardStay, computePalier } from "./rules";
import { resolveSettings, DEFAULT_SETTINGS, type GameSettings } from "./settings";

const card = (value: string): Card => ({ id: `${value}-x`, value, suit: "spades" });

describe("resolveSettings — règles personnalisées", () => {
  it("retombe sur les défauts pour un objet vide ou null", () => {
    expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("surcharge proprement les valeurs fournies", () => {
    const s = resolveSettings({
      maxTotal: 100,
      kingValue: 50,
      jackDelta: -5,
      sipStep: 5,
      sipRange: [5, 95],
      sipsMultiplier: 3,
      aceValues: [1, 14],
      firstPlayerAfterLoss: "host",
    });
    expect(s.maxTotal).toBe(100);
    expect(s.kingValue).toBe(50);
    expect(s.jackDelta).toBe(-5);
    expect(s.sipStep).toBe(5);
    expect(s.sipRange).toEqual([5, 95]);
    expect(s.sipsMultiplier).toBe(3);
    expect(s.aceValues).toEqual([1, 14]);
    expect(s.firstPlayerAfterLoss).toBe("host");
  });

  it("ignore les valeurs invalides (types incorrects)", () => {
    const s = resolveSettings({ maxTotal: "beaucoup", kingValue: null });
    expect(s.maxTotal).toBe(DEFAULT_SETTINGS.maxTotal);
    expect(s.kingValue).toBe(DEFAULT_SETTINGS.kingValue);
  });
});

describe("applyCard — sous règles personnalisées", () => {
  const custom: GameSettings = {
    ...DEFAULT_SETTINGS,
    maxTotal: 100,
    kingValue: 50,
    jackDelta: -5,
  };

  it("le Roi fixe le total à kingValue personnalisé (50)", () => {
    expect(applyCard(10, card("K"), undefined, custom).total).toBe(50);
    expect(applyCard(99, card("K"), undefined, custom).total).toBe(50);
  });

  it("le Valet applique jackDelta personnalisé (-5) avec plancher 0", () => {
    expect(applyCard(20, card("J"), undefined, custom).total).toBe(15);
    expect(applyCard(3, card("J"), undefined, custom).total).toBe(0);
  });

  it("le plafond personnalisé (100) autorise des totaux refusés à 98", () => {
    expect(canCardStay(95, card("5"), custom)).toBe(true); // 100 pile OK
    expect(canCardStay(95, card("5"), DEFAULT_SETTINGS)).toBe(false); // 100 > 98
  });
});

describe("computePalier — pas et bornes personnalisés", () => {
  const step5: GameSettings = {
    ...DEFAULT_SETTINGS,
    sipStep: 5,
    sipRange: [5, 95],
  };

  it("chaque multiple de 5 déclenche total/5 gorgées", () => {
    expect(computePalier(15, step5)).toEqual({ kind: "palier", total: 15, sips: 3 });
    expect(computePalier(95, step5)).toEqual({ kind: "palier", total: 95, sips: 19 });
  });

  it("un multiplicateur personnalisé s'applique aux gorgées", () => {
    const s = { ...step5, sipsMultiplier: 2 };
    expect(computePalier(15, s).sips).toBe(6);
  });
});

describe("computePalier — cas limites des paliers (défaut)", () => {
  it("72 ne déclenche AUCUN palier (non multiple de 10)", () => {
    expect(computePalier(72)).toEqual({ kind: "none", total: 0, sips: 0 });
  });

  it("50 déclenche 5 gorgées, 80 en déclenche 8", () => {
    expect(computePalier(50)).toEqual({ kind: "palier", total: 50, sips: 5 });
    expect(computePalier(80)).toEqual({ kind: "palier", total: 80, sips: 8 });
  });

  it("98 pile = near_end, > 98 = aucun palier", () => {
    expect(computePalier(98).kind).toBe("near_end");
    expect(computePalier(99).kind).toBe("none");
  });
});
