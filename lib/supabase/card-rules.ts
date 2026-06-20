import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardRule, Json } from "@/types/database";

/**
 * Types d'action d'une règle personnalisée par carte.
 *  - sips_fixed : le joueur qui pose doit faire distribuer N gorgées.
 *  - cul_sec    : cul sec pour le joueur qui pose.
 *  - free_text  : texte libre affiché à tous (gage, défi…).
 */
export type CardRuleActionType = "sips_fixed" | "cul_sec" | "free_text";

/** Valeur ciblée par une règle : une carte précise ou un groupe. */
export type CardRuleTarget =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"
  | "ALL" | "EVEN" | "ODD";

/** Libellés FR des cibles, pour l'affichage dans l'UI. */
export const CARD_TARGET_LABELS: Record<CardRuleTarget, string> = {
  A: "As", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7",
  "8": "8", "9": "9", "10": "10", J: "Valet", Q: "Dame", K: "Roi",
  ALL: "Toutes les cartes",
  EVEN: "Cartes paires (2,4,6,8,10)",
  ODD: "Cartes impaires (3,5,7,9)",
};

export const CARD_TARGET_OPTIONS: CardRuleTarget[] = [
  "ALL", "EVEN", "ODD",
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
];

export const ACTION_LABELS: Record<CardRuleActionType, string> = {
  sips_fixed: "Gorgées fixes à donner",
  cul_sec: "Cul sec",
  free_text: "Texte libre affiché à tous",
};

/** Vrai si une carte posée déclenche une règle ciblant `target`. */
export function ruleMatchesCard(cardValue: string, target: string): boolean {
  if (target === "ALL") return true;
  if (target === "EVEN" || target === "ODD") {
    const n = Number(cardValue);
    if (!Number.isInteger(n)) return false;
    return target === "EVEN" ? n % 2 === 0 : n % 2 === 1;
  }
  return target === cardValue;
}

/** Construit un libellé par défaut lisible pour une règle. */
export function defaultRuleLabel(
  target: CardRuleTarget,
  actionType: CardRuleActionType,
  params: { amount?: number; text?: string },
): string {
  const who = CARD_TARGET_LABELS[target];
  switch (actionType) {
    case "sips_fixed":
      return `${who} → ${params.amount ?? 1} gorgée${(params.amount ?? 1) > 1 ? "s" : ""} à distribuer`;
    case "cul_sec":
      return `${who} → Cul sec !`;
    case "free_text":
      return params.text?.trim() || `${who} → règle spéciale`;
  }
}

/** Liste les règles personnalisées d'une room. */
export async function listCardRules(
  supabase: SupabaseClient,
  roomId: string,
): Promise<CardRule[]> {
  const { data } = await supabase
    .from("card_rules")
    .select("id, room_id, card_value, label, action_type, action_params")
    .eq("room_id", roomId);
  return (data ?? []) as CardRule[];
}

/** Crée une règle personnalisée (host uniquement, vérifié par RLS). */
export async function createCardRule(
  supabase: SupabaseClient,
  roomId: string,
  target: CardRuleTarget,
  actionType: CardRuleActionType,
  params: { amount?: number; text?: string },
  label?: string,
): Promise<void> {
  const actionParams: Record<string, Json> = {};
  if (actionType === "sips_fixed") actionParams.amount = Math.max(1, params.amount ?? 1);
  if (actionType === "free_text") actionParams.text = params.text?.trim() ?? "";

  const { error } = await supabase.from("card_rules").insert({
    room_id: roomId,
    card_value: target,
    label: label?.trim() || defaultRuleLabel(target, actionType, params),
    action_type: actionType,
    action_params: actionParams,
  });
  if (error) throw new Error(error.message);
}

/** Supprime une règle personnalisée par son id (host uniquement). */
export async function deleteCardRule(
  supabase: SupabaseClient,
  ruleId: string,
): Promise<void> {
  const { error } = await supabase.from("card_rules").delete().eq("id", ruleId);
  if (error) throw new Error(error.message);
}
