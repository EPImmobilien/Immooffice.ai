"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import {
  profilSpeichern,
  type EinstellungenErgebnis,
} from "@/server/einstellungen-aktionen";

export function ProfilFormular({
  profil,
  email,
}: {
  profil: { name: string; telefon: string | null; funktion: string | null };
  email: string;
}) {
  const [zustand, aktion, laeuft] = useActionState<EinstellungenErgebnis, FormData>(
    profilSpeichern,
    {},
  );

  return (
    <form action={aktion} className="space-y-5">
      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Speichern nicht möglich">{zustand.fehler}</Hinweis>
      )}
      {zustand.hinweis && <Hinweis ton="erfolg">{zustand.hinweis}</Hinweis>}

      <Karte>
        <KarteInhalt className="grid gap-5 sm:grid-cols-2">
          <Feld id="name" beschriftung="Name" pflicht>
            <Eingabe name="name" defaultValue={profil.name} autoComplete="name" />
          </Feld>

          <Feld
            id="email"
            beschriftung="E-Mail-Adresse"
            hinweis="Zugleich Ihre Anmeldeadresse. Änderungen nimmt die Verwaltung vor."
          >
            <Eingabe defaultValue={email} disabled />
          </Feld>

          <Feld id="telefon" beschriftung="Telefon">
            <Eingabe
              name="telefon"
              type="tel"
              defaultValue={profil.telefon ?? ""}
              autoComplete="tel"
            />
          </Feld>

          <Feld
            id="funktion"
            beschriftung="Funktion"
            hinweis="Erscheint auf Exposés, etwa „Immobilienberaterin“."
          >
            <Eingabe name="funktion" defaultValue={profil.funktion ?? ""} />
          </Feld>
        </KarteInhalt>
      </Karte>

      <div className="flex justify-end">
        <Button type="submit" laedt={laeuft}>
          Speichern
        </Button>
      </div>
    </form>
  );
}
