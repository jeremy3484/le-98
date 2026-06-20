"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/use-user";
import { joinRoom } from "@/lib/supabase/rooms";
import { Button } from "@/components/ui/button";

/**
 * Rejoint automatiquement une partie depuis un lien direct (QR code).
 * La route est protégée par le middleware : un visiteur non connecté est
 * redirigé vers /login?redirect=/join/CODE puis revient ici après connexion.
 */
export default function JoinByCodePage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code;
  const supabase = useMemo(() => createClient(), []);
  const { user, loading } = useUser();

  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (loading || !user || attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        const room = await joinRoom(supabase, code);
        router.replace(`/game/${room.id}/lobby`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de rejoindre.");
      }
    })();
  }, [loading, user, supabase, code, router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-4 text-center">
      {error ? (
        <>
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => router.replace("/lobby")}>
            <ArrowLeft className="h-4 w-4" />
            Retour au lobby
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-6xl font-black leading-none text-gradient-festive">
            98
          </span>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Connexion à la partie {code}…
          </p>
        </div>
      )}
    </main>
  );
}
