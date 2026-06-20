import type { SupabaseClient } from "@supabase/supabase-js";

export interface SipDistribution {
  /** id du game_player qui reçoit les gorgées. */
  toPlayerId: string;
  amount: number;
}

/**
 * Enregistre une distribution de gorgées : une ligne par destinataire dans
 * `sip_assignments`, puis un `game_event` 'sips_assigned' diffusé en temps réel
 * à tous les joueurs (game_events est publié en Realtime).
 *
 * Les écritures passent par le RLS (l'appelant doit être membre de la room).
 */
export async function assignSips(
  supabase: SupabaseClient,
  roomId: string,
  fromPlayerId: string,
  distributions: SipDistribution[],
  reason: string | null = null,
): Promise<void> {
  const valid = distributions.filter((d) => d.amount > 0);
  if (valid.length === 0) return;

  const rows = valid.map((d) => ({
    room_id: roomId,
    from_player_id: fromPlayerId,
    to_player_id: d.toPlayerId,
    amount: d.amount,
    reason,
  }));

  const { error } = await supabase.from("sip_assignments").insert(rows);
  if (error) throw new Error(error.message);

  const total = valid.reduce((sum, d) => sum + d.amount, 0);
  await supabase.from("game_events").insert({
    room_id: roomId,
    type: "sips_assigned",
    payload: { from_player_id: fromPlayerId, distributions: valid, total },
  });
}

/**
 * Total cumulé de gorgées REÇUES par chaque joueur sur la session (toutes manches
 * confondues). Renvoie une map { game_player_id → total }.
 */
export async function fetchSipScores(
  supabase: SupabaseClient,
  roomId: string,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("sip_assignments")
    .select("to_player_id, amount")
    .eq("room_id", roomId);

  const scores: Record<string, number> = {};
  for (const row of (data ?? []) as { to_player_id: string | null; amount: number }[]) {
    if (!row.to_player_id) continue;
    scores[row.to_player_id] = (scores[row.to_player_id] ?? 0) + row.amount;
  }
  return scores;
}

/**
 * Nombre de manches perdues (explosions) par chaque joueur sur la session.
 * Agrège les events `round_lost` par `loser_profile_id`.
 * Renvoie une map { profile_id → nombre de manches perdues }.
 */
export async function fetchRoundsLost(
  supabase: SupabaseClient,
  roomId: string,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("game_events")
    .select("payload")
    .eq("room_id", roomId)
    .eq("type", "round_lost");

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { payload: { loser_profile_id?: string } | null }[]) {
    const loserId = row.payload?.loser_profile_id;
    if (!loserId) continue;
    counts[loserId] = (counts[loserId] ?? 0) + 1;
  }
  return counts;
}
