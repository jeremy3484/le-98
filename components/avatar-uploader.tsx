"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { cropImageToSquare } from "@/lib/image/crop-square";
import { PlayerAvatar } from "@/components/player-avatar";
import { cn } from "@/lib/utils";

const MAX_FILE_MB = 8;

/**
 * Sélecteur d'avatar : clic → choix fichier → recadrage carré auto → aperçu.
 * Remonte au parent le Blob recadré + l'URL d'aperçu via `onCropped`.
 */
export function AvatarUploader({
  name,
  previewUrl,
  onCropped,
  onClear,
  size = 112,
  disabled,
}: {
  /** Pseudo, pour le fallback initiales. */
  name: string;
  /** URL d'aperçu actuelle (object URL ou avatar_url distant). */
  previewUrl?: string | null;
  onCropped: (blob: Blob, previewUrl: string) => void;
  onClear?: () => void;
  size?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Choisissez un fichier image");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Image trop lourde (max ${MAX_FILE_MB} Mo)`);
      return;
    }

    setBusy(true);
    try {
      const blob = await cropImageToSquare(file, 256);
      const url = URL.createObjectURL(blob);
      onCropped(blob, url);
    } catch {
      setError("Impossible de traiter l'image");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className={cn(
            "group relative block rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:opacity-60",
          )}
          aria-label="Choisir une photo de profil"
        >
          <PlayerAvatar name={name || "?"} avatarUrl={previewUrl} size={size} />
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100",
              busy && "opacity-100",
            )}
          >
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Camera className="h-6 w-6" />
            )}
          </span>
        </button>

        {previewUrl && onClear && !disabled && (
          <button
            type="button"
            onClick={onClear}
            className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
            aria-label="Retirer la photo"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {previewUrl ? "Changer la photo" : "Ajouter une photo (optionnel)"}
      </button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
