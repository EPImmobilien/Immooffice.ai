import * as React from "react";

import { cn } from "@/lib/cn";

type Ton = "neutral" | "erfolg" | "warnung" | "fehler" | "info" | "akzent";

const toene: Record<Ton, string> = {
  neutral: "bg-flaeche-gedaempft text-gedaempft border-linie",
  erfolg: "bg-erfolg-schwach text-erfolg border-erfolg/25",
  warnung: "bg-warnung-schwach text-warnung border-warnung/25",
  fehler: "bg-fehler-schwach text-fehler border-fehler/25",
  info: "bg-info-schwach text-info border-info/25",
  akzent: "bg-akzent-schwach text-akzent border-akzent/30",
};

/** Kompakte Zustandsmarkierung, etwa fuer Vermarktungs- oder Vertragsstatus. */
export function Marke({
  ton = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { ton?: Ton }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-klein)] border",
        "px-2 py-0.5 text-[12px] font-medium whitespace-nowrap",
        toene[ton],
        className,
      )}
      {...props}
    />
  );
}

/** Auffaelligerer Hinweisblock fuer Meldungen im Seitenfluss. */
export function Hinweis({
  ton = "info",
  titel,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ton?: Ton; titel?: string }) {
  return (
    <div
      role={ton === "fehler" ? "alert" : "status"}
      className={cn(
        "rounded-[var(--radius)] border px-4 py-3 text-[13px]",
        toene[ton],
        className,
      )}
      {...props}
    >
      {titel && <p className="mb-0.5 font-semibold">{titel}</p>}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * Kennzeichnung KI-erzeugter oder KI-bearbeiteter Inhalte.
 *
 * Master-Prompt Abschnitt 10 verlangt eine sichtbare Kennzeichnung, die auch in
 * Exporten und Web-Exposés erhalten bleibt. Deshalb ist das eine eigenstaendige
 * Komponente und keine beliebig setzbare Marke: Wer KI-Ergebnisse anzeigt, soll
 * genau dieses Bauteil verwenden.
 */
export function KiKennzeichen({
  art = "bearbeitet",
  className,
}: {
  art?: "bearbeitet" | "erzeugt" | "moebliert";
  className?: string;
}) {
  const text = {
    bearbeitet: "KI-bearbeitet",
    erzeugt: "KI-erzeugt",
    moebliert: "Digital möbliert",
  }[art];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-klein)]",
        "border border-akzent/40 bg-akzent-schwach px-1.5 py-0.5",
        "text-[11px] font-semibold tracking-wide text-akzent uppercase",
        className,
      )}
      title="Dieser Inhalt wurde mit künstlicher Intelligenz erzeugt oder bearbeitet."
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3 shrink-0"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6 0.5 7.2 4.2 11 5.4 7.2 6.6 6 10.3 4.8 6.6 1 5.4 4.8 4.2Z" />
      </svg>
      {text}
    </span>
  );
}
