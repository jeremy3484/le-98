"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PseudoStatus =
  | "idle"
  | "invalid"
  | "checking"
  | "available"
  | "taken"
  | "error";

const PSEUDO_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function validatePseudoFormat(value: string): string | null {
  const v = value.trim();
  if (v.length < 3) return "3 caractères minimum";
  if (v.length > 20) return "20 caractères maximum";
  if (!PSEUDO_RE.test(v)) return "Lettres, chiffres et _ uniquement";
  return null;
}

export function PseudoField({
  value,
  onChange,
  onStatusChange,
  /** Pseudo actuel de l'utilisateur (considéré comme "disponible"). */
  currentPseudo,
  id = "pseudo",
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onStatusChange?: (status: PseudoStatus) => void;
  currentPseudo?: string;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const supabase = useRef(createClient()).current;
  const [status, setStatus] = useState<PseudoStatus>("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    onStatusChange?.(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    const v = value.trim();

    if (v.length === 0) {
      setStatus("idle");
      setMessage("");
      return;
    }

    if (currentPseudo && v.toLowerCase() === currentPseudo.toLowerCase()) {
      setStatus("available");
      setMessage("C'est votre pseudo actuel");
      return;
    }

    const formatError = validatePseudoFormat(v);
    if (formatError) {
      setStatus("invalid");
      setMessage(formatError);
      return;
    }

    setStatus("checking");
    setMessage("Vérification…");

    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("is_pseudo_available", {
        p_pseudo: v,
      });
      if (cancelled) return;
      if (error) {
        setStatus("error");
        setMessage("Impossible de vérifier, réessayez");
        return;
      }
      if (data) {
        setStatus("available");
        setMessage("Pseudo disponible");
      } else {
        setStatus("taken");
        setMessage("Pseudo déjà pris");
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, currentPseudo, supabase]);

  const tone =
    status === "available"
      ? "text-emerald-600"
      : status === "taken" || status === "invalid" || status === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Pseudo</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ex: Maxime98"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          maxLength={20}
          aria-invalid={
            status === "taken" || status === "invalid" || status === "error"
          }
          className={cn(
            "pr-9",
            status === "available" &&
              "border-emerald-500 focus-visible:ring-emerald-500",
          )}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {status === "checking" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {status === "available" && (
            <Check className="h-4 w-4 text-emerald-600" />
          )}
          {(status === "taken" ||
            status === "invalid" ||
            status === "error") && <X className="h-4 w-4 text-destructive" />}
        </span>
      </div>
      <p className={cn("min-h-[1rem] text-xs", tone)}>{message}</p>
    </div>
  );
}
