// =============================================================================
// Edge Function: play-card
// Exécution AUTORITAIRE d'un coup. Le client ne peut jamais modifier
// current_total directement : il appelle uniquement cette fonction.
//
// Reproduit la logique pure de lib/game-engine (inlinée ici car Deno ne résout
// pas les alias "@/..."). Toute écriture se fait avec la clé service_role.
//
// Règles (valeurs par défaut, surchargeables via room.settings) :
//  - 2..10 : + valeur faciale
//  - As    : +1 ou +11 (aceChoice)
//  - Valet : -10 (plancher 0)
//  - Dame  : +0 et inverse le sens
//  - Roi   : total = 70
//  - Dépassement de 98 interdit s'il existe un coup légal ; sinon "moins de
//    dépassement" → manche perdue, pénalité + redistribution.
//  - Après un coup valide : repioche jusqu'à 4 cartes (remélange si pioche vide).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Card {
  id: string;
  value: string;
  suit: string | null;
  power?: string;
  description?: string | null;
}

interface Settings {
  maxTotal: number;
  kingValue: number;
  jackDelta: number;
  minTotal: number;
  handSize: number;
  aceValues: [number, number];
  firstPlayerAfterLoss: "loser" | "host";
  sipStep: number;
  sipRange: [number, number];
  nearEndSips: number;
  sipAssignedBy: "player_who_played" | "all_choose" | "random";
  sipsMultiplier: number;
}

const DEFAULTS: Settings = {
  maxTotal: 98,
  kingValue: 70,
  jackDelta: -10,
  minTotal: 0,
  handSize: 4,
  aceValues: [1, 11],
  firstPlayerAfterLoss: "loser",
  sipStep: 10,
  sipRange: [10, 90],
  nearEndSips: 0,
  sipAssignedBy: "player_who_played",
  sipsMultiplier: 1,
};

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
];

function resolveSettings(raw: unknown): Settings {
  const s = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : d;
  const ace = Array.isArray(s.aceValues) ? s.aceValues : null;
  const range = Array.isArray(s.sipRange) ? s.sipRange : null;
  const assignedBy =
    s.sipAssignedBy === "all_choose" || s.sipAssignedBy === "random"
      ? s.sipAssignedBy
      : "player_who_played";
  return {
    maxTotal: num(s.maxTotal, DEFAULTS.maxTotal),
    kingValue: num(s.kingValue, DEFAULTS.kingValue),
    jackDelta: num(s.jackDelta, DEFAULTS.jackDelta),
    minTotal: num(s.minTotal, DEFAULTS.minTotal),
    handSize: num(s.handSize, DEFAULTS.handSize),
    aceValues: ace && ace.length === 2
      ? [num(ace[0], 1), num(ace[1], 11)]
      : DEFAULTS.aceValues,
    firstPlayerAfterLoss: s.firstPlayerAfterLoss === "host" ? "host" : "loser",
    sipStep: num(s.sipStep, DEFAULTS.sipStep),
    sipRange: range && range.length === 2
      ? [num(range[0], 10), num(range[1], 90)]
      : DEFAULTS.sipRange,
    nearEndSips: num(s.nearEndSips, DEFAULTS.nearEndSips),
    sipAssignedBy: assignedBy,
    sipsMultiplier: num(s.sipsMultiplier, DEFAULTS.sipsMultiplier),
  };
}

type PalierKind = "none" | "palier" | "near_end";
interface PalierResult {
  kind: PalierKind;
  total: number;
  sips: number;
}

/** Détecte un palier de gorgées sur un total (multiplicateur déjà appliqué). */
function computePalier(total: number, s: Settings): PalierResult {
  const mult = s.sipsMultiplier;
  if (total > s.maxTotal) return { kind: "none", total: 0, sips: 0 };
  if (total === s.maxTotal) {
    return { kind: "near_end", total, sips: s.nearEndSips * mult };
  }
  const [lo, hi] = s.sipRange;
  if (s.sipStep > 0 && total >= lo && total <= hi && total % s.sipStep === 0) {
    return { kind: "palier", total, sips: (total / s.sipStep) * mult };
  }
  return { kind: "none", total: 0, sips: 0 };
}

function faceValue(value: string): number {
  const n = Number(value);
  return Number.isInteger(n) ? n : 0;
}

interface CardRuleRow {
  id: string;
  card_value: string;
  label: string;
  action_type: string;
  action_params: Record<string, unknown>;
}

/** Vrai si la carte posée déclenche une règle ciblant `target`. */
function ruleMatchesCard(cardValue: string, target: string): boolean {
  if (target === "ALL") return true;
  if (target === "EVEN" || target === "ODD") {
    const n = Number(cardValue);
    if (!Number.isInteger(n)) return false;
    return target === "EVEN" ? n % 2 === 0 : n % 2 === 1;
  }
  return target === cardValue;
}

function applyCard(
  total: number,
  card: Card,
  aceChoice: number | undefined,
  s: Settings,
): { total: number; reverses: boolean } {
  switch (card.value) {
    case "A":
      return { total: total + (aceChoice ?? s.aceValues[1]), reverses: false };
    case "J":
      return { total: Math.max(s.minTotal, total + s.jackDelta), reverses: false };
    case "Q":
      return { total, reverses: true };
    case "K":
      return { total: s.kingValue, reverses: false };
    case "JOKER":
      return { total, reverses: false };
    default:
      return { total: total + faceValue(card.value), reverses: false };
  }
}

function minTotalForCard(total: number, card: Card, s: Settings): number {
  if (card.value === "A") {
    return applyCard(total, card, Math.min(s.aceValues[0], s.aceValues[1]), s).total;
  }
  return applyCard(total, card, undefined, s).total;
}

function canCardStay(total: number, card: Card, s: Settings): boolean {
  return minTotalForCard(total, card, s) <= s.maxTotal;
}

function hasPlayableCard(hand: Card[], total: number, s: Settings): boolean {
  return hand.some((c) => canCardStay(total, c, s));
}

function buildDeck(jokers: Card[]): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) deck.push({ id: `${value}-${suit}`, value, suit });
  }
  for (const joker of jokers) deck.push(joker);
  return deck;
}

/** Charge les cartes Joker configurées (Phase 6), si activées par l'hôte. */
async function loadJokerCards(
  admin: ReturnType<typeof createClient>,
  roomId: string,
  jokersEnabled: boolean,
): Promise<Card[]> {
  if (!jokersEnabled) return [];
  const { data } = await admin
    .from("joker_configs")
    .select("id, power_type, description")
    .eq("room_id", roomId);
  return ((data ?? []) as { power_type: string; description: string | null }[]).map(
    (j, i) => ({
      id: `JOKER-${i + 1}`,
      value: "JOKER",
      suit: null,
      power: j.power_type,
      description: j.description ?? null,
    }),
  );
}

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

/** Pioche `count` cartes, remélange la défausse (sauf `keepTop`) si besoin. */
function drawCards(
  pile: Card[],
  discard: Card[],
  count: number,
  keepTop: Card,
): { drawn: Card[]; pile: Card[]; discard: Card[] } {
  let pileOut = [...pile];
  let discardOut = [...discard];
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (pileOut.length === 0) {
      const recyclable = discardOut.filter((c) => c.id !== keepTop.id);
      if (recyclable.length === 0) break;
      pileOut = secureShuffle(recyclable);
      discardOut = [keepTop];
    }
    drawn.push(pileOut[0]);
    pileOut = pileOut.slice(1);
  }
  return { drawn, pile: pileOut, discard: discardOut };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface PlayerRow {
  id: string;
  profile_id: string;
  hand: Card[] | null;
  position: number;
}

interface RoomRow {
  id: string;
  host_id: string;
  current_total: number;
  direction: string;
  current_player_id: string | null;
  settings: Record<string, unknown> | null;
}

interface JokerContext {
  roomId: string;
  room: RoomRow;
  settings: Settings;
  players: PlayerRow[];
  current: PlayerRow;
  hand: Card[];
  card: Card;
}

/**
 * Exécute le pouvoir d'une carte Joker (Phase 6). Le Joker est toujours jouable
 * et ne modifie jamais directement current_total ; il déclenche un effet, puis
 * passe la main au joueur suivant. Diffuse un game_event 'joker_activated'.
 */
async function handleJoker(
  admin: ReturnType<typeof createClient>,
  ctx: JokerContext,
): Promise<Response> {
  const { roomId, room, settings, players, current, card } = ctx;
  const power = typeof card.power === "string" ? card.power : "collective_drink";

  const raw = (room.settings ?? {}) as Record<string, unknown>;
  const nextSettings: Record<string, unknown> = { ...raw };

  // Pioche / défausse.
  const { data: deckRow } = await admin
    .from("game_deck")
    .select("remaining_cards, discard_pile")
    .eq("room_id", roomId)
    .single();
  let pile = ((deckRow?.remaining_cards ?? []) as Card[]);
  const discard = ((deckRow?.discard_pile ?? []) as Card[]);
  const prevTop = discard.length ? discard[discard.length - 1] : null;

  let discardAfter = [...discard, card];

  // Retire le Joker de la main du poseur, repioche jusqu'à handSize.
  const handWithout = ctx.hand.filter((c) => c.id !== card.id);
  const need = Math.max(0, settings.handSize - handWithout.length);
  const drawP = drawCards(pile, discardAfter, need, card);
  pile = drawP.pile;
  discardAfter = drawP.discard;

  // Snapshot des mains par id (le poseur a déjà repioché).
  const handsById: Record<string, Card[]> = {};
  for (const p of players) {
    handsById[p.id] = p.id === current.id
      ? [...handWithout, ...drawP.drawn]
      : ((p.hand ?? []) as Card[]);
  }

  // Ordre des joueurs (par position) — peut être permuté par la chaise musicale.
  let order = [...players];
  let newDirection = room.direction;
  let newTotal = room.current_total;
  let positionsChanged = false;

  switch (power) {
    case "reverse":
      newDirection = room.direction === "cw" ? "ccw" : "cw";
      break;
    case "reset_zero":
      newTotal = 0;
      break;
    case "double_or_nothing":
      nextSettings.nextCardDoubled = true;
      break;
    case "swap_hands": {
      const n = order.length;
      const rotated: Record<string, Card[]> = {};
      for (let i = 0; i < n; i++) {
        const giver = order[(i - 1 + n) % n];
        rotated[order[i].id] = handsById[giver.id];
      }
      for (const id of Object.keys(rotated)) handsById[id] = rotated[id];
      break;
    }
    case "ghost_draw": {
      for (const p of order) {
        if (p.id === current.id) continue;
        const d = drawCards(pile, discardAfter, 1, card);
        handsById[p.id] = [...handsById[p.id], ...d.drawn];
        pile = d.pile;
        discardAfter = d.discard;
      }
      break;
    }
    case "immunity": {
      const list = Array.isArray(nextSettings.immunePlayers)
        ? [...(nextSettings.immunePlayers as string[])]
        : [];
      if (!list.includes(current.id)) list.push(current.id);
      nextSettings.immunePlayers = list;
      break;
    }
    case "musical_chairs":
      order = secureShuffle(order);
      positionsChanged = true;
      break;
    // collective_drink, free_distribution : effet purement visuel / client.
    default:
      break;
  }

  // Joueur suivant selon le sens courant et l'ordre (éventuellement remélangé).
  const curIdx = order.findIndex((p) => p.id === current.id);
  const step = newDirection === "cw" ? 1 : -1;
  const nextPlayer = order[(curIdx + step + order.length) % order.length];

  // Carte miroir : le joueur suivant devra rejouer la valeur de la carte
  // précédente s'il l'a en main, sinon pénalité.
  if (power === "mirror" && prevTop && prevTop.value !== "JOKER") {
    nextSettings.mirror = {
      value: prevTop.value,
      playerId: nextPlayer.id,
      penalty: typeof raw.mirrorPenaltySips === "number" ? raw.mirrorPenaltySips : 2,
    };
  }

  // Écritures des mains (et positions pour la chaise musicale).
  for (let i = 0; i < order.length; i++) {
    const update: Record<string, unknown> = { hand: handsById[order[i].id] };
    if (positionsChanged) update.position = i;
    await admin.from("game_players").update(update).eq("id", order[i].id);
  }

  await admin.from("game_deck").upsert({
    room_id: roomId,
    remaining_cards: pile,
    discard_pile: discardAfter,
  });

  await admin.from("game_rooms").update({
    current_total: newTotal,
    direction: newDirection,
    current_player_id: nextPlayer.id,
    settings: nextSettings,
  }).eq("id", roomId);

  await admin.from("game_events").insert({
    room_id: roomId,
    type: "joker_activated",
    payload: {
      power,
      description: typeof card.description === "string" ? card.description : null,
      by_player_id: current.id,
      by_profile_id: current.profile_id,
      next_player_id: nextPlayer.id,
      card,
    },
  });

  return json({ ok: true, outcome: "joker", power, next_player_id: nextPlayer.id });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return json({ error: "Server misconfigured" }, 500);

  // 1) Authentifier l'appelant.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Missing authorization" }, 401);

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser(token);
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  // 2) Payload.
  let roomId: string | undefined;
  let cardId: string | undefined;
  let aceChoice: number | undefined;
  try {
    const body = await req.json();
    roomId = body?.roomId;
    cardId = body?.cardId;
    aceChoice = typeof body?.aceChoice === "number" ? body.aceChoice : undefined;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!roomId || !cardId) return json({ error: "roomId et cardId requis" }, 400);

  const admin = createClient(url, serviceKey);

  // 3) Charger la room.
  const { data: room, error: roomErr } = await admin
    .from("game_rooms")
    .select("id, host_id, status, current_total, direction, current_player_id, settings")
    .eq("id", roomId)
    .single();
  if (roomErr || !room) return json({ error: "Room introuvable" }, 404);
  if (room.status !== "playing") return json({ error: "La partie n'est pas en cours" }, 409);

  const settings = resolveSettings(room.settings);

  // 4) Joueurs actifs ordonnés.
  const { data: players, error: playersErr } = await admin
    .from("game_players")
    .select("id, profile_id, hand, position")
    .eq("room_id", roomId)
    .eq("is_active", true)
    .order("position", { ascending: true });
  if (playersErr || !players || players.length < 2) {
    return json({ error: "Joueurs insuffisants" }, 409);
  }

  // 5) C'est bien le tour de l'appelant ?
  const current = players.find((p) => p.id === room.current_player_id);
  if (!current) return json({ error: "Aucun joueur courant" }, 409);
  if (current.profile_id !== user.id) {
    return json({ error: "Ce n'est pas ton tour" }, 403);
  }

  const hand = (current.hand ?? []) as Card[];
  const card = hand.find((c) => c.id === cardId);
  if (!card) return json({ error: "Carte absente de ta main" }, 400);

  // ---------------------------------------------------------------------------
  // 5 bis) Joker (Phase 6) : toujours jouable, ne touche jamais current_total.
  // ---------------------------------------------------------------------------
  if (card.value === "JOKER") {
    return await handleJoker(admin, {
      roomId,
      room,
      settings,
      players,
      current,
      hand,
      card,
    });
  }

  // 6) Validation autoritaire.
  const total = room.current_total as number;
  const forcedBust = !hasPlayableCard(hand, total, settings);

  if (!forcedBust) {
    if (card.value === "A" && aceChoice === undefined) {
      return json({ error: "Choix de l'As requis" }, 400);
    }
    const effect = applyCard(total, card, aceChoice, settings);
    if (effect.total > settings.maxTotal) {
      return json({ error: "Cette carte ferait dépasser 98" }, 422);
    }
  } else {
    // Bust forcé : seule la carte au dépassement minimal est acceptée.
    let globalMin = Infinity;
    for (const c of hand) {
      globalMin = Math.min(globalMin, minTotalForCard(total, c, settings));
    }
    if (minTotalForCard(total, card, settings) !== globalMin) {
      return json({ error: "Tu dois jouer la carte qui dépasse le moins" }, 422);
    }
  }

  // 6 bis) Carte miroir (Phase 6) : contrainte sur le joueur suivant désigné.
  const rawSettings = (room.settings ?? {}) as Record<string, unknown>;
  const mirrorRaw = rawSettings.mirror as
    | { value?: string; playerId?: string; penalty?: number }
    | undefined;
  const mirrorActive = !forcedBust && !!mirrorRaw &&
    mirrorRaw.playerId === current.id && typeof mirrorRaw.value === "string";
  const ownsMirror = mirrorActive
    ? hand.some((c) => c.value === mirrorRaw!.value)
    : false;
  if (mirrorActive && ownsMirror && card.value !== mirrorRaw!.value) {
    return json(
      { error: `Carte miroir : tu dois rejouer un ${mirrorRaw!.value}` },
      422,
    );
  }

  // ---------------------------------------------------------------------------
  // 7a) Cas du dépassement forcé : manche perdue + redistribution.
  // ---------------------------------------------------------------------------
  if (forcedBust) {
    const effect = applyCard(total, card, aceChoice, settings);

    await admin.from("game_events").insert({
      room_id: roomId,
      type: "round_lost",
      payload: {
        loser_player_id: current.id,
        loser_profile_id: current.profile_id,
        bust_total: effect.total,
        card,
      },
    });

    // Redistribution : nouveau deck mélangé, 4 cartes/joueur, total=0, sens=cw.
    const jokersEnabled =
      (room.settings as Record<string, unknown> | null)?.jokersEnabled === true;
    const jokerCards = await loadJokerCards(admin, roomId, jokersEnabled);

    const deck = secureShuffle(buildDeck(jokerCards));
    let cursor = 0;
    const hands: Card[][] = players.map(() => []);
    for (let r = 0; r < settings.handSize; r++) {
      for (let p = 0; p < players.length; p++) hands[p].push(deck[cursor++]);
    }
    const remaining = deck.slice(cursor);

    for (let p = 0; p < players.length; p++) {
      await admin.from("game_players").update({ hand: hands[p] }).eq("id", players[p].id);
    }
    await admin.from("game_deck").upsert({
      room_id: roomId,
      remaining_cards: remaining,
      discard_pile: [],
    });

    // Premier joueur de la nouvelle manche : le perdant (défaut) ou l'hôte.
    let starter = current;
    if (settings.firstPlayerAfterLoss === "host") {
      starter = players.find((p) => p.profile_id === room.host_id) ?? current;
    }

    await admin.from("game_rooms").update({
      current_total: 0,
      direction: "cw",
      current_player_id: starter.id,
    }).eq("id", roomId);

    await admin.from("game_events").insert({
      room_id: roomId,
      type: "round_started",
      payload: { starter_player_id: starter.id },
    });

    return json({ ok: true, outcome: "round_lost", loser_player_id: current.id });
  }

  // ---------------------------------------------------------------------------
  // 7b) Coup légal : applique l'effet, repioche, joueur suivant.
  // ---------------------------------------------------------------------------
  const effect = applyCard(total, card, aceChoice, settings);
  const newDirection = effect.reverses
    ? room.direction === "cw" ? "ccw" : "cw"
    : room.direction;

  // Flags Joker consommés par ce coup (Phase 6).
  const nextSettings: Record<string, unknown> = { ...rawSettings };
  let settingsDirty = false;

  // « Double ou rien » : double le gain de la carte (plafonné à maxTotal).
  let finalTotal = effect.total;
  const doubledActive = rawSettings.nextCardDoubled === true;
  if (doubledActive) {
    const delta = effect.total - total;
    finalTotal = Math.min(settings.maxTotal, total + delta * 2);
    delete nextSettings.nextCardDoubled;
    settingsDirty = true;
  }

  // Carte miroir : consommée par le joueur ciblé (pénalité s'il ne l'a pas).
  if (mirrorActive) {
    delete nextSettings.mirror;
    settingsDirty = true;
  }

  // Charger la pioche / défausse.
  const { data: deckRow } = await admin
    .from("game_deck")
    .select("remaining_cards, discard_pile")
    .eq("room_id", roomId)
    .single();
  const pile = ((deckRow?.remaining_cards ?? []) as Card[]);
  const discard = ((deckRow?.discard_pile ?? []) as Card[]);

  const handWithout = hand.filter((c) => c.id !== card.id);
  const discardAfterPlay = [...discard, card];
  const need = Math.max(0, settings.handSize - handWithout.length);
  const draw = drawCards(pile, discardAfterPlay, need, card);
  const newHand = [...handWithout, ...draw.drawn];

  // Joueur suivant selon le nouveau sens.
  const idx = players.findIndex((p) => p.id === current.id);
  const step = newDirection === "cw" ? 1 : -1;
  const nextPlayer = players[(idx + step + players.length) % players.length];

  // Écritures.
  await admin.from("game_players").update({ hand: newHand }).eq("id", current.id);
  await admin.from("game_deck").upsert({
    room_id: roomId,
    remaining_cards: draw.pile,
    discard_pile: draw.discard,
  });
  const roomUpdate: Record<string, unknown> = {
    current_total: finalTotal,
    direction: newDirection,
    current_player_id: nextPlayer.id,
  };
  if (settingsDirty) roomUpdate.settings = nextSettings;
  await admin.from("game_rooms").update(roomUpdate).eq("id", roomId);

  await admin.from("game_events").insert({
    room_id: roomId,
    type: "card_played",
    payload: {
      player_id: current.id,
      profile_id: current.profile_id,
      card,
      ace_choice: aceChoice ?? null,
      new_total: finalTotal,
      doubled: doubledActive,
      reverses: effect.reverses,
      direction: newDirection,
      next_player_id: nextPlayer.id,
    },
  });

  // Carte miroir ratée : le joueur ciblé n'avait pas la valeur → pénalité.
  if (mirrorActive && !ownsMirror) {
    const penalty = typeof mirrorRaw!.penalty === "number" ? mirrorRaw!.penalty : 2;
    if (penalty > 0) {
      await admin.from("sip_assignments").insert({
        room_id: roomId,
        from_player_id: null,
        to_player_id: current.id,
        amount: penalty,
        reason: "joker_mirror",
      });
      await admin.from("game_events").insert({
        room_id: roomId,
        type: "joker_penalty",
        payload: {
          to_player_id: current.id,
          to_profile_id: current.profile_id,
          sips: penalty,
          reason: "mirror",
        },
      });
    }
  }

  // 8) Règles personnalisées par carte (Phase 5) : une bannière par règle.
  const { data: cardRules } = await admin
    .from("card_rules")
    .select("id, card_value, label, action_type, action_params")
    .eq("room_id", roomId);
  for (const rule of (cardRules ?? []) as CardRuleRow[]) {
    if (!ruleMatchesCard(card.value, rule.card_value)) continue;
    await admin.from("game_events").insert({
      room_id: roomId,
      type: "custom_rule_triggered",
      payload: {
        rule_id: rule.id,
        card_value: rule.card_value,
        label: rule.label,
        action_type: rule.action_type,
        action_params: rule.action_params ?? {},
        by_player_id: current.id,
        by_profile_id: current.profile_id,
        card,
      },
    });
  }

  // 9) Palier à gorgées déclenché par le nouveau total ?
  const palier = computePalier(finalTotal, settings);
  if (doubledActive && palier.kind !== "none") palier.sips *= 2;

  // Immunité (Phase 6) : consommée silencieusement si elle vise le poseur.
  const immuneList = Array.isArray(rawSettings.immunePlayers)
    ? (rawSettings.immunePlayers as string[])
    : [];
  const isImmune = palier.kind !== "none" && immuneList.includes(current.id);
  if (isImmune) {
    nextSettings.immunePlayers = immuneList.filter((id) => id !== current.id);
    settingsDirty = true;
    // Réécrit les settings pour purger l'immunité consommée.
    await admin.from("game_rooms").update({ settings: nextSettings }).eq("id", roomId);
    await admin.from("game_events").insert({
      room_id: roomId,
      type: "joker_immunity_used",
      payload: { by_player_id: current.id, by_profile_id: current.profile_id },
    });
  }

  if (palier.kind !== "none" && !isImmune) {
    await admin.from("game_events").insert({
      room_id: roomId,
      type: "palier_triggered",
      payload: {
        kind: palier.kind,
        total: palier.total,
        sips: palier.sips,
        multiplier: settings.sipsMultiplier,
        assigned_by: settings.sipAssignedBy,
        by_player_id: current.id,
        by_profile_id: current.profile_id,
      },
    });
  }

  return json({
    ok: true,
    outcome: "played",
    new_total: finalTotal,
    direction: newDirection,
    next_player_id: nextPlayer.id,
    reverses: effect.reverses,
    palier: palier.kind === "none" || isImmune ? null : palier,
  });
});
