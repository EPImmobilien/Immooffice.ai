"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { passwortVergessen, type AktionsErgebnis } from "@/server/auth-aktionen";

export function PasswortVergessenFormular() {
  const [zustand, aktion, laeuft] = useActionState<AktionsErgebnis, FormData>(
    passwortVergessen,
    {},
  );

  // Nach dem Absenden bleibt das Formular stehen, aber der Hinweis steht oben.
  // Ein Austauschen gegen eine reine Bestaetigungsseite wuerde einen Tippfehler
  // in der Adresse zur Sackgasse machen.
  return (
    <form action={aktion} className="space-y-5">
      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Nicht möglich">
          {zustand.fehler}
        </Hinweis>
      )}

      {zustand.hinweis && (
        <Hinweis ton="erfolg" titel="E-Mail unterwegs">
          {zustand.hinweis}
        </Hinweis>
      )}

      <Feld id="email" beschriftung="E-Mail-Adresse" pflicht>
        <Eingabe
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          placeholder="name@unternehmen.de"
        />
      </Feld>

      <Button type="submit" laedt={laeuft} className="w-full">
        Link anfordern
      </Button>

      <p className="text-center text-[13px] text-gedaempft">
        <Link
          href="/anmelden"
          className="font-medium text-akzent underline-offset-2 hover:underline"
        >
          Zurück zur Anmeldung
        </Link>
      </p>
    </form>
  );
}
