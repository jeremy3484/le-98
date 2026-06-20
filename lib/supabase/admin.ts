import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase "admin" côté serveur UNIQUEMENT.
 * Utilise la clé service_role qui BYPASS la RLS — ne jamais importer côté client.
 * À réserver aux opérations de confiance du moteur de jeu (distribution des cartes,
 * résolution de tour côté serveur, etc.).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
