"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { passwortNeuSetzen, type AktionsErgebnis } from "@/server/auth-aktionen";

export function PasswortNeuFormular() {
  const [zustand, aktion, laeuft] = useActionState<AktionsErgebnis, FormData>(
    passwortNeuSetzen,
    {},
  );

  return (
    <form action={aktion} className="space-y-5">
      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Nicht möglich">
          {zustand.fehler}{" "}
          <Link
            href="/passwort-vergessen"
            className="font-medium underline underline-offset-2"
          >
            Neuen Link anfordern
          </Link>
        </Hinweis>
      )}

      <Feld
        id="passwort"
        beschriftung="Neues Passwort"
        hinweis="Mindestens zwölf Zeichen"
        pflicht
      >
        <Eingabe
          type="password"
          name="passwort"
          autoComplete="new-password"
          autoFocus
        />
      </Feld>

      {/* Zweite Eingabe, weil ein Tippfehler hier besonders teuer ist: Das
          Passwort ist nicht sichtbar, und nach dem Speichern gilt es. */}
      <Feld id="passwort_wiederholung" beschriftung="Wiederholung" pflicht>
        <Eingabe
          type="password"
          name="passwort_wiederholung"
          autoComplete="new-password"
        />
      </Feld>

      <Button type="submit" laedt={laeuft} className="w-full">
        Passwort speichern
      </Button>
    </form>
  );
}
