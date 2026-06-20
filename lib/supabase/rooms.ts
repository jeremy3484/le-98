import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameStatus } from "@/types/database";

/** Résultat des RPC create_room / join_room. */
export interface RoomRef {
  id: string;
  code: string;
  status: GameStatus;
}

/** Messages d'erreur renvoyés par join_room (cf. migration 0003). */
const JOIN_ERRORS: Record<string, string> = {
  ROOM_NOT_FOUND: "Aucune partie ne correspond à ce code.",
  ROOM_NOT_JOINABLE: "Cette partie a déjà commencé.",
  ROOM_FULL: "Cette partie est complète.",
};

function mapError(message: string): string {
  for (const key of Object.keys(JOIN_ERRORS)) {
    if (message.includes(key)) return JOIN_ERRORS[key];
  }
  return message;
}

/** Crée une nouvelle room (l'appelant devient hôte) via le RPC SECURITY DEFINER. */
export async function createRoom(
  supabase: SupabaseClient,
  settings: Record<string, unknown> = {},
): Promise<RoomRef> {
  const { data, error } = await supabase
    .rpc("create_room", { p_settings: settings })
    .single();

  if (error) throw new Error(mapError(error.message));
  return data as RoomRef;
}

/** Rejoint une room par son code (insensible à la casse). */
export async function joinRoom(
  supabase: SupabaseClient,
  code: string,
): Promise<RoomRef> {
  const { data, error } = await supabase
    .rpc("join_room", { p_code: code.trim() })
    .single();

  if (error) throw new Error(mapError(error.message));
  return data as RoomRef;
}

/**
 * Démarre la partie en appelant l'Edge Function start-game (mélange + distribution
 * côté serveur). Seul l'hôte est autorisé (vérifié côté fonction).
 */
export async function startGame(
  supabase: SupabaseClient,
  roomId: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("start-game", {
    body: { roomId },
  });

  if (error) {
    // L'Edge Function renvoie { error } avec un statut non-2xx.
    const ctx = (error as { context?: { body?: string } }).context;
    let serverMsg = "";
    if (ctx?.body) {
      try {
        serverMsg = (JSON.parse(ctx.body) as { error?: string }).error ?? "";
      } catch {
        /* ignore */
      }
    }
    throw new Error(serverMsg || error.message || "Échec du lancement.");
  }
  if (data?.error) throw new Error(data.error);
}

/**
 * Met à jour `room.settings` en fusionnant les nouvelles clés avec l'existant
 * (préserve les réglages non modifiés). Réservé à l'hôte avant le lancement ;
 * l'autorisation est garantie par le RLS de `game_rooms`.
 */
export async function updateRoomSettings(
  supabase: SupabaseClient,
  roomId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data: current, error: readErr } = await supabase
    .from("game_rooms")
    .select("settings")
    .eq("id", roomId)
    .single();
  if (readErr) throw new Error(readErr.message);

  const merged = {
    ...((current?.settings ?? {}) as Record<string, unknown>),
    ...patch,
  };

  const { error } = await supabase
    .from("game_rooms")
    .update({ settings: merged })
    .eq("id", roomId);
  if (error) throw new Error(error.message);
}

/** Lien direct de rejoint partageable (utilisé pour le QR code). */
export function buildJoinUrl(code: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/join/${code}`;
}
