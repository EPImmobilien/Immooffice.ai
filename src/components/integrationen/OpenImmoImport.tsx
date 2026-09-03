"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Hinweis, Marke } from "@/components/ui/Status";
import { browserClient } from "@/lib/supabase/browser";
import { openImmoUebernehmen, openImmoVorschau, type ImportVorschau } from "@/server/integrations-aktionen";

const MAX_BYTES = 100 * 1024 * 1024;

/**
 * OpenImmo-Datei: hochladen → Vorschau → uebernehmen.
 *
 * Die Datei geht direkt vom Browser in den privaten Bucket `importe` (nur
 * eigener Mandantenordner, nur Verwaltung). Der Server liest sie von dort;
 * so laeuft kein grosses Paket durch eine Server Action.
 */
export function OpenImmoImport({ mandantId }: { mandantId: string }) {
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler" | "info"; text: string } | null>(null);
  const [vorschau, setVorschau] = useState<ImportVorschau | null>(null);
  const [laeuft, starten] = useTransition();
  const dateiwahl = useRef<HTMLInputElement>(null);

  async function hochladen(datei: File) {
    setMeldung(null);
    setVorschau(null);

    const endung = datei.name.toLowerCase().endsWith(".zip") ? "zip" : datei.name.toLowerCase().endsWith(".xml") ? "xml" : null;
    if (!endung) {
      setMeldung({ ton: "fehler", text: "Bitte eine XML-Datei oder ein ZIP-Paket wählen." });
      return;
    }
    if (datei.size > MAX_BYTES) {
      setMeldung({ ton: "fehler", text: "Die Datei darf höchstens 100 MB groß sein." });
      return;
    }

    const pfad = `${mandantId}/${crypto.randomUUID()}.${endung}`;
    const supabase = browserClient();
    const { error } = await supabase.storage
      .from("importe")
      .upload(pfad, datei, { contentType: endung === "zip" ? "application/zip" : "text/xml", upsert: false });
    if (error) {
      setMeldung({ ton: "fehler", text: "Die Datei konnte nicht hochgeladen werden." });
      return;
    }

    const daten = new FormData();
    daten.set("pfad", pfad);
    const ergebnis = await openImmoVorschau(daten);
    if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
    else if (ergebnis.vorschau) setVorschau(ergebnis.vorschau);
    if (dateiwahl.current) dateiwahl.current.value = "";
  }

  function uebernehmen() {
    if (!vorschau) return;
    const daten = new FormData();
    daten.set("pfad", vorschau.pfad);
    starten(async () => {
      const ergebnis = await openImmoUebernehmen(daten);
      if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
      else {
        setMeldung({ ton: "erfolg", text: ergebnis.hinweis ?? "Die Übernahme ist eingeplant." });
        setVorschau(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <input
        ref={dateiwahl}
        type="file"
        accept=".xml,.zip,text/xml,application/xml,application/zip"
        disabled={laeuft}
        onChange={(e) => {
          const datei = e.target.files?.[0];
          if (datei) starten(() => void hochladen(datei));
        }}
        className="w-full text-[13px] text-gedaempft file:mr-3 file:rounded-[var(--radius)] file:border file:border-linie-stark file:bg-flaeche file:px-3 file:py-1.5 file:text-[13px] file:text-text hover:file:border-akzent/50"
      />

      {laeuft && !vorschau && <p className="text-[13px] text-gedaempft">Datei wird gelesen …</p>}
      {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

      {vorschau && (
        <div className="space-y-3 rounded-[var(--radius)] border border-linie p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-medium text-text">
              {vorschau.anzahl} {vorschau.anzahl === 1 ? "Objekt" : "Objekte"}
              {vorschau.anbieter ? ` von ${vorschau.anbieter}` : ""}
            </p>
            <Marke>{vorschau.mitBildern} mit Bildern</Marke>
            {vorschau.zurueckgezogen > 0 && <Marke ton="neutral">{vorschau.zurueckgezogen} zurückgezogen (werden nicht übernommen)</Marke>}
            {vorschau.dubletten.length > 0 && <Marke ton="warnung">{vorschau.dubletten.length} mögliche Dubletten</Marke>}
          </div>

          {vorschau.dubletten.length > 0 && (
            <div className="text-[13px]">
              <p className="mb-1 text-gedaempft">Gleiche Anschrift wie ein vorhandenes Objekt — wird trotzdem als eigener Datensatz übernommen:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-text">
                {vorschau.dubletten.slice(0, 20).map((d) => (
                  <li key={d.fremd_id}>
                    {d.bezeichnung} <span className="text-gedaempft">↔ {d.bestand}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {vorschau.hinweise.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-warnung">
              {vorschau.hinweise.slice(0, 20).map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={uebernehmen} laedt={laeuft} disabled={vorschau.anzahl === 0}>
              {vorschau.anzahl === 1 ? "1 Objekt übernehmen" : `${vorschau.anzahl} Objekte übernehmen`}
            </Button>
            <Button type="button" variante="leise" onClick={() => setVorschau(null)} disabled={laeuft}>
              Verwerfen
            </Button>
          </div>
        </div>
      )}

      <p className="text-[12px] text-gedaempft">
        Übernommene Objekte tragen die Objektnummer aus der Datei und werden beim
        nächsten Import derselben Quelle wiedererkannt. Bilder werden nur bei
        neuen Objekten übernommen. KI-Texte entstehen dabei nicht — der Import
        kostet keine Credits.
      </p>
    </div>
  );
}
