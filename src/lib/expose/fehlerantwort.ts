import { NextResponse } from "next/server";

/**
 * Antwort fuer eine gescheiterte Dokumentenerzeugung.
 *
 * Anlass ist ein konkreter Vorfall: Beim Erzeugen eines Exposés landete eine
 * Datei namens `pdf.txt` im Download-Ordner. Ursache war eine geworfene
 * Ausnahme in der Route. Next beantwortet die mit `500 Internal Server Error`
 * als `text/plain` — ohne `Content-Disposition`. Der Browser leitet den
 * Dateinamen dann aus dem letzten Pfadsegment (`pdf`) und dem MIME-Typ
 * (`.txt`) ab und legt die Fehlermeldung als Datei ab.
 *
 * Fuer den Nutzer ist das die denkbar schlechteste Rueckmeldung: Der Download
 * scheint zu gelingen, die Datei ist unbrauchbar, und nirgends steht, was los
 * war. Deshalb antwortet eine gescheiterte Dokumentenerzeugung hier
 * ausdruecklich als HTML-Seite. Die zeigt der Browser an, statt sie zu
 * speichern.
 *
 * Der Grund selbst bleibt bewusst im Serverprotokoll. Eine Meldung wie
 * "Cannot find module ..." gehoert nicht vor Kundenaugen — schon gar nicht im
 * oeffentlichen Web-Exposé.
 */
export function dokumentFehlerAntwort(fehler: unknown, kennung: string): NextResponse {
  console.error(`[${kennung}] Dokumentenerzeugung fehlgeschlagen:`, fehler);

  const seite = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Dokument konnte nicht erstellt werden</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #FAFAFA; color: #1B2A47;
         font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 32rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.25rem; margin: 0 0 .75rem; }
  p { font-size: .9375rem; line-height: 1.6; color: #7A828C; margin: 0 0 .5rem; }
</style>
</head>
<body>
<main>
  <h1>Das Dokument konnte nicht erstellt werden</h1>
  <p>Bitte versuchen Sie es erneut. Besteht der Fehler fort, wenden Sie sich an
     Ihren Ansprechpartner.</p>
  <p>Es wurde nichts verändert und nichts berechnet.</p>
</main>
</body>
</html>`;

  return new NextResponse(seite, {
    status: 500,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
