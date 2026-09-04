import type { SupabaseClient } from "@supabase/supabase-js";

import { mailSenden } from "@/lib/mail/versand";

import { terminErinnerungMail } from "./bestaetigung";

/**
 * Terminerinnerungen (Referenz: Haekchen „Erinnerung" am Termin — sechs
 * Stunden vorher): laeuft mit den Tagesarbeiten des Arbeiters, schickt eine
 * Mail an Zustaendigen und Teilnehmer und vermerkt den Versand am Termin.
 * Ohne Mailversand (MAIL_API_KEY fehlt) bleibt der Termin unvermerkt und
 * wird beim naechsten Lauf erneut versucht — bis eine Stunde nach Beginn.
 */
export async function terminErinnerungenSenden(supabase: SupabaseClient, fetchFn: typeof globalThis.fetch = globalThis.fetch): Promise<{ gesendet: number; fehler: string | null }> {
  const { data, error } = await supabase.rpc("termine_erinnerungen_faellig", { p_max: 50 });
  if (error) return { gesendet: 0, fehler: error.message };
  const basis = (process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/+$/, "");
  let gesendet = 0;
  let fehler: string | null = null;
  for (const t of (data ?? []) as Array<{ id: string; titel: string; art: string; beginnt_am: string; endet_am: string; ganztags: boolean; ort: string | null; notiz: string | null; empfaenger: string[] }>) {
    const mail = terminErinnerungMail(t, `${basis}/kalender/${t.id}`);
    try {
      for (const an of t.empfaenger.filter((a) => a && a.includes("@"))) {
        await mailSenden({ an, betreff: mail.betreff, text: mail.text }, fetchFn);
      }
      await supabase.rpc("termin_erinnert", { p_termin: t.id });
      gesendet++;
    } catch (e) {
      fehler = e instanceof Error ? e.message : "Versand gescheitert";
      break; // ohne Versanddienst nicht 50-mal scheitern
    }
  }
  return { gesendet, fehler };
}
