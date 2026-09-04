import Link from "next/link";

import { Symbol } from "@/components/Symbole";
import { cn } from "@/lib/cn";
import type { Modulkachel } from "@/lib/kacheln";

/**
 * Kachel-Raster einer Modulseite (Referenz: jede Kachel der Startseite oeffnet
 * wieder Kacheln). Kacheln ohne Gegenstueck zeigen ihren Hinweis statt eines
 * Links — der Umfang bleibt sichtbar, nichts wird vorgetaeuscht.
 */
export function Modulkacheln({ kacheln, zaehler }: { kacheln: Modulkachel[]; zaehler?: Record<string, { zahl: number | string; hinweis: string; betont?: boolean }> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {kacheln.map((k, i) => {
        const z = zaehler?.[k.titel];
        const inhalt = (
          <>
            <div className="flex items-start justify-between gap-3">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)]", k.hinweis === "nicht im Umfang" || k.hinweis === "in Vorbereitung" ? "bg-flaeche-gedaempft text-gedaempft" : z?.betont ? "bg-akzent text-akzent-text" : "bg-akzent-schwach text-akzent")}>
                <Symbol name={k.symbol} className="size-5" />
              </span>
              {z && !k.hinweis && (
                <span className="text-right">
                  <span className="zahl block font-titel text-xl leading-none font-semibold text-text">{z.zahl}</span>
                  <span className="mt-1 block text-[11px] leading-tight text-gedaempft">{z.hinweis}</span>
                </span>
              )}
              {k.hinweis && <span className="rounded-[var(--radius-klein)] border border-linie px-1.5 py-0.5 text-[10px] tracking-wide text-gedaempft uppercase">{k.hinweis}</span>}
              {!z && !k.hinweis && <span className="zahl text-[11px] text-gedaempft">{String(i + 1).padStart(2, "0")}</span>}
            </div>
            <div className="mt-4">
              <p className={cn("font-titel text-[15px] font-semibold", k.hinweis === "nicht im Umfang" || k.hinweis === "in Vorbereitung" ? "text-gedaempft" : "text-text")}>{k.titel}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-gedaempft">{k.untertitel}</p>
              {k.erklaerung && <p className="mt-2 text-[11.5px] leading-snug text-gedaempft/80">{k.erklaerung}</p>}
            </div>
          </>
        );
        const stil = "flex h-full flex-col rounded-[var(--radius-gross)] border bg-flaeche p-5 shadow-[var(--schatten-klein)] transition-colors";
        if (!k.pfad) return <div key={k.titel} className={cn(stil, "border-linie opacity-75")} aria-disabled="true">{inhalt}</div>;
        return <Link key={k.titel} href={k.pfad} className={cn(stil, "border-linie hover:border-akzent/60 focus-visible:border-akzent")}>{inhalt}</Link>;
      })}
    </div>
  );
}

/** Rueckweg zur Startseite, wie in der Referenz unter jeder Modulseite. */
export function ZurueckZurUebersicht() {
  return (
    <p className="mt-8 text-[13px]">
      <Link href="/dashboard" className="text-akzent hover:underline">← Zurück zur Übersicht</Link>
    </p>
  );
}
