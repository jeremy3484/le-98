import { describe, it, expect } from "vitest";
import {
  ruleMatchesCard,
  defaultRuleLabel,
  CARD_TARGET_OPTIONS,
} from "./card-rules";

describe("ruleMatchesCard — règles personnalisées par carte", () => {
  it("ALL cible n'importe quelle carte", () => {
    expect(ruleMatchesCard("7", "ALL")).toBe(true);
    expect(ruleMatchesCard("K", "ALL")).toBe(true);
    expect(ruleMatchesCard("JOKER", "ALL")).toBe(true);
  });

  it("EVEN ne cible que les cartes numériques paires", () => {
    expect(ruleMatchesCard("2", "EVEN")).toBe(true);
    expect(ruleMatchesCard("10", "EVEN")).toBe(true);
    expect(ruleMatchesCard("3", "EVEN")).toBe(false);
    expect(ruleMatchesCard("K", "EVEN")).toBe(false); // figure → non numérique
  });

  it("ODD ne cible que les cartes numériques impaires", () => {
    expect(ruleMatchesCard("3", "ODD")).toBe(true);
    expect(ruleMatchesCard("9", "ODD")).toBe(true);
    expect(ruleMatchesCard("4", "ODD")).toBe(false);
    expect(ruleMatchesCard("A", "ODD")).toBe(false); // non numérique
  });

  it("une valeur précise ne matche que cette valeur", () => {
    expect(ruleMatchesCard("Q", "Q")).toBe(true);
    expect(ruleMatchesCard("Q", "K")).toBe(false);
  });
});

describe("defaultRuleLabel", () => {
  it("sips_fixed accorde le pluriel des gorgées", () => {
    expect(defaultRuleLabel("7", "sips_fixed", { amount: 1 })).toBe(
      "7 → 1 gorgée à distribuer",
    );
    expect(defaultRuleLabel("7", "sips_fixed", { amount: 3 })).toBe(
      "7 → 3 gorgées à distribuer",
    );
  });

  it("cul_sec produit un libellé dédié", () => {
    expect(defaultRuleLabel("K", "cul_sec", {})).toBe("Roi → Cul sec !");
  });

  it("free_text reprend le texte saisi, sinon un repli", () => {
    expect(defaultRuleLabel("A", "free_text", { text: "Invente une règle" })).toBe(
      "Invente une règle",
    );
    expect(defaultRuleLabel("A", "free_text", { text: "  " })).toBe(
      "As → règle spéciale",
    );
  });
});

describe("CARD_TARGET_OPTIONS", () => {
  it("propose les groupes puis les 13 valeurs (16 cibles)", () => {
    expect(CARD_TARGET_OPTIONS).toHaveLength(16);
    expect(CARD_TARGET_OPTIONS.slice(0, 3)).toEqual(["ALL", "EVEN", "ODD"]);
  });
});
