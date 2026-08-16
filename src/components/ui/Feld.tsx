import * as React from "react";

import { cn } from "@/lib/cn";

const eingabeStil = cn(
  "w-full rounded-[var(--radius)] border border-linie-stark bg-flaeche",
  "px-3 py-2 text-sm text-text placeholder:text-gedaempft",
  "transition-colors hover:border-akzent/50",
  "disabled:cursor-not-allowed disabled:opacity-60",
  "aria-[invalid=true]:border-fehler",
);

export const Eingabe = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Eingabe({ className, ...props }, ref) {
  return <input ref={ref} className={cn(eingabeStil, className)} {...props} />;
});

export const Textfeld = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textfeld({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(eingabeStil, "min-h-24 resize-y", className)}
      {...props}
    />
  );
});

export const Auswahl = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Auswahl({ className, ...props }, ref) {
  return <select ref={ref} className={cn(eingabeStil, className)} {...props} />;
});

interface FeldProps {
  /** Sichtbare Beschriftung. Pflicht — Platzhalter ersetzen keine Beschriftung. */
  beschriftung: string;
  /** Feld-ID; verbindet Beschriftung, Hinweis und Fehlermeldung. */
  id: string;
  hinweis?: string;
  fehler?: string;
  pflicht?: boolean;
  children: React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    required?: boolean;
  }>;
}

/**
 * Formularfeld mit Beschriftung, Hinweis und Fehlermeldung.
 *
 * Die Verknuepfung ueber `aria-describedby` und `aria-invalid` wird hier zentral
 * gesetzt, damit sie nicht an jedem einzelnen Formular vergessen werden kann.
 */
export function Feld({
  beschriftung,
  id,
  hinweis,
  fehler,
  pflicht,
  children,
}: FeldProps) {
  const hinweisId = hinweis ? `${id}-hinweis` : undefined;
  const fehlerId = fehler ? `${id}-fehler` : undefined;
  const beschriebenVon = [hinweisId, fehlerId].filter(Boolean).join(" ");

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-text">
        {beschriftung}
        {pflicht && (
          <span className="ml-0.5 text-fehler" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {React.cloneElement(children, {
        id,
        required: pflicht ?? false,
        "aria-invalid": Boolean(fehler),
        ...(beschriebenVon ? { "aria-describedby": beschriebenVon } : {}),
      })}

      {hinweis && !fehler && (
        <p id={hinweisId} className="text-xs text-gedaempft">
          {hinweis}
        </p>
      )}
      {fehler && (
        <p id={fehlerId} className="text-xs text-fehler" role="alert">
          {fehler}
        </p>
      )}
    </div>
  );
}
