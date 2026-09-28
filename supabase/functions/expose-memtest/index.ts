// ============================================================================
// STILLGELEGT am 23.09.2026 im Sicherheitsdurchgang.
//
// Was sie war: ein Speicher-Messlauf fuer die Expose-PDF-Erzeugung (April 2026).
// Warum sie weg musste: Sie war oeffentlich erreichbar und pruefte GAR NICHTS - kein
// Schluessel, kein JWT. Mit einer beliebigen Objekt-ID liess sich wiederholt eine
// PDF-Erzeugung samt Bilddownloads ausloesen (Rechenzeit und Traffic auf Rechnung des
// Betreibers) und nebenbei die Tabelle expose_debug vollschreiben.
//
// Nicht geloescht, sondern geleert: Supabase behaelt die alten Versionen. Wird der
// Messlauf noch einmal gebraucht, die vorherige Version erneut ausrollen - dann aber
// bitte mit Pruefung (Muster: mail-anhaenge-diagnose mit x-diagnose-secret aus dem Vault).
//
// Zusaetzlich steht die Funktion jetzt auf verify_jwt = true.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      fehler: "Diese Funktion wurde am 23.09.2026 stillgelegt.",
      hinweis: "Bei Bedarf die vorherige Version in Supabase erneut ausrollen - mit Zugangspruefung.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
