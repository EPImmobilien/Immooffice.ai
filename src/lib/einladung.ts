import type { SupabaseClient } from "@supabase/supabase-js";

import type { Rolle } from "@/lib/auth/rechte";

/** Antwort von `einladung_ansehen()`: nur, was die Einladungsseite braucht. */
export interface EinladungAnsicht {
  zustand: "ok" | "abgelaufen" | "eingeloest" | "widerrufen" | "unbekannt";
  unternehmen: string | null;
  email: string | null;
  rolle: Rolle | null;
  gueltig_bis: string | null;
}

export const EINLADUNGS_TOKEN = /^[0-9a-f]{64}$/;

/**
 * Liest eine Einladung anhand des Tokens — ohne Anmeldung moeglich.
 *
 * Ein Token, das nicht dem Format entspricht, wird gar nicht erst an die
 * Datenbank geschickt; die Antwort ist dann „unbekannt", wie bei jedem
 * anderen ungueltigen Token auch.
 */
export async function einladungAnsehen(
  supabase: SupabaseClient,
  token: string | undefined,
): Promise<EinladungAnsicht> {
  const unbekannt: EinladungAnsicht = { zustand: "unbekannt", unternehmen: null, email: null, rolle: null, gueltig_bis: null };
  if (!token || !EINLADUNGS_TOKEN.test(token)) return unbekannt;

  const { data } = await supabase.rpc("einladung_ansehen", { p_token: token });
  const zeile = (Array.isArray(data) ? data[0] : null) as EinladungAnsicht | null;
  return zeile ?? unbekannt;
}

/**
 * Spalten und Zeilentyp der Einladungsliste. Liegen hier und nicht in der
 * Client-Komponente: Ein Wert, der aus einem "use client"-Modul in eine
 * Server-Komponente importiert wird, kommt dort als Client-Referenz an —
 * nicht als Text. Genau das hat /einstellungen im Produktionsbuild zum
 * Absturz gebracht.
 */
export interface EinladungZeile {
  id: string;
  email: string;
  rolle: Rolle;
  gueltig_bis: string;
  eingeloest_am: string | null;
  widerrufen_am: string | null;
  erstellt_am: string;
}

/** Spalten und Filter fuer offene Einladungen — an einer Stelle, fuer alle Seiten. */
export const EINLADUNG_SPALTEN = "id, email, rolle, gueltig_bis, eingeloest_am, widerrufen_am, erstellt_am";

