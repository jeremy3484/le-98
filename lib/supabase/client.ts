import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase pour les Composants Client ("use client").
 * Utilise la clé publique anon — toutes les requêtes passent par la RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
