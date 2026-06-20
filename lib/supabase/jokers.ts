import type { SupabaseClient } from "@supabase/supabase-js";
import type { JokerConfig } from "@/types/database";

/** Les 10 pouvoirs de carte Joker disponibles. */
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

export interface JokerPowerDef {
  power: JokerPower;
  /** Libellé court affiché dans le catalogue. */
  label: string;
  /** Emoji / icône représentant le pouvoir. */
  icon: string;
  /** Description claire de l'effet (réutilisée pour l'info-bulle en jeu). */
  description: string;
}

/** Nombre maximal de cartes Joker qu'un hôte peut ajouter au paquet. */
export const MAX_JOKERS = 4;

/** Catalogue ordonné des pouvoirs (source de vérité côté client). */
export const JOKER_CATALOG: JokerPowerDef[] = [
  {
    power: "collective_drink",
    label: "Cul sec collectif",
    icon: "🍻",
    description: "Tout le monde finit son verre !",
  },
  {
    power: "swap_hands",
    label: "Échange des mains",
    icon: "🔄",
    description: "Les mains de tous les joueurs tournent d'un cran.",
  },
  {
    power: "free_distribution",
    label: "Distribution libre",
    icon: "🎁",
    description: "Tu distribues 5 gorgées comme tu veux.",
  },
  {
    power: "reverse",
    label: "Inversion du sens",
    icon: "↩️",
    description: "Le sens du jeu s'inverse immédiatement.",
  },
  {
    power: "reset_zero",
    label: "Reset à zéro",
    icon: "0️⃣",
    description: "Le total repart à zéro.",
  },
  {
    power: "double_or_nothing",
    label: "Double ou rien",
    icon: "✖️2",
    description: "La prochaine carte compte double (valeur et gorgées).",
  },
  {
    power: "mirror",
    label: "Carte miroir",
    icon: "🪞",
    description:
      "Le joueur suivant doit rejouer la même valeur que la dernière carte, sinon il boit.",
  },
  {
    power: "ghost_draw",
    label: "Pioche fantôme",
    icon: "👻",
    description: "Tout le monde sauf toi pioche une carte supplémentaire.",
  },
  {
    power: "immunity",
    label: "Immunité",
    icon: "🛡️",
    description: "Tu ignores le prochain palier de gorgées qui te viserait.",
  },
  {
    power: "musical_chairs",
    label: "Chaise musicale",
    icon: "🪑",
    description: "L'ordre des joueurs est mélangé au hasard.",
  },
];

const BY_POWER = new Map<JokerPower, JokerPowerDef>(
  JOKER_CATALOG.map((d) => [d.power, d]),
);

/** Renvoie la définition d'un pouvoir (ou undefined si inconnu). */
export function jokerDef(power: string): JokerPowerDef | undefined {
  return BY_POWER.get(power as JokerPower);
}

/** Libellé d'un pouvoir, avec repli sur la valeur brute. */
export function jokerLabel(power: string): string {
  return BY_POWER.get(power as JokerPower)?.label ?? "Joker";
}

/** Description d'un pouvoir, avec repli générique. */
export function jokerDescription(power: string): string {
  return BY_POWER.get(power as JokerPower)?.description ?? "Pouvoir spécial.";
}

/** Liste les Jokers configurés pour une room (ordre d'insertion). */
export async function listJokerConfigs(
  supabase: SupabaseClient,
  roomId: string,
): Promise<JokerConfig[]> {
  const { data } = await supabase
    .from("joker_configs")
    .select("id, room_id, power_type, description")
    .eq("room_id", roomId);
  return (data ?? []) as JokerConfig[];
}

/**
 * Remplace l'intégralité de la sélection de Jokers d'une room par la liste
 * fournie (répétitions autorisées, limitée à MAX_JOKERS). Stratégie
 * « tout supprimer puis réinsérer » — réservé à l'hôte (vérifié par RLS).
 */
export async function setJokerConfigs(
  supabase: SupabaseClient,
  roomId: string,
  powers: JokerPower[],
): Promise<void> {
  const capped = powers.slice(0, MAX_JOKERS);

  const { error: delError } = await supabase
    .from("joker_configs")
    .delete()
    .eq("room_id", roomId);
  if (delError) throw new Error(delError.message);

  if (capped.length === 0) return;

  const rows = capped.map((power) => ({
    room_id: roomId,
    power_type: power,
    description: jokerDescription(power),
  }));
  const { error: insError } = await supabase.from("joker_configs").insert(rows);
  if (insError) throw new Error(insError.message);
}
