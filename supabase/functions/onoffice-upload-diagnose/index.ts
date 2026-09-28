// ============================================================================
// STILLGELEGT am 23.09.2026 im Sicherheitsdurchgang.
// Kriterien: oeffentlich erreichbar, in keinem Cron-Plan, vom Portal nicht aufgerufen,
// Diagnosewerkzeug. Geschwister dieser Reihe waren nur durch einen fest einprogrammierten
// Schluessel im URL-Parameter geschuetzt. Alte Versionen bleiben in Supabase erhalten;
// bei Bedarf erneut ausrollen - dann mit x-diagnose-secret aus dem Vault.
// Zusaetzlich jetzt verify_jwt = true.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  new Response(
    JSON.stringify({ ok: false, fehler: "Diese Diagnose-Funktion wurde am 23.09.2026 stillgelegt." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
