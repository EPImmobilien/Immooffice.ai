"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Symbol, type SymbolName } from "@/components/Symbole";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { STANDARD_REIHENFOLGE, type KachelEinstellung } from "@/lib/kacheln";
import { kachelnSpeichern } from "@/server/kachel-aktionen";

export interface StartkachelAnzeige {
  id: string;
  titel: string;
  untertitel: string;
  pfad: string;
  symbol: SymbolName;
  /** Kennzahl auf der Kachel (Referenz: „3 Termine heute", „2 ungelesene Mails"). */
  zahl?: number;
  zahlHinweis?: string;
  betont?: boolean;
}

/**
 * Startseite als Kachel-Raster mit Anpassen-Modus (Referenz): Reihenfolge per
 * Drag-and-drop, Ausblenden mit ✕, Liste der ausgeblendeten Kacheln mit
 * „Wieder einblenden", „Standard wiederherstellen". Gespeichert je Benutzer.
 */
export function Startkacheln({ kacheln, einstellung }: { kacheln: StartkachelAnzeige[]; einstellung: KachelEinstellung }) {
  const [anpassen, setAnpassen] = useState(false);
  const [reihenfolge, setReihenfolge] = useState<string[]>(einstellung.reihenfolge);
  const [ausgeblendet, setAusgeblendet] = useState<string[]>(einstellung.ausgeblendet);
  const [ziehe, setZiehe] = useState<string | null>(null);
  const [ueber, setUeber] = useState<string | null>(null);
  const [speichert, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);

  const je = new Map(kacheln.map((k) => [k.id, k]));
  const sichtbar = reihenfolge.map((id) => je.get(id)).filter((k): k is StartkachelAnzeige => Boolean(k) && !ausgeblendet.includes(k!.id));
  const versteckt = reihenfolge.map((id) => je.get(id)).filter((k): k is StartkachelAnzeige => Boolean(k) && ausgeblendet.includes(k!.id));
  const istStandard = reihenfolge.join(",") === STANDARD_REIHENFOLGE.join(",") && ausgeblendet.length === 0;

  const speichern = (naechste: KachelEinstellung | null) => {
    starte(async () => {
      const e = await kachelnSpeichern(naechste);
      setMeldung(e.ok ? null : `Speichern fehlgeschlagen: ${e.fehler ?? "unbekannt"}`);
    });
  };

  const verschieben = (von: string, nach: string) => {
    if (von === nach) return;
    const liste = reihenfolge.filter((id) => id !== von);
    const idx = liste.indexOf(nach);
    liste.splice(idx < 0 ? liste.length : idx, 0, von);
    setReihenfolge(liste);
  };

  const fertig = () => {
    setAnpassen(false);
    speichern({ reihenfolge, ausgeblendet });
  };
  const standard = () => {
    if (!window.confirm("Sortierung und Ausblendungen zurücksetzen? Alle Kacheln werden wieder in Standard-Reihenfolge angezeigt.")) return;
    setReihenfolge(STANDARD_REIHENFOLGE);
    setAusgeblendet([]);
    speichern(null);
  };

  return (
    <section className="mb-8" data-tutorial="kacheln">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold tracking-wide text-gedaempft uppercase">Arbeitsbereiche</h2>
        <div className="flex items-center gap-2">
          {anpassen && !istStandard && <Button type="button" variante="leise" groesse="klein" onClick={standard}>Standard wiederherstellen</Button>}
          <Button type="button" variante={anpassen ? "primaer" : "leise"} groesse="klein" onClick={anpassen ? fertig : () => setAnpassen(true)} disabled={speichert}>
            {anpassen ? "✓ Fertig" : "✎ Anpassen"}
          </Button>
        </div>
      </div>
      {anpassen && <p className="mb-3 text-[12px] text-gedaempft">Anpassen-Modus: Kacheln per Drag-and-drop verschieben oder mit dem ✕ ausblenden.</p>}
      {meldung && <p className="mb-3 text-[12px] text-fehler">{meldung}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sichtbar.map((k, i) => {
          const inhalt = (
            <>
              <div className="flex items-start justify-between gap-3">
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)]", k.betont ? "bg-akzent text-akzent-text" : "bg-akzent-schwach text-akzent")}>
                  <Symbol name={k.symbol} className="size-5" />
                </span>
                {anpassen ? (
                  <button type="button" aria-label={`${k.titel} ausblenden`} title="Ausblenden" className="rounded-[var(--radius-klein)] border border-linie px-1.5 text-[13px] leading-6 text-gedaempft hover:border-fehler hover:text-fehler" onClick={() => setAusgeblendet([...ausgeblendet, k.id])}>✕</button>
                ) : k.zahl !== undefined ? (
                  <span className="text-right">
                    <span className={cn("zahl block font-titel text-xl leading-none font-semibold", k.betont ? "text-akzent" : "text-text")}>{k.zahl}</span>
                    {k.zahlHinweis && <span className="mt-1 block text-[11px] leading-tight text-gedaempft">{k.zahlHinweis}</span>}
                  </span>
                ) : (
                  <span className="zahl text-[11px] text-gedaempft">{String(i + 1).padStart(2, "0")}</span>
                )}
              </div>
              <div className="mt-4">
                <p className="font-titel text-[15px] font-semibold text-text">{k.titel}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-gedaempft">{k.untertitel}</p>
              </div>
            </>
          );
          const stil = cn(
            "flex h-full flex-col rounded-[var(--radius-gross)] border bg-flaeche p-5 shadow-[var(--schatten-klein)] transition-colors",
            ueber === k.id && ziehe && ziehe !== k.id ? "border-akzent ring-2 ring-akzent/30" : "border-linie",
          );
          if (anpassen) {
            return (
              <div
                key={k.id}
                data-tile-id={k.id}
                draggable
                onDragStart={(e) => { setZiehe(k.id); e.dataTransfer.setData("text/plain", k.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); if (ueber !== k.id) setUeber(k.id); }}
                onDragLeave={() => { if (ueber === k.id) setUeber(null); }}
                onDrop={(e) => { e.preventDefault(); const von = e.dataTransfer.getData("text/plain") || ziehe; if (von) verschieben(von, k.id); setZiehe(null); setUeber(null); }}
                onDragEnd={() => { setZiehe(null); setUeber(null); }}
                className={cn(stil, "cursor-grab select-none active:cursor-grabbing", ziehe === k.id && "opacity-50")}
              >
                {inhalt}
              </div>
            );
          }
          return (
            <Link key={k.id} href={k.pfad} data-tile-id={k.id} className={cn(stil, "hover:border-akzent/60 focus-visible:border-akzent")}>
              {inhalt}
            </Link>
          );
        })}
      </div>

      {anpassen && versteckt.length > 0 && (
        <div className="mt-4 rounded-[var(--radius)] border border-dashed border-linie p-3">
          <p className="mb-2 text-[12px] font-medium text-gedaempft">Ausgeblendete Kacheln</p>
          <div className="flex flex-wrap gap-2">
            {versteckt.map((k) => (
              <button key={k.id} type="button" onClick={() => setAusgeblendet(ausgeblendet.filter((id) => id !== k.id))} className="rounded-[var(--radius)] border border-linie bg-flaeche px-2.5 py-1 text-[12px] text-text hover:border-akzent" title="Wieder einblenden">
                {k.titel} <span className="text-gedaempft">· wieder einblenden</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
