"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Palette de fallback — teintes lisibles avec texte blanc. */
const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface PlayerAvatarProps {
  name: string;
  avatarUrl?: string | null;
  /** Diamètre en pixels (défaut 40). */
  size?: number;
  /** Affiche un anneau autour de l'avatar (ex: joueur actif). */
  ring?: boolean;
  ringClassName?: string;
  className?: string;
}

/**
 * Avatar circulaire réutilisable.
 * - Affiche la photo si disponible.
 * - Sinon, initiales sur fond coloré déterministe (même couleur pour un pseudo donné).
 */
export function PlayerAvatar({
  name,
  avatarUrl,
  size = 40,
  ring = false,
  ringClassName,
  className,
}: PlayerAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(avatarUrl) && !errored;

  const bg = COLORS[hashString(name || "?") % COLORS.length];
  const initials = initialsOf(name || "?");

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted align-middle",
        ring && "ring-2 ring-offset-2 ring-offset-background",
        ring && (ringClassName ?? "ring-primary"),
        className,
      )}
      style={{ width: size, height: size }}
      title={name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl as string}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
          draggable={false}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-semibold text-white"
          style={{ backgroundColor: bg, fontSize: Math.max(11, size * 0.4) }}
          aria-hidden
        >
          {initials}
        </span>
      )}
    </span>
  );
}
