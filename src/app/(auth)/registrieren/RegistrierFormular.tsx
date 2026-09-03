"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { registrieren, type AktionsErgebnis } from "@/server/auth-aktionen";

export function RegistrierFormular({
  einladung,
  eingeladeneEmail,
}: {
  /** Token aus dem Einladungslink; das Konto tritt damit dem einladenden Unternehmen bei. */
  einladung?: string;
  eingeladeneEmail?: string;
}) {
  const [zustand, aktion, laeuft] = useActionState<AktionsErgebnis, FormData>(
    registrieren,
    {},
  );

  if (zustand.hinweis) {
    return (
      <div className="space-y-4">
        <Hinweis ton="erfolg" titel="Fast geschafft">
          {zustand.hinweis}
        </Hinweis>
        {/* Der Hinweis deckt bewusst beide Faelle ab — auch den, dass die
            Adresse bereits vergeben ist. Dann fuehrt kein Weg ueber eine
            E-Mail, sondern nur ueber die Anmeldung. Ohne diesen Verweis
            bliebe der Nutzer auf einer Seite ohne Ausgang stehen. */}
        <p className="text-[13px] text-gedaempft">
          Sie haben bereits ein Konto?{" "}
          <Link href="/anmelden" className="font-medium text-akzent hover:underline">
            Zur Anmeldung
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={aktion} className="space-y-5">
      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Registrierung nicht möglich">
          {zustand.fehler}
        </Hinweis>
      )}

      {einladung && <input type="hidden" name="einladung" value={einladung} />}

      <Feld
        id="email"
        beschriftung="E-Mail-Adresse"
        pflicht
        {...(eingeladeneEmail
          ? { hinweis: "Die Einladung gilt nur für diese Adresse." }
          : {})}
      >
        <Eingabe
          type="email"
          name="email"
          autoComplete="email"
          autoFocus={!eingeladeneEmail}
          defaultValue={eingeladeneEmail ?? ""}
          readOnly={Boolean(eingeladeneEmail)}
          placeholder="name@unternehmen.de"
        />
      </Feld>

      <Feld
        id="passwort"
        beschriftung="Passwort"
        pflicht
        hinweis="Mindestens 12 Zeichen."
      >
        <Eingabe type="password" name="passwort" autoComplete="new-password" autoFocus={Boolean(eingeladeneEmail)} />
      </Feld>

      {/* S8: Zielgruppe sind ausschliesslich Gewerbetreibende. Die Bestaetigung
          ist Pflicht, damit Verbraucherschutzregeln gar nicht erst greifen. */}
      {!einladung && (
        <label className="flex items-start gap-2 text-[13px] text-text">
          <input type="checkbox" name="unternehmer" required className="mt-0.5" />
          <span>
            Ich handle als Unternehmer im Sinne des § 14 BGB und nutze
            ImmoOffice.ai gewerblich.
          </span>
        </label>
      )}

      {/* Honigtopf gegen Skripte: fuer Menschen unsichtbar, von Formularrobotern
          gern ausgefuellt. Ein Wert hier beendet die Registrierung still. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Button type="submit" laedt={laeuft} className="w-full">
        {einladung ? "Konto anlegen und beitreten" : "Testphase starten"}
      </Button>

      {!einladung && (
        <p className="text-[12px] leading-relaxed text-gedaempft">
          7 Tage kostenlos testen, ein Benutzer, 100 Credits. Es entstehen keine
          Kosten, solange kein Tarif ausgewählt wurde. Alle Preise verstehen sich
          netto zzgl. USt.
        </p>
      )}

      <p className="text-center text-[13px] text-gedaempft">
        Bereits ein Konto?{" "}
        <Link
          href={einladung ? `/anmelden?weiter=/einladung/${einladung}` : "/anmelden"}
          className="font-medium text-akzent underline-offset-2 hover:underline"
        >
          Anmelden
        </Link>
      </p>
    </form>
  );
}
