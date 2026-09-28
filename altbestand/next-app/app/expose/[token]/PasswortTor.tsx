"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { exposeOeffnen, type TorErgebnis } from "@/server/web-expose-oeffentlich";

/**
 * Passwortabfrage vor einem geschuetzten Web-Expose.
 *
 * Das Passwort wird bei jedem Aufruf erneut geprueft und nicht in einem Cookie
 * abgelegt. Ein Cookie waere bequemer, wuerde den Schutz aber ueberdauern —
 * auch nach einem Widerruf.
 */
export function PasswortTor({ token }: { token: string }) {
  const [zustand, absenden, laeuft] = useActionState<TorErgebnis, FormData>(
    exposeOeffnen,
    {},
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16">
      <div className="rounded-[var(--radius-gross)] border border-linie bg-flaeche p-7 shadow-sm">
        <h1 className="text-lg font-semibold text-text">Geschütztes Exposé</h1>
        <p className="mt-1.5 text-[13px] text-gedaempft">
          Bitte geben Sie das Passwort ein, das Sie erhalten haben.
        </p>

        <form action={absenden} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <Feld beschriftung="Passwort" id="passwort" pflicht>
            <Eingabe
              name="passwort"
              type="password"
              autoComplete="off"
              autoFocus
            />
          </Feld>

          {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}

          <Button type="submit" disabled={laeuft} className="w-full">
            {laeuft ? "Wird geprüft …" : "Exposé anzeigen"}
          </Button>
        </form>
      </div>
    </main>
  );
}
