import type { Metadata } from "next";

import { Seitenkopf } from "@/components/Seitenkopf";
import { UrlaubAnsicht, type UrlaubZeile } from "@/components/verwaltung/UrlaubAnsicht";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { heuteBerlin } from "@/lib/kalender/zeit";
import { serverClient } from "@/lib/supabase/server";
import { bilanz, ueberschneidungen, type UrlaubAntrag, type UrlaubProfil } from "@/lib/verwaltung/urlaub";

export const metadata: Metadata = { title: "Urlaub" };

/** Urlaub (Referenz: Admin → Urlaub und Mitarbeiter-Antrag): Bilanz, Anträge, Entscheidung, Kontingente. */
export default async function UrlaubSeite({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  const istVerwaltung = sitzung.rolle === "inhaber" || sitzung.rolle === "administrator";
  const heute = heuteBerlin();
  const jahr = /^\d{4}$/.test(p.jahr ?? "") ? Number(p.jahr) : Number(heute.slice(0, 4));
  const supabase = await serverClient();
  const [benutzer, antraege, hinweise] = await Promise.all([
    supabase.from("benutzer").select("id, name, rolle, eintritt, urlaubstage_jahr, urlaub_uebertrag, urlaub_staffel, bundesland").eq("aktiv", true).order("name"),
    supabase.from("urlaubsantraege").select("id, benutzer_id, von, bis, arbeitstage, status, bemerkung").gte("von", `${jahr - 1}-01-01`).lte("von", `${jahr}-12-31`).order("von"),
    supabase.from("urlaub_hinweise").select("benutzer_id, gesendet_am, resttage").eq("jahr", jahr).order("gesendet_am", { ascending: false }),
  ]);
  const liste = ((antraege.data ?? []) as Array<Record<string, unknown>>).map((a) => ({ ...(a as unknown as UrlaubAntrag), arbeitstage: Number(a["arbeitstage"]) }));
  const personen = (benutzer.data ?? []) as Array<{ id: string; name: string; rolle: string; eintritt: string | null; urlaubstage_jahr: number; urlaub_uebertrag: number; urlaub_staffel: Record<string, number> | null; bundesland: string | null }>;
  const sichtbar = istVerwaltung ? personen : personen.filter((b) => b.id === sitzung.benutzerId);
  const zeilen: UrlaubZeile[] = sichtbar.map((b) => {
    const profil: UrlaubProfil = { id: b.id, name: b.name, eintritt: b.eintritt, urlaubstage_jahr: Number(b.urlaubstage_jahr), urlaub_uebertrag: Number(b.urlaub_uebertrag), urlaub_staffel: b.urlaub_staffel };
    const bl = bilanz(profil, liste, jahr, heute);
    const naechster = bl.eintraege.filter((a) => a.status === "genehmigt" && a.von >= heute).sort((x, y) => x.von.localeCompare(y.von))[0] ?? null;
    const h = (hinweise.data ?? []).find((x) => x.benutzer_id === b.id);
    return { benutzer: { ...b, urlaubstage_jahr: Number(b.urlaubstage_jahr), urlaub_uebertrag: Number(b.urlaub_uebertrag) }, bilanz: bl, naechster, hinweis: h ? { gesendet_am: h.gesendet_am as string, resttage: Number(h.resttage) } : null };
  });
  const offene = istVerwaltung ? liste.filter((a) => a.status === "beantragt").map((a) => ({ ...a, name: personen.find((b) => b.id === a.benutzer_id)?.name ?? "—", ueberschneidungen: ueberschneidungen(a, liste).map((x) => personen.find((b) => b.id === x.benutzer_id)?.name ?? "—") })) : [];
  return (
    <>
      <Seitenkopf titel="Urlaub" beschreibung="Anspruch, Übertrag bis 31. März, Anträge und Genehmigung. Genehmigter Urlaub erscheint im Kalender und in der Arbeitszeit." />
      <UrlaubAnsicht jahr={jahr} eigeneId={sitzung.benutzerId} zeilen={zeilen} offene={offene} istVerwaltung={istVerwaltung} />
    </>
  );
}
