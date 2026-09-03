import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { jobsAusfuehren } from "@/lib/jobs/worker";

/**
 * Einen Abruf einstellen und — wenn der Dienstschluessel vorliegt — sofort
 * einen Versuch im Zeitbudget einer Server Action unternehmen. Ohne Schluessel
 * bleibt der Auftrag fuer den Arbeiter liegen (docs/ANLEITUNG.md, Abschnitt 6a).
 */
export async function abrufAnstossen(supabase: SupabaseClient, postfachId: string, arbeiter: string): Promise<string | null> {
  const { error } = await supabase.rpc("job_einstellen", {
    p_art: "postfach",
    p_nutzlast: { postfach_id: postfachId, ausloeser: "manuell" },
    p_prioritaet: 4,
  });
  if (error) return error.message;
  if (process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    try {
      await jobsAusfuehren({ zeitbudgetMs: 8_000, maxAnzahl: 1, arbeiter });
    } catch {
      // Der Auftrag bleibt in der Warteschlange; der Taktgeber holt ihn nach.
    }
  }
  return null;
}
