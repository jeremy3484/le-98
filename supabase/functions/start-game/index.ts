// =============================================================================
// Edge Function: start-game
// Mélange et distribution côté serveur (non manipulable par le client).
//
// - Vérifie le JWT de l'appelant et qu'il est bien l'hôte de la room.
// - Vérifie que la room est en attente avec au moins 2 joueurs actifs.
// - Construit un deck (52 cartes + Jokers si configurés), le mélange
//   (Fisher-Yates avec crypto.getRandomValues), distribue 4 cartes/joueur.
// - Écrit game_deck, met à jour game_players.hand, passe la room en 'playing'
//   (current_total=0, direction='cw', current_player_id = hôte par défaut ou
//   joueur aléatoire selon settings.random_first_player).
// - Journalise un game_event 'game_started'.
//
// Utilise la clé service_role (jamais exposée au client) pour bypasser le RLS.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CARDS_PER_PLAYER = 4;
const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
const VALUES = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
] as const;

interface Card {
  id: string;
  value: string;
  suit: string | null;
  power?: string;
  description?: string | null;
}

/** Construit un deck standard 52 cartes + les cartes Joker fournies. */
function buildDeck(jokers: Card[]): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ id: `${value}-${suit}`, value, suit });
    }
  }
  for (const joker of jokers) deck.push(joker);
  return deck;
}

/** Mélange Fisher-Yates avec source d'aléa cryptographique. */
function secureShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const rand = new Uint32Array(1);
    crypto.getRandomValues(rand);
    const j = rand[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // 1) Identifier l'appelant via son JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // 2) Lire le payload.
  let roomId: string | undefined;
  try {
    const body = await req.json();
    roomId = body?.roomId;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  if (!roomId) {
    return jsonResponse({ error: "roomId requis" }, 400);
  }

  // 3) Client admin (service_role) : bypass RLS pour les écritures atomiques.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: room, error: roomError } = await admin
    .from("game_rooms")
    .select("id, host_id, status, settings")
    .eq("id", roomId)
    .single();

  if (roomError || !room) {
    return jsonResponse({ error: "Room introuvable" }, 404);
  }
  if (room.host_id !== user.id) {
    return jsonResponse({ error: "Seul l'hôte peut lancer la partie" }, 403);
  }
  if (room.status !== "waiting") {
    return jsonResponse({ error: "La partie a déjà commencé" }, 409);
  }

  // 4) Joueurs actifs, ordonnés par position.
  const { data: players, error: playersError } = await admin
    .from("game_players")
    .select("id, profile_id, position")
    .eq("room_id", roomId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (playersError || !players || players.length < 2) {
    return jsonResponse(
      { error: "Il faut au moins 2 joueurs pour lancer" },
      409,
    );
  }

  // 5) Cartes Joker (Phase 6) : embarquées seulement si activées par l'hôte.
  const settingsRaw = (room.settings ?? {}) as Record<string, unknown>;
  const jokersEnabled = settingsRaw.jokersEnabled === true;
  let jokerCards: Card[] = [];
  if (jokersEnabled) {
    const { data: jokerRows } = await admin
      .from("joker_configs")
      .select("id, power_type, description")
      .eq("room_id", roomId);
    jokerCards = ((jokerRows ?? []) as {
      power_type: string;
      description: string | null;
    }[]).map((j, i) => ({
      id: `JOKER-${i + 1}`,
      value: "JOKER",
      suit: null,
      power: j.power_type,
      description: j.description ?? null,
    }));
  }
  const jokerCount = jokerCards.length;

  // 6) Construire, mélanger, distribuer.
  const deck = secureShuffle(buildDeck(jokerCards));
  const needed = players.length * CARDS_PER_PLAYER;
  if (deck.length < needed) {
    return jsonResponse({ error: "Pas assez de cartes" }, 409);
  }

  const hands: Card[][] = players.map(() => []);
  let cursor = 0;
  for (let round = 0; round < CARDS_PER_PLAYER; round++) {
    for (let p = 0; p < players.length; p++) {
      hands[p].push(deck[cursor++]);
    }
  }
  const remaining = deck.slice(cursor);

  // 7) Premier joueur : hôte par défaut, ou aléatoire si configuré.
  const settings = (room.settings ?? {}) as Record<string, unknown>;
  let firstPlayer = players.find((p) => p.profile_id === room.host_id) ??
    players[0];
  if (settings.random_first_player === true) {
    const rand = new Uint32Array(1);
    crypto.getRandomValues(rand);
    firstPlayer = players[rand[0] % players.length];
  }

  // Sens de jeu initial : horaire par défaut, anti-horaire si configuré.
  const startDirection = settings.startDirection === "ccw" ? "ccw" : "cw";

  // 8) Écritures.
  for (let p = 0; p < players.length; p++) {
    const { error } = await admin
      .from("game_players")
      .update({ hand: hands[p] })
      .eq("id", players[p].id);
    if (error) {
      return jsonResponse({ error: "Échec de la distribution" }, 500);
    }
  }

  const { error: deckError } = await admin
    .from("game_deck")
    .upsert({
      room_id: roomId,
      remaining_cards: remaining,
      discard_pile: [],
    });
  if (deckError) {
    return jsonResponse({ error: "Échec d'écriture du deck" }, 500);
  }

  const { error: updateError } = await admin
    .from("game_rooms")
    .update({
      status: "playing",
      current_total: 0,
      direction: startDirection,
      current_player_id: firstPlayer.id,
    })
    .eq("id", roomId);
  if (updateError) {
    return jsonResponse({ error: "Échec du démarrage" }, 500);
  }

  await admin.from("game_events").insert({
    room_id: roomId,
    type: "game_started",
    payload: {
      first_player_id: firstPlayer.id,
      player_count: players.length,
      cards_per_player: CARDS_PER_PLAYER,
      joker_count: jokerCount ?? 0,
    },
  });

  return jsonResponse({
    ok: true,
    roomId,
    first_player_id: firstPlayer.id,
  });
});
