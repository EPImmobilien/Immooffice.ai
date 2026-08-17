"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import {
  BILDARTEN,
  BILD_BUCKET,
  BILD_MAX_BYTES,
  BILD_MIME,
  bildPfad,
  type Bildart,
} from "@/lib/bilder";
import { browserClient } from "@/lib/supabase/browser";
import { bildErfassen } from "@/server/bild-aktionen";

/**
 * Bildupload.
 *
 * Die Datei geht direkt vom Browser in den Storage; erst danach wird der
 * Datensatz ueber eine Server-Aktion erfasst. Damit laeuft kein 20-MB-Foto
 * durch den Server-Action-Kanal, dessen Groessengrenze deutlich niedriger
 * liegt. Die Mandantentrennung haengt nicht an dieser Entscheidung: Sie wird
 * von der Storage-Policy erzwungen, die die Mandanten-ID als erstes
 * Pfadsegment verlangt.
 */
export function BildUpload({
  objektId,
  mandantId,
}: {
  objektId: string;
  mandantId: string;
}) {
  const router = useRouter();
  const eingabe = useRef<HTMLInputElement>(null);
  const [art, setArt] = useState<Bildart>("foto");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();
  const [fortschritt, setFortschritt] = useState<string | null>(null);

  async function hochladen(dateien: FileList) {
    setFehler(null);
    const supabase = browserClient();
    const liste = Array.from(dateien);

    for (const [i, datei] of liste.entries()) {
      setFortschritt(`${i + 1} von ${liste.length}: ${datei.name}`);

      if (!(BILD_MIME as readonly string[]).includes(datei.type)) {
        setFehler(`„${datei.name}“ hat ein nicht unterstütztes Format.`);
        continue;
      }
      if (datei.size > BILD_MAX_BYTES) {
        setFehler(`„${datei.name}“ ist größer als 20 MB.`);
        continue;
      }

      const pfad = bildPfad(mandantId, objektId, datei.name);
      const { error } = await supabase.storage
        .from(BILD_BUCKET)
        .upload(pfad, datei, { contentType: datei.type, upsert: false });

      if (error) {
        setFehler(`„${datei.name}“ konnte nicht hochgeladen werden.`);
        continue;
      }

      const ergebnis = await bildErfassen({
        objekt_id: objektId,
        pfad,
        art,
        mime: datei.type,
        bytes: datei.size,
      });

      if (ergebnis.fehler) setFehler(ergebnis.fehler);
    }

    setFortschritt(null);
    if (eingabe.current) eingabe.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Feld beschriftung="Art" id="bild-art">
          <Auswahl
            value={art}
            onChange={(e) => setArt(e.target.value as Bildart)}
          >
            {Object.entries(BILDARTEN).map(([wert, name]) => (
              <option key={wert} value={wert}>
                {name}
              </option>
            ))}
          </Auswahl>
        </Feld>

        <Feld
          beschriftung="Dateien"
          id="bild-dateien"
          hinweis="JPEG, PNG, WebP oder PDF, bis 20 MB je Datei"
        >
          <input
            ref={eingabe}
            type="file"
            multiple
            accept={BILD_MIME.join(",")}
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

      <Button
        type="button"
        variante="sekundaer"
        groesse="klein"
        disabled={laeuft}
        onClick={() => eingabe.current?.click()}
      >
        {laeuft ? "Lädt hoch …" : "Bilder auswählen"}
      </Button>
    </div>
  );
}
