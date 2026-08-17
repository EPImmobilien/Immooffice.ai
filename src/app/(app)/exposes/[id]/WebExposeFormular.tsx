"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import {
  webExposeSpeichern,
  type WebExposeErgebnis,
} from "@/server/web-expose-aktionen";

interface Vorhanden {
  hatPasswort: boolean;
  ablaufAm: string | null;
  downloadErlaubt: boolean;
  kontaktformular: boolean;
}

/** Zeitstempel in das Format des Datumsfeldes bringen. */
function alsFeldwert(wert: string | null): string {
  if (!wert) return "";
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function WebExposeFormular({
  objektId,
  vorhanden,
}: {
  objektId: string;
  vorhanden: Vorhanden | null;
}) {
  const [zustand, absenden, laeuft] = useActionState<WebExposeErgebnis, FormData>(
    webExposeSpeichern,
    {},
  );
  const [passwortAendern, setPasswortAendern] = useState(!vorhanden?.hatPasswort);

  return (
    <form action={absenden} className="space-y-4">
      <input type="hidden" name="objekt_id" value={objektId} />

      <Feld
        beschriftung="Sichtbar bis"
        id="ablauf_am"
        hinweis="Leer lassen für eine unbefristete Veröffentlichung"
      >
        <Eingabe
          name="ablauf_am"
          type="date"
          defaultValue={alsFeldwert(vorhanden?.ablaufAm ?? null)}
        />
      </Feld>

      {vorhanden?.hatPasswort && !passwortAendern ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-gedaempft">Passwortschutz ist aktiv.</span>
          <Button
            type="button"
            variante="leise"
            groesse="klein"
            onClick={() => setPasswortAendern(true)}
          >
            Passwort ändern
          </Button>
          <label className="flex items-center gap-1.5 text-gedaempft">
            <input
              type="checkbox"
              name="passwort_entfernen"
              value="ja"
              className="size-4 accent-[var(--akzent)]"
            />
            entfernen
          </label>
        </div>
      ) : (
        <Feld
          beschriftung="Passwort"
          id="passwort"
          hinweis="Leer lassen für einen offenen Link. Mindestens sechs Zeichen."
        >
          <Eingabe name="passwort" type="text" autoComplete="off" />
        </Feld>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 text-[13px] font-medium text-text">
          Was Besucher dürfen
        </legend>
        <label className="flex items-center gap-2 text-[13px] text-gedaempft">
          <input
            type="checkbox"
            name="kontaktformular"
            value="ja"
            defaultChecked={vorhanden?.kontaktformular ?? true}
            className="size-4 accent-[var(--akzent)]"
          />
          Kontaktformular anzeigen
        </label>
        <label className="flex items-center gap-2 text-[13px] text-gedaempft">
          <input
            type="checkbox"
            name="download_erlaubt"
            value="ja"
            defaultChecked={vorhanden?.downloadErlaubt ?? false}
            className="size-4 accent-[var(--akzent)]"
          />
          Exposé als PDF zum Herunterladen anbieten
        </label>
      </fieldset>

      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
      {zustand.hinweis && <Hinweis ton="erfolg">{zustand.hinweis}</Hinweis>}

      <Button type="submit" disabled={laeuft}>
        {laeuft
          ? "Wird gespeichert …"
          : vorhanden
            ? "Einstellungen speichern"
            : "Web-Exposé veröffentlichen"}
      </Button>
    </form>
  );
}
