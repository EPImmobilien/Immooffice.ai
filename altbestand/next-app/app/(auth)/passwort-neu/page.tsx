import type { Metadata } from "next";

import { PasswortNeuFormular } from "./PasswortNeuFormular";

export const metadata: Metadata = { title: "Neues Passwort" };

/**
 * Neues Passwort setzen.
 *
 * Erreichbar ueber den Wiederherstellungslink, der in `/auth/bestaetigen` eine
 * Sitzung erzeugt. Ohne diese Sitzung weist die Server-Aktion den Vorgang ab —
 * die Seite selbst ist deshalb bewusst frei zugaenglich und prueft nichts.
 * Eine Pruefung hier waere eine zweite Wahrheit neben der in der Aktion.
 */
export default function PasswortNeuSeite() {
  return (
    <>
      <h1 className="font-titel text-2xl font-semibold text-text">
        Neues Passwort setzen
      </h1>
      <p className="mt-1.5 mb-7 text-sm text-gedaempft">
        Mindestens zwölf Zeichen. Danach sind Sie angemeldet.
      </p>
      <PasswortNeuFormular />
    </>
  );
}
