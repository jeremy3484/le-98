import type { SupabaseClient } from "@supabase/supabase-js";
import type { AceChoice } from "@/lib/game-engine";

export type PlayOutcome =
  | {
      ok: true;
      outcome: "played";
      new_total: number;
      direction: "cw" | "ccw";
      next_player_id: string;
      reverses: boolean;
    }
  | { ok: true; outcome: "round_lost"; loser_player_id: string };

/**
 * Joue une carte via l'Edge Function play-card (exécution serveur autoritaire).
 * Le total et l'état du jeu ne sont jamais modifiés côté client.
 */
export async function playCard(
  supabase: SupabaseClient,
  roomId: string,
  cardId: string,
  aceChoice?: AceChoice,
): Promise<PlayOutcome> {
  const { data, error } = await supabase.functions.invoke("play-card", {
    body: { roomId, cardId, aceChoice },
  });

  if (error) {
    const ctx = (error as { context?: { body?: string } }).context;
    let serverMsg = "";
    if (ctx?.body) {
      try {
        serverMsg = (JSON.parse(ctx.body) as { error?: string }).error ?? "";
      } catch {
        /* ignore */
      }
    }
    throw new Error(serverMsg || error.message || "Coup refusé.");
  }
  if (data?.error) throw new Error(data.error);
  return data as PlayOutcome;
}
