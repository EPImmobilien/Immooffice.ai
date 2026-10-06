// ============================================================================
// abo.ts — die Abo-Schranke vor einem KI-Aufruf
// ============================================================================
// Beilage des Forks (fork_61). Quelle:
// supabase/eigene-beilagen/_abo/abo.ts — sie wird in den Ordner jeder
// KI-Funktion gelegt, die noch keinen Preis im Katalog hat. Wer sie ändert,
// ändert sie DORT; die Kopien in supabase/functions/ entstehen beim Erzeugen
// neu, und tests/abo-schranke.js besteht darauf, dass alle byte-gleich sind.
//
// ---------------------------------------------------------------------------
// WARUM ES SIE GIBT
//
// Dreißig Funktionen rufen ein Sprachmodell, ohne etwas abzurechnen. Der
// Grund steht in docs/BILLING.md und bleibt richtig: einen Credit-Preis zu
// erfinden wäre eine Preisentscheidung, und die trifft der Betreiber.
//
// Nur hängt daran eine zweite Frage, die KEINE Preisentscheidung ist: darf
// ein Mandant, dessen Testphase abgelaufen ist oder dessen Zahlung
// ausbleibt, weiter ein Sprachmodell rufen? Nein. Das kostet den Betreiber
// bares Geld beim Anbieter, und CLAUDE.md verlangt, dass Rechte
// serverseitig durchgesetzt werden — nicht durch ein ausgeblendetes
// Bedienelement.
//
// Diese Datei beantwortet nur diese zweite Frage. Credits zieht sie keine
// ab; das tut credits.ts, sobald ein Preis im Katalog steht.
//
// ---------------------------------------------------------------------------
// SIE FÄLLT NACH AUSSEN OFFEN AUS, UND ZWAR ABSICHTLICH
//
// Abgewiesen wird NUR der Fall, der eindeutig ist: ein angemeldeter Nutzer,
// dessen Mandant bekannt ist und dessen Abo `abo_zugriff` nicht mit "voll"
// beantwortet. Alles andere kommt durch:
//
//   kein Anmeldekopf        → Hintergrundlauf, nicht unsere Sache
//   Anmeldekopf ohne Nutzer → Dienst- oder anon-Schlüssel; die Cron-Läufe
//                             dieses Projekts schicken genau das
//   kein Mandant am Profil  → ein Konto in der Einrichtung
//   abo_zugriff antwortet nicht → ein Fehler der Datenbank ist kein Grund,
//                             einem zahlenden Kunden die Arbeit zu sperren
//
// Eine Schranke, die im Zweifel zumacht, legt beim ersten Schluckauf das
// Haus still. Eine, die im Zweifel durchlässt, kostet im schlimmsten Fall
// einen KI-Aufruf. Die Abrechnung selbst ist strenger — sie MUSS es sein,
// weil dort Geld bewegt wird.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Prüft das Abo des Aufrufers.
 *
 * @returns `null`, wenn es weitergehen darf — sonst die fertige Antwort 403,
 *          die der Aufrufer unverändert zurückgeben soll.
 */
export async function aboSchranke(
  req: Request,
  kopf: Record<string, string>,
): Promise<Response | null> {
  try {
    const token = (req.headers.get("Authorization") || "")
      .replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: u } = await db.auth.getUser(token);
    if (!u?.user) return null;

    const { data: profil } = await db.from("profiles")
      .select("mandant_id").eq("id", u.user.id).maybeSingle();
    if (!profil?.mandant_id) return null;

    const { data: zugriff, error } = await db.rpc("abo_zugriff", {
      p_mandant: profil.mandant_id,
    });
    if (error || !zugriff || zugriff === "voll") return null;

    return new Response(JSON.stringify({
      error: zugriff === "nur_lesen"
        ? "Das Abo ist beendet. Ihre Daten bleiben lesbar; neue KI-Erzeugung "
          + "ist nicht mehr möglich."
        : "Der Zugang ist gesperrt. Bitte prüfen Sie Abo und Zahlung.",
      credits_grund: "abo",
    }), { status: 403, headers: { ...kopf, "Content-Type": "application/json" } });
  } catch (e) {
    // Siehe oben: im Zweifel durchlassen. Der Fehler steht im Protokoll.
    console.error("aboSchranke:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
