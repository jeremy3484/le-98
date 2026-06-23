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
    let serverMsg = "";
    const ctx = (error as { context?: unknown }).context;
    // supabase-js v2 : error.context est un objet Response dont le corps n'a pas
    // encore été lu. On le lit pour récupérer le vrai message du serveur.
    if (ctx instanceof Response) {
      try {
        const text = await ctx.clone().text();
        try {
          serverMsg = (JSON.parse(text) as { error?: string }).error ?? text;
        } catch {
          serverMsg = text;
        }
      } catch {
        /* ignore */
      }
    } else if (
      ctx &&
      typeof (ctx as { body?: unknown }).body === "string"
    ) {
      // Anciennes versions : context.body est déjà une chaîne JSON.
      try {
        serverMsg =
          (JSON.parse((ctx as { body: string }).body) as { error?: string })
            .error ?? "";
      } catch {
        /* ignore */
      }
    }
    throw new Error(serverMsg || error.message || "Coup refusé.");
  }
  if (data?.error) throw new Error(data.error);
  return data as PlayOutcome;
}
