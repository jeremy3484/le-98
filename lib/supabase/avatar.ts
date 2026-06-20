import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "avatars";

/**
 * Upload un avatar (Blob déjà recadré) dans le bucket public "avatars",
 * dans le dossier de l'utilisateur (`<uid>/...`) pour satisfaire la RLS Storage.
 * Renvoie l'URL publique.
 */
export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  blob: Blob,
): Promise<string> {
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: "3600",
    upsert: true,
    contentType: blob.type || "image/webp",
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
