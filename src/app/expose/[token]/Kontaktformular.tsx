"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { anfrageSenden, type AnfrageErgebnis } from "@/server/web-expose-oeffentlich";

/**
 * Kontaktformular des Web-Exposes.
 *
 * Erhoben wird nur, was fuer eine Rueckmeldung noetig ist. Die Einwilligung
 * ist Pflicht und bewusst nicht vorausgewaehlt — eine gesetzte Kaestchen waere
 * keine Einwilligung (Abschnitt 16).
 */
export function Kontaktformular({
  token,
  firmenname,
}: {
  token: string;
  firmenname: string;
}) {
  const [zustand, absenden, laeuft] = useActionState<AnfrageErgebnis, FormData>(
    anfrageSenden,
    {},
  );

  if (zustand.gesendet) {
    return (
      <Hinweis ton="erfolg" titel="Ihre Anfrage ist eingegangen">
        {firmenname} meldet sich bei Ihnen. Vielen Dank für Ihr Interesse.
      </Hinweis>
    );
  }

  return (
    <form action={absenden} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Name" id="anfrage-name" pflicht>
          <Eingabe name="name" autoComplete="name" />
        </Feld>
        <Feld beschriftung="E-Mail" id="anfrage-email" pflicht>
          <Eingabe name="email" type="email" autoComplete="email" />
        </Feld>
      </div>

      <Feld beschriftung="Telefon" id="anfrage-telefon" hinweis="Freiwillig">
        <Eingabe name="telefon" type="tel" autoComplete="tel" />
      </Feld>

      <Feld beschriftung="Ihre Nachricht" id="anfrage-nachricht">
        <Textfeld
          name="nachricht"
          rows={4}
          placeholder="Zum Beispiel ein Wunschtermin für eine Besichtigung."
        />
      </Feld>

      <label className="flex items-start gap-2.5 text-[13px] text-gedaempft">
        <input
          type="checkbox"
          name="einwilligung"
          value="ja"
          required
          className="mt-0.5 size-4 shrink-0 accent-[var(--akzent)]"
        />
        <span>
          Ich bin damit einverstanden, dass {firmenname} meine Angaben zur
          Bearbeitung meiner Anfrage speichert und mich dazu kontaktiert. Die
          Einwilligung kann jederzeit widerrufen werden.
        </span>
      </label>

      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}

      <Button type="submit" disabled={laeuft}>
        {laeuft ? "Wird gesendet …" : "Anfrage senden"}
      </Button>
    </form>
  );
}
