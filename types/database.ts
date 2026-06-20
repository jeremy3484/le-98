/**
 * Types TypeScript du schéma Supabase (cf. supabase/migrations/0001_init.sql).
 *
 * En Phase ultérieure, ces types pourront être régénérés automatiquement via :
 *   supabase gen types typescript --project-id <ref> > types/database.ts
 * Pour l'instant ils sont maintenus à la main pour rester simples.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type GameStatus = "waiting" | "playing" | "finished" | "aborted";
export type GameDirection = "cw" | "ccw"; // sens horaire / anti-horaire

/** Une carte du jeu. La forme exacte sera affinée par le game-engine. */
export interface Card {
  id: string;
  value: string; // ex: "A", "7", "K", "JOKER"
  suit?: string | null; // ex: "hearts" | "spades" | "diamonds" | "clubs" | null
  [key: string]: Json | undefined;
}

export interface Profile {
  id: string; // = auth.users.id
  pseudo: string;
  avatar_url: string | null;
  created_at: string;
}

export interface GameRoom {
  id: string;
  code: string;
  host_id: string;
  status: GameStatus;
  current_total: number;
  direction: GameDirection;
  current_player_id: string | null;
  settings: Json;
  created_at: string;
}

export interface GamePlayer {
  id: string;
  room_id: string;
  profile_id: string;
  hand: Card[];
  position: number;
  is_active: boolean;
  joined_at: string;
}

export interface GameDeck {
  room_id: string; // PK + FK
  remaining_cards: Card[];
  discard_pile: Card[];
}

export interface CardRule {
  id: string;
  room_id: string;
  card_value: string;
  label: string;
  action_type: string;
  action_params: Json;
}

export interface JokerConfig {
  id: string;
  room_id: string;
  power_type: string;
  description: string | null;
}

export interface GameEvent {
  id: string;
  room_id: string;
  type: string;
  payload: Json;
  created_at: string;
}

export interface SipAssignment {
  id: string;
  room_id: string;
  from_player_id: string | null;
  to_player_id: string | null;
  amount: number;
  reason: string | null;
  created_at: string;
}
