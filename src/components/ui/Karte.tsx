import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Karte — die Grundflaeche fuer alle Inhalte. Tiefe entsteht ueber eine feine
 * Linie, nicht ueber Schlagschatten; das haelt Listenansichten ruhig.
 */
export function Karte({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-gross)] border border-linie bg-flaeche",
        "shadow-[var(--schatten-klein)]",
        className,
      )}
      {...props}
    />
  );
}

export function KarteKopf({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-b border-linie px-5 py-4", className)}
      {...props}
    />
  );
}

export function KarteTitel({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-titel text-[15px] font-semibold text-text", className)}
      {...props}
    />
  );
}

export function KarteBeschreibung({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("mt-1 text-[13px] text-gedaempft", className)} {...props} />
  );
}

export function KarteInhalt({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
