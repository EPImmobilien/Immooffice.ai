"use client";

import { useRef, useState, useTransition } from "react";

import type { Branding } from "@/components/einstellungen/Stammdaten";
import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import {
  LOGO_MAX_BYTES,
  LOGO_MIME,
  MARKE_BUCKET,
  logoPfad,
  markeUrl,
} from "@/lib/marke";
import { browserClient } from "@/lib/supabase/browser";
import {
  erscheinungsbildSpeichern,
  logoEntfernen,
  logoErfassen,
} from "@/server/einstellungen-aktionen";

/** Vorbelegung aus dem Master-Prompt, falls der Mandant nichts hinterlegt hat. */
const VORGABE_PRIMAER = "#1B2A47";
const VORGABE_AKZENT = "#B5934F";

/**
 * Farben und Logo.
 *
 * Beide wirken sofort in Exposés, PDF, Web-Exposé und Marketingmotiven — das
 * ist der Grund, warum dieser Abschnitt vor allen anderen Einstellungen kommt.
 *
 * Zur Farbwahl gibt es zwei Eingaben je Farbe: die Farbwahl des Browsers und
 * ein Textfeld. Die Farbwahl allein genuegt nicht, weil Unternehmen ihre Farben
 * als Hexwert vorliegen haben und nicht durch Klicken finden wollen.
 */
export function Erscheinungsbild({
  branding,
  mandantId,
  supabaseUrl,
}: {
  branding: Branding | null;
  mandantId: string;
  supabaseUrl: string;
}) {
  const [primaer, setPrimaer] = useState(branding?.farbe_primaer ?? VORGABE_PRIMAER);
  const [akzent, setAkzent] = useState(branding?.farbe_akzent ?? VORGABE_AKZENT);
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler"; text: string } | null>(
    null,
  );
  const [laeuft, starten] = useTransition();
  const dateiwahl = useRef<HTMLInputElement>(null);

  const logo = branding?.logo_pfad
    ? markeUrl(supabaseUrl, branding.logo_pfad)
    : null;

  function absenden(daten: FormData) {
    setMeldung(null);
    starten(async () => {
      const ergebnis = await erscheinungsbildSpeichern(daten);
      if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
      else if (ergebnis.hinweis) setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
    });
  }

  async function hochladen(datei: File) {
    setMeldung(null);

    if (!(LOGO_MIME as readonly string[]).includes(datei.type)) {
      setMeldung({ ton: "fehler", text: "Erlaubt sind PNG, JPEG, WebP und SVG." });
      return;
    }
    if (datei.size > LOGO_MAX_BYTES) {
      setMeldung({ ton: "fehler", text: "Das Logo darf höchstens 2 MB groß sein." });
      return;
    }

    const supabase = browserClient();
    const pfad = logoPfad(mandantId, datei.name);
    const { error } = await supabase.storage
      .from(MARKE_BUCKET)
      .upload(pfad, datei, { contentType: datei.type, upsert: false });

    if (error) {
      setMeldung({ ton: "fehler", text: "Das Logo konnte nicht hochgeladen werden." });
      return;
    }

    const ergebnis = await logoErfassen(pfad);
    if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
    else if (ergebnis.hinweis) setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
    if (dateiwahl.current) dateiwahl.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-[13px] font-medium text-text">Logo</p>

        {logo ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-16 items-center rounded-[var(--radius)] border border-linie bg-white px-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- eigene Datei in wechselnden Formaten, auch SVG; der Bildoptimierer bringt hier nichts */}
              <img src={logo} alt="Logo des Unternehmens" className="max-h-10" />
            </div>
            <form action={logoEntfernen}>
              <Button type="submit" variante="leise" groesse="klein">
                Logo entfernen
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-[13px] text-gedaempft">
            Noch kein Logo hinterlegt. Ohne Logo erscheint in Exposés und
            Motiven der Firmenname als Wortmarke.
          </p>
        )}

        <input
          ref={dateiwahl}
          type="file"
          accept={LOGO_MIME.join(",")}
          disabled={laeuft}
          onChange={(e) => {
            const datei = e.target.files?.[0];
            if (datei) {
              starten(() => {
                void hochladen(datei);
              });
            }
          }}
          className="w-full text-[13px] text-gedaempft file:mr-3 file:rounded-[var(--radius)] file:border file:border-linie-stark file:bg-flaeche file:px-3 file:py-1.5 file:text-[13px] file:text-text hover:file:border-akzent/50"
        />
        <p className="text-[12px] text-gedaempft">
          PNG, JPEG, WebP oder SVG, bis 2 MB. Ein Logo mit durchsichtigem
          Hintergrund wirkt auf farbigen Flächen besser.
        </p>
      </div>

      <form action={absenden} className="space-y-4 border-t border-linie pt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld
            beschriftung="Hauptfarbe"
            id="e-primaer"
            hinweis="Für Flächen, Titel und Preisbänder"
          >
            <div className="flex gap-2">
              <input
                type="color"
                value={primaer}
                onChange={(e) => setPrimaer(e.target.value)}
                aria-label="Hauptfarbe wählen"
                className="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius)] border border-linie-stark bg-flaeche"
              />
              <Eingabe
                name="farbe_primaer"
                value={primaer}
                onChange={(e) => setPrimaer(e.target.value)}
                maxLength={7}
                className="zahl"
              />
            </div>
          </Feld>

          <Feld
            beschriftung="Akzentfarbe"
            id="e-akzent"
            hinweis="Für Hervorhebungen und Linien"
          >
            <div className="flex gap-2">
              <input
                type="color"
                value={akzent}
                onChange={(e) => setAkzent(e.target.value)}
                aria-label="Akzentfarbe wählen"
                className="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius)] border border-linie-stark bg-flaeche"
              />
              <Eingabe
                name="farbe_akzent"
                value={akzent}
                onChange={(e) => setAkzent(e.target.value)}
                maxLength={7}
                className="zahl"
              />
            </div>
          </Feld>
        </div>

        {/* Vorschau, damit die Wirkung vor dem Speichern sichtbar ist: Farben
            am Bildschirm zu beurteilen ist schwer, sobald sie nur als Hexwert
            dastehen. */}
        <div
          className="rounded-[var(--radius)] p-4"
          style={{ backgroundColor: primaer }}
        >
          <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: akzent }}>
            {branding?.firmenname || "Ihr Unternehmen"}
          </p>
          <p className="mt-1 text-[17px] font-semibold text-white">
            Helle 3-Zimmer-Wohnung mit Südbalkon
          </p>
          <p className="mt-2 text-[13px]" style={{ color: akzent }}>
            349.000 €
          </p>
        </div>

        {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

        <Button type="submit" disabled={laeuft}>
          {laeuft ? "Speichert …" : "Farben speichern"}
        </Button>
      </form>
    </div>
  );
}
