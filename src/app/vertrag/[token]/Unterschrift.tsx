"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { unterzeichnen } from "@/server/vertrag-oeffentlich";

/**
 * Unterschriftsblock der oeffentlichen Seite.
 *
 * Die Zustimmung ist ein eigenes Haekchen und keine Beilaeufigkeit im
 * Schaltflaechentext. „Mit dem Klick stimmen Sie zu" waere bequemer und wuerde
 * die bewusste Handlung verwischen, auf die es hier gerade ankommt.
 */
export function Unterschrift({
  token,
  firmenname,
}: {
  token: string;
  firmenname: string;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const [laeuft, starten] = useTransition();

  function absenden(daten: FormData) {
    setFehler(null);
    starten(async () => {
      const e = await unterzeichnen(daten);
      if (e.fehler) setFehler(e.fehler);
      else setFertig(true);
    });
  }

  if (fertig) {
    return (
      <div className="mt-6 rounded-[var(--radius-gross)] border border-erfolg/30 bg-erfolg-schwach p-5">
        <p className="text-[14px] font-medium text-erfolg">
          Vielen Dank — Ihre Unterschrift ist eingegangen.
        </p>
        <p className="mt-1 text-[13px] text-gedaempft">
          {firmenname} erhält eine Benachrichtigung. Bitte bewahren Sie diese
          Seite oder einen Ausdruck davon auf.
        </p>
      </div>
    );
  }

  return (
    <form
      action={absenden}
      className="mt-6 space-y-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5 sm:p-7"
    >
      <input type="hidden" name="token" value={token} />

      <div>
        <h2 className="text-[15px] font-semibold text-text">Unterzeichnen</h2>
        <p className="mt-1 text-[13px] text-gedaempft">
          Ihr Name und Ihre E-Mail-Adresse werden zusammen mit dem Zeitpunkt und
          einem Fingerabdruck des oben stehenden Textes festgehalten.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Vor- und Nachname" id="u-name" pflicht>
          <Eingabe name="name" required autoComplete="name" />
        </Feld>
        <Feld beschriftung="E-Mail-Adresse" id="u-email" pflicht>
          <Eingabe type="email" name="email" required autoComplete="email" />
        </Feld>
      </div>

      <label className="flex gap-2 text-[13px] text-text">
        <input
          type="checkbox"
          name="zustimmung"
          value="ja"
          required
          className="mt-0.5 size-4 shrink-0 rounded border-linie-stark accent-akzent"
        />
        <span>
          Ich habe den Vertragstext gelesen und unterzeichne ihn mit einer
          einfachen elektronischen Signatur.
        </span>
      </label>

      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}

      <Button type="submit" disabled={laeuft}>
        {laeuft ? "Wird übermittelt …" : "Verbindlich unterzeichnen"}
      </Button>
    </form>
  );
}
