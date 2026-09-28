import Link from "next/link";

import { Symbol, type SymbolName } from "@/components/Symbole";
import { cn } from "@/lib/cn";

/**
 * Modulkachel der Startseite.
 *
 * Das Kachel-Prinzip stammt aus der Referenz und hat sich dort bewaehrt: Der
 * Einstieg zeigt alle Arbeitsbereiche auf einen Blick, statt sie in einem
 * Menue zu verstecken. Die Gestaltung ist bewusst eigenstaendig (Abschnitt 3) —
 * ruhiges Raster, eine Akzentfarbe, Zahlen statt Dekoration.
 *
 * Kacheln ohne Funktion werden nicht versteckt, sondern sichtbar als geplant
 * gekennzeichnet. Das zeigt den Umfang ehrlich, statt einen Funktionsstand
 * vorzutaeuschen.
 */
export interface KachelDaten {
  titel: string;
  hinweis: string;
  symbol: SymbolName;
  pfad?: string;
  /** Kennzahl, die den aktuellen Stand zeigt. */
  zahl?: number | string;
  zahlHinweis?: string;
  /** Hebt die Kachel hervor — für den Bereich, in dem gerade Arbeit liegt. */
  betont?: boolean;
  geplant?: boolean;
}

export function Kachel({ daten }: { daten: KachelDaten }) {
  const {
    titel,
    hinweis,
    symbol,
    pfad,
    zahl,
    zahlHinweis,
    betont,
    geplant,
  } = daten;

  const inhalt = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)]",
            geplant
              ? "bg-flaeche-gedaempft text-gedaempft"
              : betont
                ? "bg-akzent text-akzent-text"
                : "bg-akzent-schwach text-akzent",
          )}
        >
          <Symbol name={symbol} className="size-5" />
        </span>

        {zahl !== undefined && !geplant && (
          <span className="text-right">
            <span className="zahl block font-titel text-xl leading-none font-semibold text-text">
              {zahl}
            </span>
            {zahlHinweis && (
              <span className="mt-1 block text-[11px] leading-tight text-gedaempft">
                {zahlHinweis}
              </span>
            )}
          </span>
        )}

        {geplant && (
          <span className="rounded-[var(--radius-klein)] border border-linie px-1.5 py-0.5 text-[10px] tracking-wide text-gedaempft uppercase">
            geplant
          </span>
        )}
      </div>

      <div className="mt-4">
        <p
          className={cn(
            "font-titel text-[15px] font-semibold",
            geplant ? "text-gedaempft" : "text-text",
          )}
        >
          {titel}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-gedaempft">
          {hinweis}
        </p>
      </div>
    </>
  );

  const grundstil = cn(
    "flex h-full flex-col rounded-[var(--radius-gross)] border bg-flaeche p-5",
    "shadow-[var(--schatten-klein)] transition-colors",
  );

  if (geplant || !pfad) {
    return (
      <div className={cn(grundstil, "border-linie opacity-70")} aria-disabled="true">
        {inhalt}
      </div>
    );
  }

  return (
    <Link
      href={pfad}
      className={cn(
        grundstil,
        "border-linie hover:border-akzent/60 focus-visible:border-akzent",
      )}
    >
      {inhalt}
    </Link>
  );
}

/** Gruppe von Kacheln mit Überschrift. */
export function Kachelgruppe({
  titel,
  kacheln,
}: {
  titel: string;
  kacheln: KachelDaten[];
}) {
  if (kacheln.length === 0) return null;

  return (
    <section className="mb-8 last:mb-0">
      <h2 className="mb-3 text-[12px] font-semibold tracking-wide text-gedaempft uppercase">
        {titel}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {kacheln.map((kachel) => (
          <Kachel key={kachel.titel} daten={kachel} />
        ))}
      </div>
    </section>
  );
}
