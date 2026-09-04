"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { kundeOeffnen, type KundeErgebnis } from "@/server/kunde-aktionen";

/** Passwortabfrage vor dem Kundenbereich, wenn der Kunde ein Passwort gesetzt hat. */
export function PasswortTor({ token, anzeigename, unternehmen }: { token: string; anzeigename: string; unternehmen: string }) {
  const [zustand, absenden, laeuft] = useActionState<KundeErgebnis, FormData>(kundeOeffnen, {});
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16">
      <div className="rounded-[var(--radius-gross)] border border-linie bg-flaeche p-7 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.12em] text-gedaempft">{unternehmen}</p>
        <h1 className="text-lg font-semibold text-text">Kundenbereich von {anzeigename}</h1>
        <p className="mt-1.5 text-[13px] text-gedaempft">Bitte geben Sie das Passwort ein, das Sie in Ihrem Kundenbereich gesetzt haben.</p>
        <form action={absenden} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <Feld beschriftung="Passwort" id="passwort" pflicht><Eingabe name="passwort" type="password" autoComplete="current-password" autoFocus /></Feld>
          {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
          <Button type="submit" disabled={laeuft} className="w-full">{laeuft ? "Wird geprüft …" : "Öffnen"}</Button>
        </form>
        <p className="mt-4 text-[12px] text-gedaempft">Passwort vergessen? Ihr Ansprechpartner kann es zurücksetzen.</p>
      </div>
    </main>
  );
}
