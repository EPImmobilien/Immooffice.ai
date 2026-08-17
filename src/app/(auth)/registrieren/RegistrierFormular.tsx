"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { registrieren, type AktionsErgebnis } from "@/server/auth-aktionen";

export function RegistrierFormular() {
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

      <Feld id="email" beschriftung="E-Mail-Adresse" pflicht>
        <Eingabe
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          placeholder="name@unternehmen.de"
        />
      </Feld>

      <Feld
        id="passwort"
        beschriftung="Passwort"
        pflicht
        hinweis="Mindestens 12 Zeichen."
      >
        <Eingabe type="password" name="passwort" autoComplete="new-password" />
      </Feld>

      <Button type="submit" laedt={laeuft} className="w-full">
        Testphase starten
      </Button>

      <p className="text-[12px] leading-relaxed text-gedaempft">
        7 Tage kostenlos testen, ein Benutzer, 100 Credits. Es entstehen keine
        Kosten, solange kein Tarif ausgewählt wurde.
      </p>

      <p className="text-center text-[13px] text-gedaempft">
        Bereits ein Konto?{" "}
        <Link
          href="/anmelden"
          className="font-medium text-akzent underline-offset-2 hover:underline"
        >
          Anmelden
        </Link>
      </p>
    </form>
  );
}
