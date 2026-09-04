import type { SupabaseClient } from "@supabase/supabase-js";

import { mailSenden } from "@/lib/mail/versand";

import { terminErinnerungMail, terminKundenErinnerungMail } from "./bestaetigung";

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

/**
 * Kundenerinnerung (Referenz): etwa sechs Stunden vor dem Termin eine Mail an
 * den Kontakt; bei Terminen vor 12 Uhr am Vorabend ab 18 Uhr; entfaellt, wenn
 * der Termin kurzfristig (weniger als sechs Stunden vorher) vereinbart wurde —
 * der Grund steht am Termin. Private und ganztaegige Termine bleiben aussen vor.
 */
export async function kundenErinnerungenSenden(supabase: SupabaseClient, fetchFn: typeof globalThis.fetch = globalThis.fetch): Promise<{ gesendet: number; uebersprungen: number; fehler: string | null }> {
  const { data, error } = await supabase.rpc("termine_kundenerinnerung_faellig", { p_max: 50 });
  if (error) return { gesendet: 0, uebersprungen: 0, fehler: error.message };
  let gesendet = 0;
  let uebersprungen = 0;
  let fehler: string | null = null;
  type Zeile = { id: string; titel: string; art: string; beginnt_am: string; endet_am: string; ganztags: boolean; ort: string | null; kontakt_email: string; kontakt_anrede: string | null; kontakt_vorname: string | null; kontakt_nachname: string | null; objekt_strasse: string | null; objekt_hausnummer: string | null; objekt_plz: string | null; objekt_ort: string | null; makler: string | null; firma: string | null; kurzfristig: boolean };
  for (const t of (data ?? []) as Zeile[]) {
    if (t.kurzfristig) {
      await supabase.rpc("termin_kunde_erinnert", { p_termin: t.id, p_grund: "kurzfristig vereinbart — keine Erinnerung nötig" });
      uebersprungen++;
      continue;
    }
    const mail = terminKundenErinnerungMail(t, { anrede: t.kontakt_anrede, vorname: t.kontakt_vorname, nachname: t.kontakt_nachname }, t.objekt_strasse || t.objekt_ort ? { strasse: t.objekt_strasse, hausnummer: t.objekt_hausnummer, plz: t.objekt_plz, ort: t.objekt_ort } : null, t.makler ?? "", t.firma ?? "");
    try {
      await mailSenden({ an: t.kontakt_email, betreff: mail.betreff, text: mail.text }, fetchFn);
      await supabase.rpc("termin_kunde_erinnert", { p_termin: t.id, p_grund: null });
      gesendet++;
    } catch (e) {
      fehler = e instanceof Error ? e.message : "Versand gescheitert";
      break;
    }
  }
  return { gesendet, uebersprungen, fehler };
}
