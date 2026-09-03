import type { SupabaseClient } from "@supabase/supabase-js";

import type { Vergleichswert } from "@/lib/akquise/preisfinder";
import { STANDARD_EINSTELLUNGEN, type Einstellungen } from "@/lib/akquise/stammdaten";

/** Vergleichswerte des eigenen Bestands: verkaufte Objekte mit Kaufpreis und Wohnflaeche. */
export async function vergleichswerteLaden(supabase: SupabaseClient): Promise<Vergleichswert[]> {
  const { data } = await supabase.from("objekte").select("bezeichnung, plz, ort, objektkategorie, kaufpreis, wohnflaeche, geaendert_am").in("status", ["verkauft"]).is("geloescht_am", null).not("kaufpreis", "is", null).not("wohnflaeche", "is", null).order("geaendert_am", { ascending: false }).limit(200);
  return ((data ?? []) as Array<{ bezeichnung: string; plz: string | null; ort: string | null; objektkategorie: string | null; kaufpreis: number | null; wohnflaeche: number | null; geaendert_am: string }>)
    .map((o) => ({ bezeichnung: o.bezeichnung, plz: o.plz, ort: o.ort, objektkategorie: o.objektkategorie, kaufpreis: o.kaufpreis === null ? null : Number(o.kaufpreis), wohnflaeche: o.wohnflaeche === null ? null : Number(o.wohnflaeche), verkauft_am: o.geaendert_am }));
}


/** Einstellungen des Mandanten (Preis-Finder, Nachfassen, Verlustgruende), sonst Standard. */
export async function akquiseEinstellungenLaden(supabase: SupabaseClient): Promise<Einstellungen> {
  const { data } = await supabase.from("akquise_einstellungen").select("provision_satz, startpreis_faktor, spanne_prozent, nachfassen_tage, verlustgruende").maybeSingle();
  if (!data) return STANDARD_EINSTELLUNGEN;
  return { provision_satz: Number(data.provision_satz), startpreis_faktor: Number(data.startpreis_faktor), spanne_prozent: Number(data.spanne_prozent), nachfassen_tage: Number(data.nachfassen_tage), verlustgruende: (data.verlustgruende as string[]) ?? STANDARD_EINSTELLUNGEN.verlustgruende };
}
