"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  Crown,
  Loader2,
  Play,
  Settings2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/use-user";
import { startGame, buildJoinUrl } from "@/lib/supabase/rooms";
import { PlayerAvatar } from "@/components/player-avatar";
import { QRCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GameRoom, GamePlayer, Profile } from "@/types/database";

/** Joueur enrichi de son profil (pour l'affichage). */
interface PlayerWithProfile extends GamePlayer {
  profile: Pick<Profile, "id" | "pseudo" | "avatar_url"> | null;
}

const MIN_PLAYERS = 2;

export default function WaitingRoomPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: userLoading } = useUser();

  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<PlayerWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isHost = !!user && !!room && room.host_id === user.id;
  const joinUrl = room ? buildJoinUrl(room.code) : "";

  /** Charge les joueurs actifs + leurs profils. */
  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase
      .from("game_players")
      .select(
        "id, room_id, profile_id, hand, position, is_active, joined_at, profile:profiles(id, pseudo, avatar_url)",
      )
      .eq("room_id", roomId)
      .eq("is_active", true)
      .order("position", { ascending: true });

    if (data) setPlayers(data as unknown as PlayerWithProfile[]);
  }, [supabase, roomId]);

  // Chargement initial de la room + joueurs.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: roomData, error: roomErr } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      if (cancelled) return;

      if (roomErr || !roomData) {
        setError("Partie introuvable ou accès refusé.");
        setLoading(false);
        return;
      }

      const r = roomData as GameRoom;
      setRoom(r);

      // Si la partie est déjà lancée, on file directement au jeu.
      if (r.status === "playing") {
        router.replace(`/game/${roomId}`);
        return;
      }

      await fetchPlayers();
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, roomId, router, fetchPlayers]);

  // Realtime : changements de joueurs + statut de la room.
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_players",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void fetchPlayers();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const next = payload.new as GameRoom;
          setRoom(next);
          if (next.status === "playing") {
            router.replace(`/game/${roomId}`);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, router, fetchPlayers]);

  async function handleStart() {
    setError(null);
    setStarting(true);
    try {
      await startGame(supabase, roomId);
      // La redirection se fait via le listener realtime ; fallback ci-dessous.
      router.replace(`/game/${roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du lancement.");
      setStarting(false);
    }
  }

  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible */
    }
  }

  if (userLoading || loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => router.replace("/lobby")}>
          <ArrowLeft className="h-4 w-4" />
          Retour au lobby
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col p-4">
      <header className="flex items-center gap-2 border-b pb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.replace("/lobby")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Retour</span>
        </Button>
        <div>
          <h1 className="font-display text-lg font-black leading-tight">
            Salle d&apos;attente
          </h1>
          <p className="text-xs text-muted-foreground">
            En attente du lancement…
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 py-6">
        {/* Code + QR de partage */}
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>Inviter des joueurs</CardTitle>
            <CardDescription>
              Partage le code ou fais scanner le QR.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {joinUrl && <QRCode value={joinUrl} size={180} />}
            <button
              type="button"
              onClick={copyCode}
              className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-2 transition hover:border-primary/60"
            >
              <span className="font-display text-2xl font-black tracking-[0.3em] text-gradient-festive">
                {room?.code}
              </span>
              {copied ? (
                <Check className="h-4 w-4 text-accent" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardContent>
        </Card>

        {/* Liste des joueurs (temps réel) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Joueurs</span>
              <span className="text-sm font-normal text-muted-foreground">
                {players.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {players.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg p-1"
                >
                  <PlayerAvatar
                    name={p.profile?.pseudo ?? "?"}
                    avatarUrl={p.profile?.avatar_url ?? null}
                    size={40}
                  />
                  <span className="font-medium">
                    {p.profile?.pseudo ?? "Joueur"}
                  </span>
                  {room?.host_id === p.profile_id && (
                    <Crown className="h-4 w-4 text-neon-gold" />
                  )}
                  {user?.id === p.profile_id && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      toi
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* Pied : actions hôte vs non-hôte */}
      <div className="space-y-3 border-t pt-4">
        {isHost ? (
          <>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push(`/game/${roomId}/settings`)}
            >
              <Settings2 className="h-4 w-4" />
              Personnaliser les règles
            </Button>
            <Button
              className="w-full"
              size="lg"
              onClick={handleStart}
              disabled={starting || players.length < MIN_PLAYERS}
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Lancer la partie
            </Button>
            {players.length < MIN_PLAYERS && (
              <p className="text-center text-xs text-muted-foreground">
                Il faut au moins {MIN_PLAYERS} joueurs pour lancer.
              </p>
            )}
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 py-2 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            En attente que l&apos;hôte lance la partie…
          </p>
        )}
      </div>
    </main>
  );
}
