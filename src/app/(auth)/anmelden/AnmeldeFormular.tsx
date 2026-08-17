"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { anmelden, type AktionsErgebnis } from "@/server/auth-aktionen";

export function AnmeldeFormular({
  weiter,
  linkFehler = false,
}: {
  weiter: string;
  /** Der Bestätigungs- oder Wiederherstellungslink war ungültig. */
  linkFehler?: boolean;
}) {
  const [zustand, aktion, laeuft] = useActionState<AktionsErgebnis, FormData>(
    anmelden,
    {},
  );

  return (
    <form action={aktion} className="space-y-5">
      <input type="hidden" name="weiter" value={weiter} />

      {linkFehler && !zustand.fehler && (
        <Hinweis ton="warnung" titel="Link nicht mehr gültig">
          Der Link ist abgelaufen oder wurde bereits verwendet. Melden Sie sich
          an oder{" "}
          <Link
            href="/passwort-vergessen"
            className="font-medium underline underline-offset-2"
          >
            fordern Sie einen neuen an
          </Link>
          .
        </Hinweis>
      )}

      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Anmeldung nicht möglich">
          {zustand.fehler}
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

      <Feld id="passwort" beschriftung="Passwort" pflicht>
        <Eingabe type="password" name="passwort" autoComplete="current-password" />
      </Feld>

      <div className="-mt-2 text-right">
        <Link
          href="/passwort-vergessen"
          className="text-[13px] text-gedaempft underline-offset-2 hover:text-text hover:underline"
        >
          Passwort vergessen?
        </Link>
      </div>

      <Button type="submit" laedt={laeuft} className="w-full">
        Anmelden
      </Button>

      <p className="text-center text-[13px] text-gedaempft">
        Noch kein Konto?{" "}
        <Link href="/registrieren" className="font-medium text-akzent underline-offset-2 hover:underline">
          Kostenlos testen
        </Link>
      </p>
    </form>
  );
}
