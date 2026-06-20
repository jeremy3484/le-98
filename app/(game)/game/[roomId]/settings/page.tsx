"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/use-user";
import { updateRoomSettings } from "@/lib/supabase/rooms";
import {
  ACTION_LABELS,
  CARD_TARGET_LABELS,
  CARD_TARGET_OPTIONS,
  createCardRule,
  deleteCardRule,
  listCardRules,
  type CardRuleActionType,
  type CardRuleTarget,
} from "@/lib/supabase/card-rules";
import {
  JOKER_CATALOG,
  MAX_JOKERS,
  listJokerConfigs,
  setJokerConfigs,
  type JokerPower,
} from "@/lib/supabase/jokers";
import { resolveSettings } from "@/lib/game-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CardRule, GameRoom } from "@/types/database";

const SELECT_CLASS =
  "flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-3.5 py-2 text-base ring-offset-background transition-colors hover:border-border focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

interface BaseForm {
  kingValue: number;
  jackDelta: number;
  aceLow: number;
  aceHigh: number;
  sipStep: number;
  sipRangeLo: number;
  sipRangeHi: number;
  sipsMultiplier: number;
  sipAssignedBy: "player_who_played" | "all_choose" | "random";
  firstPlayerAfterLoss: "loser" | "host";
  startDirection: "cw" | "ccw";
  randomFirstPlayer: boolean;
}

const ASSIGNED_BY_LABELS: Record<BaseForm["sipAssignedBy"], string> = {
  player_who_played: "Le joueur qui pose la carte",
  all_choose: "Le joueur qui pose (choix libre)",
  random: "Réparti au hasard",
};

export default function RoomSettingsPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: userLoading } = useUser();

  const [room, setRoom] = useState<GameRoom | null>(null);
  const [rules, setRules] = useState<CardRule[]>([]);
  const [form, setForm] = useState<BaseForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulaire d'ajout de règle personnalisée.
  const [newTarget, setNewTarget] = useState<CardRuleTarget>("ALL");
  const [newAction, setNewAction] = useState<CardRuleActionType>("sips_fixed");
  const [newAmount, setNewAmount] = useState(2);
  const [newText, setNewText] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addingRule, setAddingRule] = useState(false);

  // Phase 6 — Jokers.
  const [jokersEnabled, setJokersEnabled] = useState(false);
  const [jokerPowers, setJokerPowers] = useState<JokerPower[]>([]);
  const [savingJokers, setSavingJokers] = useState(false);

  const fetchRules = useCallback(async () => {
    setRules(await listCardRules(supabase, roomId));
  }, [supabase, roomId]);

  const fetchJokers = useCallback(async () => {
    const configs = await listJokerConfigs(supabase, roomId);
    setJokerPowers(configs.map((c) => c.power_type as JokerPower));
  }, [supabase, roomId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("id", roomId)
        .single();
      if (cancelled) return;
      const r = data as GameRoom | null;
      if (!r) {
        router.replace("/lobby");
        return;
      }
      // Réservé à l'hôte, avant le lancement.
      if (r.host_id !== user?.id) {
        router.replace(`/game/${roomId}/lobby`);
        return;
      }
      if (r.status !== "waiting") {
        router.replace(`/game/${roomId}`);
        return;
      }
      setRoom(r);

      const s = resolveSettings(r.settings);
      const raw = (r.settings ?? {}) as Record<string, unknown>;
      setForm({
        kingValue: s.kingValue,
        jackDelta: s.jackDelta,
        aceLow: s.aceValues[0],
        aceHigh: s.aceValues[1],
        sipStep: s.sipStep,
        sipRangeLo: s.sipRange[0],
        sipRangeHi: s.sipRange[1],
        sipsMultiplier: s.sipsMultiplier,
        sipAssignedBy: s.sipAssignedBy,
        firstPlayerAfterLoss: s.firstPlayerAfterLoss,
        startDirection: raw.startDirection === "ccw" ? "ccw" : "cw",
        randomFirstPlayer: raw.random_first_player === true,
      });
      setJokersEnabled(raw.jokersEnabled === true);

      await Promise.all([fetchRules(), fetchJokers()]);
      if (!cancelled) setLoading(false);
    }
    if (!userLoading) void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, roomId, router, user?.id, userLoading, fetchRules, fetchJokers]);

  function setField<K extends keyof BaseForm>(key: K, value: BaseForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSavedAt(false);
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      await updateRoomSettings(supabase, roomId, {
        kingValue: form.kingValue,
        jackDelta: form.jackDelta,
        aceValues: [form.aceLow, form.aceHigh],
        sipStep: form.sipStep,
        sipRange: [form.sipRangeLo, form.sipRangeHi],
        sipsMultiplier: form.sipsMultiplier,
        sipAssignedBy: form.sipAssignedBy,
        firstPlayerAfterLoss: form.firstPlayerAfterLoss,
        startDirection: form.startDirection,
        random_first_player: form.randomFirstPlayer,
      });
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRule() {
    setAddingRule(true);
    setError(null);
    try {
      await createCardRule(
        supabase,
        roomId,
        newTarget,
        newAction,
        { amount: newAmount, text: newText },
        newLabel,
      );
      setNewText("");
      setNewLabel("");
      setNewAmount(2);
      await fetchRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'ajouter la règle.");
    } finally {
      setAddingRule(false);
    }
  }

  async function handleDeleteRule(id: string) {
    setError(null);
    try {
      await deleteCardRule(supabase, id);
      await fetchRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  async function handleToggleJokers(on: boolean) {
    setJokersEnabled(on);
    setError(null);
    try {
      await updateRoomSettings(supabase, roomId, { jokersEnabled: on });
    } catch (e) {
      setJokersEnabled(!on);
      setError(e instanceof Error ? e.message : "Impossible de basculer les Jokers.");
    }
  }

  async function persistJokers(next: JokerPower[]) {
    const previous = jokerPowers;
    setJokerPowers(next);
    setSavingJokers(true);
    setError(null);
    try {
      await setJokerConfigs(supabase, roomId, next);
    } catch (e) {
      setJokerPowers(previous);
      setError(e instanceof Error ? e.message : "Sélection des Jokers refusée.");
    } finally {
      setSavingJokers(false);
    }
  }

  function addJoker(power: JokerPower) {
    if (jokerPowers.length >= MAX_JOKERS) return;
    void persistJokers([...jokerPowers, power]);
  }

  function removeJokerAt(index: number) {
    void persistJokers(jokerPowers.filter((_, i) => i !== index));
  }

  if (userLoading || loading || !form || !room) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col p-4">
      {/* En-tête */}
      <header className="flex items-center gap-2 border-b pb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.replace(`/game/${roomId}/lobby`)}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Retour au salon</span>
        </Button>
        <div>
          <h1 className="font-display text-lg font-black leading-tight">
            Personnaliser les règles
          </h1>
          <p className="text-xs text-muted-foreground">
            Salle {room.code} — visible par tous, modifiable par l&apos;hôte.
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 py-6">
        {/* 1) Règles de base */}
        <Card>
          <CardHeader>
            <CardTitle>Règles de base</CardTitle>
            <CardDescription>
              Ajuste les valeurs par défaut du jeu de 98.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Valeur du Roi"
                value={form.kingValue}
                onChange={(v) => setField("kingValue", v)}
              />
              <NumberField
                label="Variation du Valet"
                value={form.jackDelta}
                onChange={(v) => setField("jackDelta", v)}
              />
              <NumberField
                label="As — petite valeur"
                value={form.aceLow}
                onChange={(v) => setField("aceLow", v)}
              />
              <NumberField
                label="As — grande valeur"
                value={form.aceHigh}
                onChange={(v) => setField("aceHigh", v)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Formule des paliers à gorgées</Label>
              <p className="text-xs text-muted-foreground">
                Un palier se déclenche à chaque multiple du pas, dans la plage
                choisie. Les gorgées valent total ÷ pas.
              </p>
              <div className="grid grid-cols-3 gap-3 pt-1">
                <NumberField
                  label="Pas"
                  value={form.sipStep}
                  onChange={(v) => setField("sipStep", v)}
                />
                <NumberField
                  label="Min"
                  value={form.sipRangeLo}
                  onChange={(v) => setField("sipRangeLo", v)}
                />
                <NumberField
                  label="Max"
                  value={form.sipRangeHi}
                  onChange={(v) => setField("sipRangeHi", v)}
                />
              </div>
            </div>

            <NumberField
              label="Multiplicateur de gorgées"
              value={form.sipsMultiplier}
              min={1}
              onChange={(v) => setField("sipsMultiplier", Math.max(1, v))}
            />

            <div className="space-y-1.5">
              <Label htmlFor="assignedBy">Qui distribue les gorgées ?</Label>
              <select
                id="assignedBy"
                className={SELECT_CLASS}
                value={form.sipAssignedBy}
                onChange={(e) =>
                  setField("sipAssignedBy", e.target.value as BaseForm["sipAssignedBy"])
                }
              >
                {Object.entries(ASSIGNED_BY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="firstAfterLoss">
                Premier joueur après une manche perdue
              </Label>
              <select
                id="firstAfterLoss"
                className={SELECT_CLASS}
                value={form.firstPlayerAfterLoss}
                onChange={(e) =>
                  setField(
                    "firstPlayerAfterLoss",
                    e.target.value as BaseForm["firstPlayerAfterLoss"],
                  )
                }
              >
                <option value="loser">Le perdant de la manche</option>
                <option value="host">L&apos;hôte</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* 2) Règles personnalisées par carte */}
        <Card>
          <CardHeader>
            <CardTitle>Règles personnalisées par carte</CardTitle>
            <CardDescription>
              Associe une action à une carte (ou un groupe de cartes).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Liste des règles actives */}
            {rules.length > 0 ? (
              <ul className="space-y-2">
                {rules.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 rounded-lg border p-2"
                  >
                    <span className="flex h-9 min-w-9 items-center justify-center rounded-md bg-primary/10 px-2 text-sm font-bold text-primary">
                      {CARD_TARGET_LABELS[r.card_value as CardRuleTarget] ??
                        r.card_value}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {ACTION_LABELS[r.action_type as CardRuleActionType] ??
                          r.action_type}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleDeleteRule(r.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                      <span className="sr-only">Supprimer</span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                Aucune règle personnalisée pour l&apos;instant.
              </p>
            )}

            {/* Formulaire d'ajout */}
            <div className="space-y-3 rounded-lg bg-muted/40 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="ruleTarget">Carte concernée</Label>
                <select
                  id="ruleTarget"
                  className={SELECT_CLASS}
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value as CardRuleTarget)}
                >
                  {CARD_TARGET_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {CARD_TARGET_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ruleAction">Action</Label>
                <select
                  id="ruleAction"
                  className={SELECT_CLASS}
                  value={newAction}
                  onChange={(e) =>
                    setNewAction(e.target.value as CardRuleActionType)
                  }
                >
                  {Object.entries(ACTION_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              {newAction === "sips_fixed" && (
                <NumberField
                  label="Nombre de gorgées"
                  value={newAmount}
                  min={1}
                  onChange={(v) => setNewAmount(Math.max(1, v))}
                />
              )}

              {newAction === "free_text" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ruleText">Texte affiché à tous</Label>
                  <Input
                    id="ruleText"
                    placeholder="Ex : raconte une blague !"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="ruleLabel">
                  Libellé (optionnel)
                </Label>
                <Input
                  id="ruleLabel"
                  placeholder="Laisse vide pour un libellé auto"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>

              <Button
                className="w-full"
                onClick={() => void handleAddRule()}
                disabled={
                  addingRule || (newAction === "free_text" && !newText.trim())
                }
              >
                {addingRule ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Ajouter une règle
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 3) Modificateurs globaux */}
        <Card>
          <CardHeader>
            <CardTitle>Modificateurs globaux</CardTitle>
            <CardDescription>
              Des bascules rapides qui changent l&apos;ambiance de la partie.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToggleRow
              label="Toutes les gorgées comptent double"
              description="Multiplie par 2 toutes les gorgées des paliers."
              checked={form.sipsMultiplier >= 2}
              onChange={(on) => setField("sipsMultiplier", on ? 2 : 1)}
            />
            <ToggleRow
              label="Sens inversé au départ"
              description="La première manche tourne dans l'autre sens."
              checked={form.startDirection === "ccw"}
              onChange={(on) => setField("startDirection", on ? "ccw" : "cw")}
            />
            <ToggleRow
              label="Premier joueur au hasard"
              description="Sinon, l'hôte commence la partie."
              checked={form.randomFirstPlayer}
              onChange={(on) => setField("randomFirstPlayer", on)}
            />
          </CardContent>
        </Card>

        {/* 3 bis) Cartes Joker */}
        <Card>
          <CardHeader>
            <CardTitle>Cartes Joker</CardTitle>
            <CardDescription>
              Des cartes spéciales aux effets imprévisibles, mélangées au paquet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleRow
              label="Activer les cartes Joker"
              description="Ajoute les Jokers sélectionnés au paquet au lancement."
              checked={jokersEnabled}
              onChange={(on) => void handleToggleJokers(on)}
            />

            {jokersEnabled && (
              <>
                {/* Sélection courante */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>
                      Sélection ({jokerPowers.length}/{MAX_JOKERS})
                    </Label>
                    {savingJokers && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {jokerPowers.length > 0 ? (
                    <ul className="space-y-2">
                      {jokerPowers.map((power, i) => {
                        const def = JOKER_CATALOG.find((d) => d.power === power);
                        return (
                          <li
                            key={`${power}-${i}`}
                            className="flex items-center gap-3 rounded-lg border p-2"
                          >
                            <span className="text-xl">{def?.icon ?? "🃏"}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {def?.label ?? power}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {def?.description}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeJokerAt(i)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                              <span className="sr-only">Retirer</span>
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                      Aucun Joker sélectionné. Choisis-en jusqu&apos;à {MAX_JOKERS}.
                    </p>
                  )}
                </div>

                {/* Catalogue */}
                <div className="space-y-2">
                  <Label>Catalogue des pouvoirs</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {JOKER_CATALOG.map((def) => {
                      const full = jokerPowers.length >= MAX_JOKERS;
                      return (
                        <button
                          key={def.power}
                          type="button"
                          onClick={() => addJoker(def.power)}
                          disabled={full}
                          className="flex flex-col gap-1 rounded-lg border p-3 text-left transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className="flex items-center gap-2 text-sm font-semibold">
                            <span className="text-lg">{def.icon}</span>
                            {def.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {def.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Les répétitions sont autorisées (ex. deux « Reset à zéro »).
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 4) Résumé scrollable des règles actives */}
        <Card>
          <CardHeader>
            <CardTitle>Aperçu avant lancement</CardTitle>
            <CardDescription>
              Vérifie l&apos;ensemble des règles actives.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm">
              <SummaryLine label="Roi" value={`fixe le total à ${form.kingValue}`} />
              <SummaryLine
                label="Valet"
                value={`${form.jackDelta >= 0 ? "+" : ""}${form.jackDelta} au total`}
              />
              <SummaryLine
                label="As"
                value={`${form.aceLow} ou ${form.aceHigh}`}
              />
              <SummaryLine
                label="Paliers"
                value={`multiples de ${form.sipStep} entre ${form.sipRangeLo} et ${form.sipRangeHi}`}
              />
              <SummaryLine
                label="Multiplicateur"
                value={`x${form.sipsMultiplier}`}
              />
              <SummaryLine
                label="Distribution"
                value={ASSIGNED_BY_LABELS[form.sipAssignedBy]}
              />
              <SummaryLine
                label="Après une perte"
                value={
                  form.firstPlayerAfterLoss === "host"
                    ? "l'hôte rejoue"
                    : "le perdant rejoue"
                }
              />
              <SummaryLine
                label="Sens au départ"
                value={form.startDirection === "ccw" ? "anti-horaire" : "horaire"}
              />
              <SummaryLine
                label="Premier joueur"
                value={form.randomFirstPlayer ? "au hasard" : "l'hôte"}
              />
              <SummaryLine
                label="Cartes Joker"
                value={
                  jokersEnabled
                    ? jokerPowers.length > 0
                      ? `${jokerPowers.length} active${jokerPowers.length > 1 ? "s" : ""}`
                      : "activées (aucune choisie)"
                    : "désactivées"
                }
              />
              <div className="pt-2">
                <p className="font-semibold">
                  Règles personnalisées ({rules.length})
                </p>
                {rules.length === 0 ? (
                  <p className="text-muted-foreground">aucune</p>
                ) : (
                  <ul className="list-disc pl-5">
                    {rules.map((r) => (
                      <li key={r.id}>
                        <span className="font-medium">
                          {CARD_TARGET_LABELS[r.card_value as CardRuleTarget] ??
                            r.card_value}
                        </span>{" "}
                        — {r.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* Pied : enregistrer */}
      <div className="sticky bottom-0 border-t bg-background pt-4">
        <Button
          className="w-full"
          size="lg"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : savedAt ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {savedAt ? "Enregistré" : "Enregistrer les règles de base"}
        </Button>
        <p className="pt-2 text-center text-xs text-muted-foreground">
          Les règles par carte sont enregistrées automatiquement.
        </p>
      </div>
    </main>
  );
}

// --- Sous-composants locaux ---------------------------------------------------

function NumberField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
