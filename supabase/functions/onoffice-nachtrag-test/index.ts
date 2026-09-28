// ============================================================================
// STILLGELEGT am 23.09.2026 im Sicherheitsdurchgang.
// Kriterien: oeffentlich erreichbar, in keinem Cron-Plan, vom Portal nicht aufgerufen,
// der Name weist sie als Testlauf aus. Alte Versionen bleiben in Supabase erhalten;
// bei Bedarf erneut ausrollen - dann mit x-diagnose-secret aus dem Vault.
// Zusaetzlich jetzt verify_jwt = true.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  new Response(
    JSON.stringify({ ok: false, fehler: "Diese Testfunktion wurde am 23.09.2026 stillgelegt." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
