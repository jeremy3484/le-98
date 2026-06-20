"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadAvatar } from "@/lib/supabase/avatar";
import { useUser } from "@/lib/supabase/use-user";
import {
  PseudoField,
  type PseudoStatus,
} from "@/components/pseudo-field";
import { AvatarUploader } from "@/components/avatar-uploader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, loading, refreshProfile, signOut } = useUser();

  const [pseudo, setPseudo] = useState("");
  const [pseudoStatus, setPseudoStatus] = useState<PseudoStatus>("idle");
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Initialise le formulaire dès que le profil est disponible.
  useEffect(() => {
    if (profile) {
      setPseudo(profile.pseudo);
      setAvatarPreview(profile.avatar_url);
    }
  }, [profile]);

  const dirty =
    (profile && pseudo.trim() !== profile.pseudo) ||
    avatarBlob !== null ||
    removeAvatar;

  const pseudoValid =
    profile &&
    (pseudo.trim().toLowerCase() === profile.pseudo.toLowerCase() ||
      pseudoStatus === "available");

  const canSave = Boolean(dirty && pseudoValid && !saving);

  async function handleSave() {
    if (!user || !profile || !canSave) return;
    setError(null);
    setSaving(true);
    setSaved(false);

    try {
      let nextAvatarUrl: string | null = profile.avatar_url;

      if (avatarBlob) {
        nextAvatarUrl = await uploadAvatar(supabase, user.id, avatarBlob);
      } else if (removeAvatar) {
        nextAvatarUrl = null;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          pseudo: pseudo.trim(),
          avatar_url: nextAvatarUrl,
        })
        .eq("id", user.id);

      if (updateError) {
        if (/duplicate|unique|pseudo/i.test(updateError.message)) {
          setError("Ce pseudo est déjà pris.");
        } else {
          setError(updateError.message);
        }
        return;
      }

      await refreshProfile();
      setAvatarBlob(null);
      setRemoveAvatar(false);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Échec de l'enregistrement.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  if (loading || !profile) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/lobby">
            <ArrowLeft className="h-4 w-4" />
            Lobby
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          Déconnexion
        </Button>
      </div>

      <Card>
        <CardHeader className="text-center">
          <span className="mx-auto font-display text-4xl font-black leading-none text-gradient-festive">
            98
          </span>
          <CardTitle className="mt-2 text-2xl">Mon profil</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          <AvatarUploader
            name={pseudo || profile.pseudo}
            previewUrl={avatarPreview}
            onCropped={(blob, url) => {
              setAvatarBlob(blob);
              setAvatarPreview(url);
              setRemoveAvatar(false);
              setSaved(false);
            }}
            onClear={() => {
              setAvatarBlob(null);
              setAvatarPreview(null);
              setRemoveAvatar(true);
              setSaved(false);
            }}
            disabled={saving}
          />

          <PseudoField
            value={pseudo}
            onChange={(v) => {
              setPseudo(v);
              setSaved(false);
            }}
            onStatusChange={setPseudoStatus}
            currentPseudo={profile.pseudo}
            disabled={saving}
          />

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && !dirty && (
            <p className="flex items-center gap-1.5 text-sm text-accent">
              <Check className="h-4 w-4" /> Profil enregistré
            </p>
          )}
        </CardContent>

        <CardFooter>
          <Button className="w-full" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
