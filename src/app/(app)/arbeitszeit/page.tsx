import type { Metadata } from "next";

import { Seitenkopf } from "@/components/Seitenkopf";
import { ArbeitszeitAnsicht } from "@/components/verwaltung/ArbeitszeitAnsicht";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { heuteBerlin } from "@/lib/kalender/zeit";
import { serverClient } from "@/lib/supabase/server";
import { monatsbilanz, type Stempel, type Tag, type Wochenmodell } from "@/lib/verwaltung/arbeitszeit";
import type { Bundesland } from "@/lib/verwaltung/feiertage";

export const metadata: Metadata = { title: "Arbeitszeit" };

/** Arbeitszeit-Monat (Referenz: Arbeitszeit): eigener Monat, Verwaltung sieht das Team. */
export default async function ArbeitszeitSeite({ searchParams }: { searchParams: Promise<{ monat?: string; benutzer?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  const istVerwaltung = sitzung.rolle === "inhaber" || sitzung.rolle === "administrator";
  const heute = heuteBerlin();
  const m = /^\d{4}-\d{2}$/.test(p.monat ?? "") ? (p.monat as string) : heute.slice(0, 7);
  const jahr = Number(m.slice(0, 4)); const monat = Number(m.slice(5, 7));
  const benutzerId = istVerwaltung && p.benutzer && /^[0-9a-f-]{36}$/.test(p.benutzer) ? p.benutzer : sitzung.benutzerId;
  const supabase = await serverClient();
  const von = `${m}-01`; const bis = `${m}-31`;
  const [team, modelle, stempel, tage, benutzer] = await Promise.all([
    istVerwaltung ? supabase.from("benutzer").select("id, name").eq("aktiv", true).order("name") : Promise.resolve({ data: [{ id: sitzung.benutzerId, name: sitzung.name }] }),
    supabase.from("arbeitszeit_modelle").select("*").eq("benutzer_id", benutzerId).order("gueltig_ab", { ascending: false }),
    supabase.from("arbeitszeit_stempel").select("id, benutzer_id, datum, richtung, zeitpunkt, quelle").eq("benutzer_id", benutzerId).gte("datum", von).lte("datum", bis).order("zeitpunkt"),
    supabase.from("arbeitszeit_tage").select("*").eq("benutzer_id", benutzerId).gte("datum", von).lte("datum", bis),
    supabase.from("benutzer").select("bundesland, name").eq("id", benutzerId).maybeSingle(),
  ]);
  const bilanz = monatsbilanz(jahr, monat, (modelle.data ?? []) as Wochenmodell[], (stempel.data ?? []) as Stempel[], (tage.data ?? []) as Tag[], (benutzer.data?.bundesland as Bundesland | null) ?? null, heute);
  return (
    <>
      <Seitenkopf titel="Arbeitszeit" beschreibung={`${(benutzer.data?.name as string) ?? sitzung.name} · Stempeluhr auf der Übersicht, hier der Monat mit Soll, Ist und Nachträgen.`} />
      <ArbeitszeitAnsicht jahr={jahr} monat={monat} benutzerId={benutzerId} bilanz={bilanz} modelle={(modelle.data ?? []) as Wochenmodell[]} team={(team.data ?? []).map((t) => ({ id: t.id as string, name: t.name as string }))} istVerwaltung={istVerwaltung} />
    </>
  );
}
