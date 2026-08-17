"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import {
  DOKUMENTARTEN,
  DOKUMENT_BUCKET,
  DOKUMENT_MAX_BYTES,
  DOKUMENT_MIME,
  dokumentPfad,
  type Dokumentart,
} from "@/lib/dokumente";
import { browserClient } from "@/lib/supabase/browser";
import { dokumentErfassen } from "@/server/dokument-aktionen";

/**
 * Unterlagen hochladen.
 *
 * Wie beim Bildupload geht die Datei direkt vom Browser in den Storage; erst
 * danach wird der Datensatz erfasst. Eine 50-MB-Teilungserklaerung wuerde die
 * Groessengrenze des Server-Action-Kanals sprengen.
 *
 * Die Art wird vor dem Auswaehlen der Datei bestimmt und nicht daraus geraten.
 * Ein „Grundriss", der aus dem Dateinamen erschlossen wurde, ist bei jeder
 * zweiten Datei falsch — und die Art steuert hier, ob eine Unterlage
 * ueberhaupt freigegeben werden darf.
 */
export function DokumentUpload({
  objektId,
  mandantId,
}: {
  objektId: string;
  mandantId: string;
}) {
  const router = useRouter();
  const eingabe = useRef<HTMLInputElement>(null);
  const [art, setArt] = useState<Dokumentart>("grundriss");
  const [gueltigBis, setGueltigBis] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();
  const [fortschritt, setFortschritt] = useState<string | null>(null);

  async function hochladen(dateien: FileList) {
    setFehler(null);
    const supabase = browserClient();
    const liste = Array.from(dateien);

    for (const [i, datei] of liste.entries()) {
      setFortschritt(`${i + 1} von ${liste.length}: ${datei.name}`);

      if (!(DOKUMENT_MIME as readonly string[]).includes(datei.type)) {
        setFehler(`„${datei.name}“ hat ein nicht unterstütztes Format.`);
        continue;
      }
      if (datei.size > DOKUMENT_MAX_BYTES) {
        setFehler(`„${datei.name}“ ist größer als 50 MB.`);
        continue;
      }

      const pfad = dokumentPfad(mandantId, objektId, datei.name);
      const { error } = await supabase.storage
        .from(DOKUMENT_BUCKET)
        .upload(pfad, datei, { contentType: datei.type, upsert: false });

      if (error) {
        setFehler(`„${datei.name}“ konnte nicht hochgeladen werden.`);
        continue;
      }

      const ergebnis = await dokumentErfassen({
        objekt_id: objektId,
        pfad,
        dateiname: datei.name,
        art,
        mime: datei.type,
        bytes: datei.size,
        ...(gueltigBis ? { gueltig_bis: gueltigBis } : {}),
      });

      if (ergebnis.fehler) setFehler(ergebnis.fehler);
    }

    setFortschritt(null);
    setGueltigBis("");
    if (eingabe.current) eingabe.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Feld beschriftung="Art" id="dok-art">
          <Auswahl
            value={art}
            onChange={(e) => setArt(e.target.value as Dokumentart)}
          >
            {Object.entries(DOKUMENTARTEN).map(([wert, name]) => (
              <option key={wert} value={wert}>
                {name}
              </option>
            ))}
          </Auswahl>
        </Feld>

        <Feld
          beschriftung="Gültig bis"
          id="dok-gueltig"
          hinweis="Optional, z. B. Energieausweis"
        >
          <Eingabe
            type="date"
            value={gueltigBis}
            onChange={(e) => setGueltigBis(e.target.value)}
          />
        </Feld>

        <Feld
          beschriftung="Dateien"
          id="dok-dateien"
          hinweis="PDF, Bild, Word oder Excel, bis 50 MB"
        >
          <input
            ref={eingabe}
            type="file"
            multiple
            accept={DOKUMENT_MIME.join(",")}
            disabled={laeuft}
            onChange={(e) => {
              const dateien = e.target.files;
              if (dateien && dateien.length > 0) {
                starten(() => {
                  void hochladen(dateien);
                });
              }
            }}
            className="w-full text-[13px] text-gedaempft file:mr-3 file:rounded-[var(--radius)] file:border file:border-linie-stark file:bg-flaeche file:px-3 file:py-1.5 file:text-[13px] file:text-text hover:file:border-akzent/50"
          />
        </Feld>
      </div>

      {fortschritt && (
        <p className="text-[12px] text-gedaempft" role="status">
          Lädt hoch — {fortschritt}
        </p>
      )}

      {fehler && (
        <Hinweis ton="fehler" className="text-[13px]">
          {fehler}
        </Hinweis>
      )}

      <p className="text-[12px] text-gedaempft">
        Neue Unterlagen sind zunächst <strong className="text-text">nur intern</strong>.
        Die Freigabe an Interessenten ist ein eigener Schritt.
      </p>

      <Button
        type="button"
        variante="sekundaer"
        groesse="klein"
        disabled={laeuft}
        onClick={() => eingabe.current?.click()}
      >
        {laeuft ? "Lädt hoch …" : "Unterlagen auswählen"}
      </Button>
    </div>
  );
}
