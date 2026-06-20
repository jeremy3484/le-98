"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Loader2 } from "lucide-react";

interface QrScannerProps {
  /** Appelé avec le texte décodé du premier QR détecté. */
  onResult: (text: string) => void;
  onError?: (message: string) => void;
}

const REGION_ID = "qr-scanner-region";

/**
 * Scanner de QR code via la caméra (html5-qrcode).
 * Démarre la caméra arrière au montage, s'arrête proprement au démontage.
 */
export function QrScanner({ onResult, onError }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(REGION_ID, { verbose: false });
    scannerRef.current = scanner;
    let cancelled = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (handledRef.current) return;
          handledRef.current = true;
          onResult(decodedText);
        },
        () => {
          // Échecs de décodage par frame : ignorés.
        },
      )
      .then(() => {
        if (!cancelled) setStarting(false);
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : "Impossible d'accéder à la caméra.";
        if (!cancelled) {
          setError(msg);
          setStarting(false);
        }
        onError?.(msg);
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {
            /* déjà arrêté */
          });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div
        id={REGION_ID}
        className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted"
      />
      {starting && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Démarrage de la caméra…
        </p>
      )}
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
