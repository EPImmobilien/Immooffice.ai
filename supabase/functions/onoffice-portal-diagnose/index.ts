// ============================================================================
// STILLGELEGT am 23.09.2026 im Sicherheitsdurchgang.
//
// Was sie war: ein einmaliger Suchlauf (Sept. 2026), welche Portal-Freigabe-Endpunkte die
// onOffice-API kennt - reine Erkundung, kein Betrieb.
// Warum sie weg musste:
//   - oeffentlich erreichbar, geschuetzt nur durch einen FEST EINPROGRAMMIERTEN Schluessel,
//     uebergeben als URL-Parameter (landet in Logs, Verlauf, Referer);
//   - derselbe Schluessel wie in portal-ftp-diagnose und buero-verschieben;
//   - sie LOESCHTE beim Start die gesamte Tabelle onoffice_diagnose;
//   - sie feuerte rund 28 Anfragen gegen die onOffice-API mit den Zugangsdaten der Firma
//     (Kontingent, Sperrgefahr).
//
// Geprueft vor dem Stilllegen: steht in keinem Cron-Plan und wird vom Portal nicht aufgerufen.
// Nicht geloescht, sondern geleert - Supabase behaelt die alten Versionen.
// Zusaetzlich jetzt verify_jwt = true.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  new Response(
    JSON.stringify({ ok: false, fehler: "Diese Diagnose-Funktion wurde am 23.09.2026 stillgelegt." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
