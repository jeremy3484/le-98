"use client";

import { QRCodeSVG } from "qrcode.react";

interface QRCodeProps {
  /** Contenu encodé (ex: lien de rejoint direct). */
  value: string;
  size?: number;
  className?: string;
}

/** Affiche un QR code (SVG) sur fond blanc, prêt à être scanné. */
export function QRCode({ value, size = 200, className }: QRCodeProps) {
  return (
    <div
      className={className}
      style={{ background: "#fff", padding: 12, borderRadius: 12 }}
    >
      <QRCodeSVG value={value} size={size} level="M" includeMargin={false} />
    </div>
  );
}
