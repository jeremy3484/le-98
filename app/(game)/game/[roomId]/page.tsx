"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Beer, Loader2, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/use-user";
import { playCard } from "@/lib/supabase/game";
import { assignSips, fetchSipScores, fetchRoundsLost } from "@/lib/supabase/sips";
import {
  canCardStay,
  hasPlayableCard,
  leastOvershootCard,
  resolveSettings,
  type AceChoice,
} from "@/lib/game-engine";
import { Button } from "@/components/ui/button";
import { TotalGauge } from "@/components/game/total-gauge";
import { DirectionIndicator } from "@/components/game/direction-indicator";
import { PlayerSeat } from "@/components/game/player-seat";
import { PlayingCard } from "@/components/game/playing-card";
import { AceDialog } from "@/components/game/ace-dialog";
import { PalierBanner, type PalierBannerData } from "@/components/game/palier-banner";
import {
  CustomRuleBanner,
  type CustomRuleBannerData,
} from "@/components/game/custom-rule-banner";
import { JokerBanner, type JokerBannerData } from "@/components/game/joker-banner";
import { SipDistributor } from "@/components/game/sip-distributor";
import { Scoreboard } from "@/components/game/scoreboard";
import { RecapScreen } from "@/components/game/recap-screen";
import { MultiplierBadge } from "@/components/game/multiplier-badge";
import type { Card, GameRoom, GamePlayer, Profile } from "@/types/database";

interface PlayerWithProfile extends GamePlayer {
  profile: Pick<Profile, "id" | "pseudo" | "avatar_url"> | null;
}

interface RoundBanner {
  loserPseudo: string;
}

const PLAYERS_SELECT =
  "id, room_id, profile_id, hand, position, is_active, joined_at, profile:profiles(id, pseudo, avatar_url)";

export default function GameTablePage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: userLoading } = useUser();

  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<PlayerWithProfile[]>([]);
  const [discardTop, setDiscardTop] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aceCard, setAceCard] = useState<Card | null>(null);
  const [banner, setBanner] = useState<RoundBanner | null>(null);

  // Phase 4 — gorgées.
  const [palierBanner, setPalierBanner] = useState<PalierBannerData | null>(null);
  const [distributorSips, setDistributorSips] = useState<number | null>(null);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [sipScores, setSipScores] = useState<Record<string, number>>({});
  const [sipToast, setSipToast] = useState<string | null>(null);
  const [customRule, setCustomRule] = useState<CustomRuleBannerData | null>(null);

  // Phase 7 — récap de fin de soirée.
  const [recapOpen, setRecapOpen] = useState(false);
  const [roundsLost, setRoundsLost] = useState<Record<string, number>>({});

  // Phase 6 — Jokers.
  const [jokerBanner, setJokerBanner] = useState<JokerBannerData | null>(null);

  const settings = useMemo(() => resolveSettings(room?.settings ?? null), [room]);

  // Refs pour accéder à l'état courant depuis les callbacks Realtime.
  const playersRef = useRef<PlayerWithProfile[]>([]);
  const meIdRef = useRef<string | null>(null);

  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase
      .from("game_players")
      .select(PLAYERS_SELECT)
      .eq("room_id", roomId)
      .eq("is_active", true)
      .order("position", { ascending: true });
    if (data) setPlayers(data as unknown as PlayerWithProfile[]);
  }, [supabase, roomId]);

  const fetchScores = useCallback(async () => {
    setSipScores(await fetchSipScores(supabase, roomId));
  }, [supabase, roomId]);

  const fetchRounds = useCallback(async () => {
    setRoundsLost(await fetchRoundsLost(supabase, roomId));
  }, [supabase, roomId]);

  const fetchDeck = useCallback(async () => {
    const { data } = await supabase
      .from("game_deck")
      .select("discard_pile")
      .eq("room_id", roomId)
      .single();
    const pile = (data?.discard_pile ?? []) as Card[];
    setDiscardTop(pile.length ? pile[pile.length - 1] : null);
  }, [supabase, roomId]);

  // Recharge l'état autoritaire de la room (total, tour courant, sens, statut).
  // Utilisé par le filet de sécurité (polling) au cas où Realtime ne pousse rien.
  const fetchRoom = useCallback(async () => {
    const { data } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    if (!data) return;
    const r = data as GameRoom;
    setRoom(r);
    if (r.status === "waiting") router.replace(`/game/${roomId}/lobby`);
    if (r.status === "finished") setRecapOpen(true);
  }, [supabase, roomId, router]);

  // Chargement initial.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: roomData } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("id", roomId)
        .single();
      if (cancelled) return;

      const r = roomData as GameRoom | null;
      if (!r) {
        router.replace("/lobby");
        return;
      }
      if (r.status === "waiting") {
        router.replace(`/game/${roomId}/lobby`);
        return;
      }
      setRoom(r);
      await Promise.all([fetchPlayers(), fetchDeck(), fetchScores(), fetchRounds()]);
      if (r.status === "finished" && !cancelled) setRecapOpen(true);
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, roomId, router, fetchPlayers, fetchDeck, fetchScores, fetchRounds]);

  // Garde les refs synchronisées avec l'état courant.
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  useEffect(() => {
    meIdRef.current =
      players.find((p) => p.profile_id === user?.id)?.id ?? null;
  }, [players, user?.id]);

  // Realtime : room, joueurs, deck, événements.
  useEffect(() => {
    const channel = supabase
      .channel(`game:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const next = payload.new as GameRoom;
          setRoom(next);
          if (next.status === "waiting") router.replace(`/game/${roomId}/lobby`);
          if (next.status === "finished") {
            void fetchScores();
            void fetchRounds();
            setRecapOpen(true);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_players", filter: `room_id=eq.${roomId}` },
        () => void fetchPlayers(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_deck", filter: `room_id=eq.${roomId}` },
        () => void fetchDeck(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_events", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const ev = payload.new as { type: string; payload: Record<string, unknown> };

          if (ev.type === "round_lost") {
            const loserProfileId = ev.payload.loser_profile_id as string;
            const loser = playersRef.current.find((p) => p.profile_id === loserProfileId);
            setBanner({ loserPseudo: loser?.profile?.pseudo ?? "Un joueur" });
            setTimeout(() => setBanner(null), 4000);
            void fetchRounds();
            return;
          }

          if (ev.type === "palier_triggered") {
            const p = ev.payload;
            const kind = p.kind as PalierBannerData["kind"];
            const sips = (p.sips as number) ?? 0;
            const byPlayerId = p.by_player_id as string;
            const assignedBy = p.assigned_by as string;

            setPalierBanner({ kind, total: p.total as number, sips });
            setTimeout(() => setPalierBanner(null), 4500);

            // Qui répartit ? Par défaut le joueur qui a posé la carte.
            const iPlayed = byPlayerId === meIdRef.current;
            if (sips > 0 && iPlayed) {
              if (assignedBy === "random") {
                void autoAssignRandom(sips);
              } else {
                // 'player_who_played' (défaut) et 'all_choose' : modale chez moi.
                setDistributorSips(sips);
              }
            }
            return;
          }

          if (ev.type === "sips_assigned") {
            const p = ev.payload;
            const fromId = p.from_player_id as string;
            const dist = (p.distributions ?? []) as { toPlayerId: string; amount: number }[];
            const cur = playersRef.current;
            const nameOf = (id: string) =>
              cur.find((pl) => pl.id === id)?.profile?.pseudo ?? "Quelqu'un";
            const parts = dist.map((d) => `${d.amount} à ${nameOf(d.toPlayerId)}`);
            setSipToast(`${nameOf(fromId)} donne ${parts.join(", ")} 🍺`);
            setTimeout(() => setSipToast(null), 4000);
            void fetchScores();
            return;
          }

          if (ev.type === "custom_rule_triggered") {
            const p = ev.payload;
            const byPlayerId = p.by_player_id as string;
            const byPseudo =
              playersRef.current.find((pl) => pl.id === byPlayerId)?.profile
                ?.pseudo ?? "Un joueur";
            setCustomRule({
              label: (p.label as string) ?? "Règle spéciale",
              actionType: (p.action_type as string) ?? "free_text",
              byPseudo,
            });
            setTimeout(() => setCustomRule(null), 5000);
            return;
          }

          if (ev.type === "joker_activated") {
            const p = ev.payload;
            const power = (p.power as string) ?? "collective_drink";
            const byPlayerId = p.by_player_id as string;
            const byPseudo =
              playersRef.current.find((pl) => pl.id === byPlayerId)?.profile
                ?.pseudo ?? "Un joueur";
            setJokerBanner({
              power,
              description: (p.description as string | null) ?? null,
              byPseudo,
            });
            setTimeout(() => setJokerBanner(null), 4500);

            // Distribution libre : le poseur ouvre le répartiteur (5 gorgées).
            if (power === "free_distribution" && byPlayerId === meIdRef.current) {
              setDistributorSips(5);
            }
            return;
          }

          if (ev.type === "joker_penalty") {
            const p = ev.payload;
            const toId = p.to_player_id as string;
            const amount = (p.sips as number) ?? 0;
            const pseudo =
              playersRef.current.find((pl) => pl.id === toId)?.profile?.pseudo ??
              "Quelqu'un";
            setSipToast(`🪞 ${pseudo} rate le miroir et boit ${amount} 🍺`);
            setTimeout(() => setSipToast(null), 4000);
            void fetchScores();
            return;
          }

          if (ev.type === "joker_immunity_used") {
            const p = ev.payload;
            const toId = p.by_player_id as string;
            const pseudo =
              playersRef.current.find((pl) => pl.id === toId)?.profile?.pseudo ??
              "Un joueur";
            setSipToast(`🛡️ ${pseudo} est immunisé contre ce palier !`);
            setTimeout(() => setSipToast(null), 3500);
            return;
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, roomId, router, fetchPlayers, fetchDeck, fetchScores, fetchRounds]);

  // Filet de sécurité : resynchronise l'état autoritaire du serveur toutes les
  // 2,5 s. Garantit que les tours passent même si Realtime ne délivre pas les
  // changements (ex. canal non authentifié vis-à-vis de la RLS).
  useEffect(() => {
    if (loading) return;
    const id = setInterval(() => {
      void fetchRoom();
      void fetchPlayers();
      void fetchDeck();
    }, 2500);
    return () => clearInterval(id);
  }, [loading, fetchRoom, fetchPlayers, fetchDeck]);

  // Répartition aléatoire des gorgées (settings.sipAssignedBy === 'random').
  const autoAssignRandom = useCallback(
    async (sips: number) => {
      const fromId = meIdRef.current;
      if (!fromId) return;
      const others = playersRef.current.filter((p) => p.id !== fromId);
      if (others.length === 0) return;
      const amounts: Record<string, number> = {};
      for (let i = 0; i < sips; i++) {
        const target = others[Math.floor(Math.random() * others.length)];
        amounts[target.id] = (amounts[target.id] ?? 0) + 1;
      }
      const distributions = Object.entries(amounts).map(([toPlayerId, amount]) => ({
        toPlayerId,
        amount,
      }));
      try {
        await assignSips(supabase, roomId, fromId, distributions, "palier_random");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Distribution refusée.");
      }
    },
    [supabase, roomId],
  );

  async function handleDistribute(
    distributions: { toPlayerId: string; amount: number }[],
  ) {
    const fromId = meIdRef.current;
    setDistributorSips(null);
    if (!fromId) return;
    try {
      await assignSips(supabase, roomId, fromId, distributions, "palier");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Distribution refusée.");
    }
  }

  const me = players.find((p) => p.profile_id === user?.id) ?? null;
  const myHand = (me?.hand ?? []) as Card[];
  const opponents = players.filter((p) => p.profile_id !== user?.id);
  const total = room?.current_total ?? 0;
  const isMyTurn = !!me && !!room && room.current_player_id === me.id;
  const forcedBust = isMyTurn && !hasPlayableCard(myHand, total, settings);
  const forcedCard = forcedBust ? leastOvershootCard(myHand, total, settings) : null;

  function cardIsPlayable(card: Card): boolean {
    if (!isMyTurn) return false;
    if (forcedBust) return forcedCard?.id === card.id;
    return canCardStay(total, card, settings);
  }

  async function doPlay(card: Card, aceChoice?: AceChoice) {
    setBusy(true);
    setError(null);
    try {
      await playCard(supabase, roomId, card.id, aceChoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coup refusé.");
      // Coup refusé (souvent "Ce n'est pas ton tour" car l'état local est en
      // retard) : on resynchronise tout de suite l'état autoritaire du serveur.
      void fetchRoom();
      void fetchPlayers();
      void fetchDeck();
    } finally {
      setBusy(false);
    }
  }

  function handleCardTap(card: Card) {
    if (!isMyTurn || busy || !cardIsPlayable(card)) return;
    // As jouable sans bust forcé → choix de la valeur.
    if (card.value === "A" && !forcedBust) {
      setAceCard(card);
      return;
    }
    void doPlay(card);
  }

  if (userLoading || loading || !room) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const turnLabel = isMyTurn
    ? forcedBust
      ? "Aucun coup possible — tu vas exploser…"
      : "À toi de jouer !"
    : `Au tour de ${
        players.find((p) => p.id === room.current_player_id)?.profile?.pseudo ??
        "…"
      }`;

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-lg flex-col overflow-hidden p-4">
      {/* En-tête */}
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => router.replace("/lobby")}>
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Quitter</span>
        </Button>
        <span className="text-sm font-semibold tracking-widest text-muted-foreground">
          {room.code}
        </span>
        <div className="flex items-center gap-1">
          <MultiplierBadge multiplier={settings.sipsMultiplier} />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setScoreboardOpen(true)}
          >
            <Beer className="h-4 w-4 text-neon-gold" />
            <span className="sr-only">Gorgées de la soirée</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRecapOpen(true)}
          >
            <Trophy className="h-4 w-4 text-neon-gold" />
            <span className="sr-only">Récap de la soirée</span>
          </Button>
          <DirectionIndicator direction={room.direction} />
        </div>
      </header>

      {/* Adversaires en arc */}
      <section className="relative mt-2 h-32">
        {opponents.map((p, i) => {
          const m = opponents.length;
          const t = m === 1 ? 0.5 : i / (m - 1);
          const angle = Math.PI * (1 - t); // π (gauche) → 0 (droite)
          const left = 50 + Math.cos(angle) * 38;
          const top = 70 - Math.sin(angle) * 60;
          return (
            <div
              key={p.id}
              className="absolute -translate-x-1/2"
              style={{ left: `${left}%`, top: `${top}px` }}
            >
              <PlayerSeat
                pseudo={p.profile?.pseudo ?? "Joueur"}
                avatarUrl={p.profile?.avatar_url ?? null}
                cardCount={Array.isArray(p.hand) ? p.hand.length : 0}
                isActive={room.current_player_id === p.id}
                isHost={room.host_id === p.profile_id}
              />
            </div>
          );
        })}
      </section>

      {/* Plateau central : total + défausse */}
      <section className="flex flex-1 flex-col items-center justify-center gap-6">
        <TotalGauge total={total} maxTotal={settings.maxTotal} />

        <div className="flex flex-col items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Défausse
          </span>
          <div className="relative h-28 w-20">
            <AnimatePresence mode="popLayout">
              {discardTop ? (
                <motion.div
                  key={discardTop.id}
                  initial={{ y: 140, opacity: 0, scale: 0.6, rotate: -8 }}
                  animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 220, damping: 22 }}
                  className="absolute inset-0"
                >
                  <PlayingCard card={discardTop} size="lg" />
                </motion.div>
              ) : (
                <div className="absolute inset-0 rounded-xl border-2 border-dashed border-muted" />
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Indicateur de tour */}
      <p
        className={`text-center text-sm font-medium ${
          isMyTurn ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {turnLabel}
      </p>

      {error && (
        <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Ma main */}
      <section className="mt-3 flex items-end justify-center gap-2 pb-2">
        {myHand.map((card) => {
          const playable = cardIsPlayable(card);
          const isForced = forcedCard?.id === card.id;
          return (
            <motion.button
              key={card.id}
              type="button"
              onClick={() => handleCardTap(card)}
              disabled={!playable || busy}
              whileHover={playable ? { y: -10 } : undefined}
              whileTap={playable ? { scale: 0.95 } : undefined}
              animate={isForced ? { y: [-2, -8, -2] } : { y: 0 }}
              transition={
                isForced
                  ? { duration: 1, repeat: Infinity }
                  : { type: "spring", stiffness: 300, damping: 20 }
              }
              className={`rounded-xl transition ${
                playable
                  ? "cursor-pointer ring-2 ring-primary/70 glow-pink"
                  : "cursor-not-allowed opacity-45 saturate-50"
              } ${isForced ? "ring-2 ring-destructive glow-pink" : ""}`}
            >
              <PlayingCard card={card} size="lg" />
            </motion.button>
          );
        })}
      </section>

      {/* Bannière de manche perdue */}
      <AnimatePresence>
        {banner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="pointer-events-none absolute inset-x-0 top-1/3 z-50 mx-auto w-fit rounded-2xl bg-destructive px-6 py-4 text-center text-destructive-foreground shadow-xl"
          >
            <p className="text-lg font-bold">💥 {banner.loserPseudo} explose !</p>
            <p className="text-sm opacity-90">Cul sec 🥂 — nouvelle manche</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modale de choix de l'As */}
      <AceDialog
        open={!!aceCard}
        currentTotal={total}
        maxTotal={settings.maxTotal}
        onChoose={(choice) => {
          const card = aceCard;
          setAceCard(null);
          if (card) void doPlay(card, choice);
        }}
        onCancel={() => setAceCard(null)}
      />

      {/* Phase 4 — bannière de palier (tous les joueurs) */}
      <PalierBanner data={palierBanner} />

      {/* Phase 5 — bannière de règle personnalisée (tous les joueurs) */}
      <CustomRuleBanner data={customRule} />

      {/* Phase 6 — bannière plein écran d'activation de Joker (tous les joueurs) */}
      <JokerBanner data={jokerBanner} />

      {/* Phase 4 — annonce de distribution de gorgées */}
      <AnimatePresence>
        {sipToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="pointer-events-none absolute inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full border border-neon-gold/40 bg-neon-gold/15 px-5 py-2 text-center text-sm font-semibold text-neon-gold shadow-lg backdrop-blur-sm"
          >
            {sipToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 4 — répartiteur de gorgées (joueur désigné) */}
      <SipDistributor
        open={distributorSips !== null}
        totalSips={distributorSips ?? 0}
        targets={opponents.map((p) => ({
          id: p.id,
          pseudo: p.profile?.pseudo ?? "Joueur",
          avatarUrl: p.profile?.avatar_url ?? null,
        }))}
        onSubmit={handleDistribute}
      />

      {/* Phase 4 — scoreboard des gorgées */}
      <Scoreboard
        open={scoreboardOpen}
        onClose={() => setScoreboardOpen(false)}
        entries={players.map((p) => ({
          playerId: p.id,
          pseudo: p.profile?.pseudo ?? "Joueur",
          avatarUrl: p.profile?.avatar_url ?? null,
        }))}
        scores={sipScores}
        multiplier={settings.sipsMultiplier}
      />

      {/* Phase 7 — récap de fin de soirée (stats partageables) */}
      <RecapScreen
        open={recapOpen}
        onClose={() => setRecapOpen(false)}
        entries={players.map((p) => ({
          playerId: p.id,
          profileId: p.profile_id,
          pseudo: p.profile?.pseudo ?? "Joueur",
          avatarUrl: p.profile?.avatar_url ?? null,
        }))}
        scores={sipScores}
        roundsLost={roundsLost}
      />
    </main>
  );
}
