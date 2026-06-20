"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
import { cn } from "@/lib/utils";

type Mode = "password" | "magic";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [redirectTo, setRedirectTo] = useState("/lobby");

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("redirect");
    if (r && r.startsWith("/")) setRedirectTo(r);
  }, []);

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    router.replace(redirectTo);
    router.refresh();
  }

  async function handleMagic(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
          redirectTo,
        )}`,
      },
    });
    setSubmitting(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setMagicSent(true);
  }

  if (magicSent) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <MailCheck className="h-6 w-6 text-emerald-600" />
            </div>
            <CardTitle>Lien envoyé</CardTitle>
            <CardDescription>
              Un lien de connexion a été envoyé à <b>{email}</b>. Ouvrez-le sur
              cet appareil pour vous connecter.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => setMagicSent(false)}>
              Utiliser un mot de passe
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
          <CardTitle className="mt-2 text-2xl">Connexion</CardTitle>
          <CardDescription>Content de te revoir au Jeu du 98.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/50 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("password")}
              className={cn(
                "rounded-lg py-2 font-medium transition",
                mode === "password"
                  ? "bg-primary/20 text-foreground shadow-sm ring-1 ring-primary/30"
                  : "text-muted-foreground",
              )}
            >
              Mot de passe
            </button>
            <button
              type="button"
              onClick={() => setMode("magic")}
              className={cn(
                "rounded-lg py-2 font-medium transition",
                mode === "magic"
                  ? "bg-primary/20 text-foreground shadow-sm ring-1 ring-primary/30"
                  : "text-muted-foreground",
              )}
            >
              Lien magique
            </button>
          </div>

          {mode === "password" ? (
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                />
              </div>
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !emailOk || password.length === 0}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Se connecter
              </Button>
            </form>
          ) : (
            <form onSubmit={handleMagic} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="magic-email">Email</Label>
                <Input
                  id="magic-email"
                  type="email"
                  autoComplete="email"
                  placeholder="toi@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !emailOk}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Recevoir un lien magique
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link
              href="/signup"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Créer un profil
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
