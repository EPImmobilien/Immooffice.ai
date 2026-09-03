"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { einladungEinloesen, type EinladungsErgebnis } from "@/server/einladungs-aktionen";

export function EinladungFormular({
  token,
  kontoEmail,
  eingeladeneEmail,
}: {
  token: string;
  kontoEmail: string;
  eingeladeneEmail: string;
}) {
  const [zustand, aktion, laeuft] = useActionState<EinladungsErgebnis, FormData>(
    einladungEinloesen,
    {},
  );

  const passt = kontoEmail.toLowerCase() === eingeladeneEmail.toLowerCase();

  return (
    <form action={aktion} className="space-y-5">
      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Beitritt nicht möglich">
          {zustand.fehler}
        </Hinweis>
      )}

      {!passt && (
        <Hinweis ton="warnung">
          Sie sind als {kontoEmail} angemeldet, die Einladung gilt aber für{" "}
          {eingeladeneEmail}. Der Beitritt wird abgelehnt werden — melden Sie
          sich mit der eingeladenen Adresse an.
        </Hinweis>
      )}

      <input type="hidden" name="token" value={token} />

      <Feld id="name" beschriftung="Ihr Name" pflicht hinweis="So erscheinen Sie für Kolleginnen und Kollegen und auf Dokumenten.">
        <Eingabe name="name" autoComplete="name" autoFocus placeholder="Vor- und Nachname" />
      </Feld>

      <Button type="submit" laedt={laeuft} className="w-full" disabled={!passt}>
        Beitreten
      </Button>
    </form>
  );
}
