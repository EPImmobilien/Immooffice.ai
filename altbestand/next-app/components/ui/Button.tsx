import * as React from "react";

import { cn } from "@/lib/cn";

type Variante = "primaer" | "sekundaer" | "leise" | "gefahr";
type Groesse = "klein" | "standard" | "gross";

const varianten: Record<Variante, string> = {
  primaer:
    "bg-primaer text-primaer-text hover:bg-primaer-hover border border-transparent",
  sekundaer:
    "bg-flaeche text-text border border-linie-stark hover:bg-flaeche-gedaempft",
  leise:
    "bg-transparent text-gedaempft border border-transparent hover:bg-flaeche-gedaempft hover:text-text",
  gefahr:
    "bg-fehler text-fehler-text hover:opacity-90 border border-transparent",
};

const groessen: Record<Groesse, string> = {
  klein: "h-8 px-3 text-[13px] gap-1.5",
  standard: "h-10 px-4 text-sm gap-2",
  gross: "h-12 px-6 text-[15px] gap-2",
};

/**
 * Liefert die Schaltflaechen-Klassen fuer Elemente, die keine <button> sind.
 *
 * Fuer Navigation gehoert ein <a>/<Link> verwendet — ein Link in einer
 * Schaltflaeche zu verschachteln waere ungueltiges Markup und bricht die
 * Tastaturbedienung.
 */
export function buttonKlassen({
  variante = "primaer",
  groesse = "standard",
  className,
}: {
  variante?: Variante;
  groesse?: Groesse;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center rounded-[var(--radius)]",
    "font-medium whitespace-nowrap transition-colors",
    varianten[variante],
    groessen[groesse],
    className,
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  groesse?: Groesse;
  laedt?: boolean;
}

/**
 * Schaltflaeche des Designsystems.
 *
 * `laedt` blockiert die Schaltflaeche und meldet den Zustand zusaetzlich an
 * Screenreader — wichtig bei KI- und Exportvorgaengen, die spuerbar dauern.
 */
export function Button({
  className,
  variante = "primaer",
  groesse = "standard",
  laedt = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius)]",
        "font-medium whitespace-nowrap transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        varianten[variante],
        groessen[groesse],
        className,
      )}
      disabled={disabled || laedt}
      aria-busy={laedt || undefined}
      {...props}
    >
      {laedt && (
        <span
          aria-hidden="true"
          className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
