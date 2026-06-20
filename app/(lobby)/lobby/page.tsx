"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Plus, QrCode, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/use-user";
import { createRoom, joinRoom } from "@/lib/supabase/rooms";
import { PlayerAvatar } from "@/components/player-avatar";
import { QrScanner } from "@/components/qr-scanner";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/** Extrait un code de room depuis un texte scanné (URL /join/CODE ou code brut). */
function extractCode(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/\/join\/([A-Za-z0-9]+)/);
  if (match) return match[1];
  return trimmed;
}

export default function LobbyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { profile, loading, signOut } = useUser();

  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const room = await createRoom(supabase);
      router.push(`/game/${room.id}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de création.");
      setCreating(false);
    }
  }

  async function doJoin(rawCode: string) {
    setError(null);
    setJoining(true);
    try {
      const room = await joinRoom(supabase, rawCode);
      router.push(`/game/${room.id}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur pour rejoindre.");
      setJoining(false);
    }
  }

  function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || joining) return;
    void doJoin(code);
  }

  function handleScanResult(text: string) {
    setScanOpen(false);
    void doJoin(extractCode(text));
  }

  if (loading || !profile) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const busy = creating || joining;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col p-4">
      <header className="flex items-center justify-between border-b pb-4">
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-lg p-1 transition hover:bg-muted"
        >
          <PlayerAvatar
            name={profile.pseudo}
            avatarUrl={profile.avatar_url}
            size={44}
          />
          <div className="leading-tight">
            <p className="font-semibold">{profile.pseudo}</p>
            <p className="text-xs text-muted-foreground">Voir mon profil</p>
          </div>
        </Link>
        <Button variant="ghost" size="icon" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Déconnexion</span>
        </Button>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-6 py-8">
        <div className="text-center">
          <span className="font-display text-7xl font-black leading-none text-gradient-festive">
            98
          </span>
          <h1 className="mt-3 font-display text-2xl font-bold">Prêt à jouer ?</h1>
          <p className="text-muted-foreground">
            Crée une partie ou rejoins tes amis.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Nouvelle partie</CardTitle>
            <CardDescription>
              Tu deviens l&apos;hôte et tu invites les autres.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              size="lg"
              onClick={handleCreate}
              disabled={busy}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Créer une partie
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rejoindre une partie</CardTitle>
            <CardDescription>
              Saisis le code ou scanne le QR de l&apos;hôte.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={handleJoinSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="code">Code de la partie</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Ex : K7M2P"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={6}
                  disabled={busy}
                  className="text-center text-lg font-semibold tracking-[0.3em]"
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                className="w-full"
                disabled={busy || !code.trim()}
              >
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Rejoindre
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setError(null);
                setScanOpen(true);
              }}
              disabled={busy}
            >
              <QrCode className="h-4 w-4" />
              Scanner un QR code
            </Button>
          </CardContent>
        </Card>

        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <footer className="pb-4 pt-2 text-center text-xs text-muted-foreground">
        🥂 Joue de manière responsable — l&apos;abus d&apos;alcool est dangereux
        pour la santé.
      </footer>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scanner le QR code</DialogTitle>
            <DialogDescription>
              Vise le QR code affiché par l&apos;hôte de la partie.
            </DialogDescription>
          </DialogHeader>
          {scanOpen && (
            <QrScanner
              onResult={handleScanResult}
              onError={(msg) => setError(msg)}
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
