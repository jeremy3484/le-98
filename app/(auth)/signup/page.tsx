"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadAvatar } from "@/lib/supabase/avatar";
import { PseudoField, type PseudoStatus } from "@/components/pseudo-field";
import { AvatarUploader } from "@/components/avatar-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [pseudo, setPseudo] = useState("");
  const [pseudoStatus, setPseudoStatus] = useState<PseudoStatus>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [isAdult, setIsAdult] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const passwordOk = password.length >= 6;
  const canSubmit =
    pseudoStatus === "available" &&
    emailOk &&
    passwordOk &&
    isAdult &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { pseudo: pseudo.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        // Violation d'unicité du pseudo levée par le trigger handle_new_user.
        if (/duplicate|unique|pseudo/i.test(signUpError.message)) {
          setError("Ce pseudo vient d'être pris, choisissez-en un autre.");
        } else {
          setError(signUpError.message);
        }
        return;
      }

      // Email à confirmer : pas de session immédiate.
      if (!data.session) {
        setEmailSent(true);
        return;
      }

      // Session disponible : upload de l'avatar puis redirection.
      const userId = data.user!.id;
      if (avatarBlob) {
        try {
          const url = await uploadAvatar(supabase, userId, avatarBlob);
          await supabase
            .from("profiles")
            .update({ avatar_url: url })
            .eq("id", userId);
        } catch {
          // Non bloquant : l'avatar pourra être ajouté depuis le profil.
        }
      }

      router.replace("/lobby");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (emailSent) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <MailCheck className="h-6 w-6 text-emerald-600" />
            </div>
            <CardTitle>Vérifiez vos emails</CardTitle>
            <CardDescription>
              Un lien de confirmation a été envoyé à <b>{email}</b>. Cliquez
              dessus pour activer votre compte.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" asChild>
              <Link href="/login">Retour à la connexion</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <span className="mx-auto font-display text-5xl font-black leading-none text-gradient-festive">
            98
          </span>
          <CardTitle className="mt-2 text-2xl">Créer ton profil</CardTitle>
          <CardDescription>
            Pseudo + photo, et c&apos;est parti. Moins de 30 secondes.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            <AvatarUploader
              name={pseudo || "?"}
              previewUrl={avatarPreview}
              onCropped={(blob, url) => {
                setAvatarBlob(blob);
                setAvatarPreview(url);
              }}
              onClear={() => {
                setAvatarBlob(null);
                setAvatarPreview(null);
              }}
              disabled={submitting}
            />

            <PseudoField
              value={pseudo}
              onChange={setPseudo}
              onStatusChange={setPseudoStatus}
              autoFocus
              disabled={submitting}
            />

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="toi@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="6 caractères minimum"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/30 p-3">
              <input
                type="checkbox"
                checked={isAdult}
                onChange={(e) => setIsAdult(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--neon-lime))]"
              />
              <span className="text-sm text-muted-foreground">
                Je certifie être{" "}
                <span className="font-semibold text-foreground">majeur·e</span>{" "}
                et m&apos;engage à jouer de manière responsable.
              </span>
            </label>

            {error && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </CardContent>

          <CardFooter className="flex-col gap-3">
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={!canSubmit}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer mon compte
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Déjà un compte ?{" "}
              <Link
                href="/login"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Se connecter
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
