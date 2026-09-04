"use server";

import { istToken } from "@/lib/portal/token";
import { serverClient } from "@/lib/supabase/server";
import { antwortenAusFormular, auswerten, MAX_PUNKTE } from "@/lib/verwaltung/bewerber";

/**
 * Oeffentlicher Einstellungstest (/bewerbung/[token]) — ohne Konto, mit Token.
 * Die Auswertung laeuft auf dem Server; der Kandidat sieht nur, dass der Test
 * eingegangen ist (Referenz: Ergebnis nur im Chef-Bereich).
 */

export interface BewerbungErgebnis { fehler?: string; erfolg?: string }

export async function bewerbungAbgeben(_vorher: BewerbungErgebnis, formular: FormData): Promise<BewerbungErgebnis> {
  const token = String(formular.get("token") ?? "").trim();
  if (!istToken(token)) return { fehler: "Ungültiger Link." };
  const werte: Record<string, string> = {};
  for (const [k, v] of formular.entries()) if (typeof v === "string") werte[k] = v;
  const antworten = antwortenAusFormular(werte);
  const offen = Object.values(antworten).filter((a) => a === null).length;
  if (offen > 0) return { fehler: `Bitte alle Fragen beantworten — ${offen} fehlen noch.` };
  const a = auswerten(antworten);
  const supabase = await serverClient();
  const { data } = await supabase.rpc("bewerbung_abgeben", {
    p_token: token, p_antworten: antworten, p_punkte: a.punkte, p_max: MAX_PUNKTE, p_empfehlung: a.empfehlung,
    p_freitext: String(formular.get("freitext") ?? "").slice(0, 4000),
  });
  const r = data as { ok?: boolean; grund?: string } | null;
  if (!r?.ok) return { fehler: r?.grund === "fertig" ? "Dieser Test wurde bereits abgegeben." : "Der Test konnte nicht übermittelt werden." };
  return { erfolg: "Vielen Dank — Ihr Test ist eingegangen. Wir melden uns bei Ihnen." };
}
