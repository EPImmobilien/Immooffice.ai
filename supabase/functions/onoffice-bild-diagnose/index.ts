// ============================================================================
// STILLGELEGT am 23.09.2026 im Sicherheitsdurchgang.
//
// Kriterien: oeffentlich erreichbar (ohne JWT-Pflicht), steht in KEINEM Cron-Plan, wird vom
// Portal NICHT aufgerufen (0 Treffer in index.html, freigabe.html, objekt.html, sw.js), und der
// Name weist sie als Diagnosewerkzeug aus. Die beiden gelesenen Geschwister dieser Reihe
// (portal-ftp-diagnose, onoffice-portal-diagnose) waren nur durch einen fest einprogrammierten
// Schluessel im URL-Parameter geschuetzt - denselben in beiden.
//
// Nicht geloescht, sondern geleert: Supabase behaelt die alten Versionen. Wird das Werkzeug
// wieder gebraucht, die vorherige Version erneut ausrollen - dann mit Pruefung ueber die
// Kopfzeile x-diagnose-secret gegen den Vault (Muster: mail-anhaenge-diagnose).
// Zusaetzlich jetzt verify_jwt = true.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  new Response(
    JSON.stringify({ ok: false, fehler: "Diese Diagnose-Funktion wurde am 23.09.2026 stillgelegt." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
