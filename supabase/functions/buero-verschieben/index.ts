// ============================================================================
// STILLGELEGT am 23.09.2026 im Sicherheitsdurchgang.
//
// Was sie war: eine Einmalfunktion (April 2026), die drei Buerobilder im Bucket
// branding-assets von der Wurzel nach mpe/ verschoben hat. Die Arbeit ist laengst getan.
// Warum sie weg musste: Sie war oeffentlich erreichbar, arbeitete mit service_role auf dem
// Dateispeicher und war nur durch einen fest einprogrammierten Schluessel geschuetzt -
// denselben, den auch portal-ftp-diagnose verwendete. Ein Fund haette beide aufgesperrt.
//
// Nicht geloescht, sondern geleert: Supabase behaelt die alten Versionen.
// Zusaetzlich steht die Funktion jetzt auf verify_jwt = true.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      fehler: "Diese Funktion wurde am 23.09.2026 stillgelegt (Einmalaufgabe, erledigt).",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
