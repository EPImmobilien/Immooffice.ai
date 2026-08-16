"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { unternehmenAnlegen, type AktionsErgebnis } from "@/server/auth-aktionen";

export function UnternehmenFormular() {
  const [zustand, aktion, laeuft] = useActionState<AktionsErgebnis, FormData>(
    unternehmenAnlegen,
    {},
  );

  return (
    <form action={aktion} className="space-y-5">
      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Anlegen nicht möglich">
          {zustand.fehler}
        </Hinweis>
      )}

      <Feld
        id="firmenname"
        beschriftung="Name des Unternehmens"
        pflicht
        hinweis="Erscheint auf Exposés und Dokumenten. Später änderbar."
      >
        <Eingabe name="firmenname" autoFocus placeholder="Musterstadt Immobilien" />
      </Feld>

      <Feld id="name" beschriftung="Ihr Name" pflicht>
        <Eingabe name="name" autoComplete="name" placeholder="Vor- und Nachname" />
      </Feld>

      <Button type="submit" laedt={laeuft} className="w-full">
        Unternehmen anlegen
      </Button>

      <p className="text-[12px] leading-relaxed text-gedaempft">
        Sie werden Unternehmensinhaber und können anschließend weitere Benutzer
        einladen.
      </p>
    </form>
  );
}
