"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import {
  einladungAnnehmen,
  type EinstellungenErgebnis,
} from "@/server/einstellungen-aktionen";

/**
 * Letzter Schritt der Einladung: Name erfassen und beitreten.
 *
 * Die E-Mail-Adresse steht fest — die Datenbank vergleicht sie beim Einlösen
 * mit der Adresse des angemeldeten Kontos und weist ab, wenn sie abweicht.
 */
export function AnnahmeFormular({ token, email }: { token: string; email: string }) {
  const [zustand, aktion, laeuft] = useActionState<EinstellungenErgebnis, FormData>(
    einladungAnnehmen,
    {},
  );

  return (
    <form action={aktion}>
      <input type="hidden" name="token" value={token} />

      <Karte>
        <KarteInhalt className="space-y-5">
          {zustand.fehler && (
            <Hinweis ton="fehler" titel="Beitritt nicht möglich">{zustand.fehler}</Hinweis>
          )}

          <Feld
            id="name"
            beschriftung="Ihr Name"
            pflicht
            hinweis="Erscheint für Kolleginnen und Kollegen sowie auf Exposés."
          >
            <Eingabe name="name" autoComplete="name" autoFocus />
          </Feld>

          {email && (
            <p className="text-[13px] text-gedaempft">
              Die Einladung gilt für{" "}
              <strong className="font-medium text-text">{email}</strong>. Sie muss
              mit dem angemeldeten Konto übereinstimmen.
            </p>
          )}

          <Button type="submit" laedt={laeuft} className="w-full">
            Einladung annehmen
          </Button>
        </KarteInhalt>
      </Karte>
    </form>
  );
}
