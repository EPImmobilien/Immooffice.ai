import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { zeitpunkt } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Aktivitätsprotokoll" };

/** Aktivitaets-Log (Referenz: Admin → Aktivität): unveraenderbares Audit-Log des Unternehmens plus fachlicher Verlauf. */
export default async function ProtokollSeite({ searchParams }: { searchParams: Promise<{ seite?: string; benutzer?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  if (sitzung.rolle !== "inhaber" && sitzung.rolle !== "administrator") return <><Seitenkopf titel="Aktivitätsprotokoll" /><Hinweis ton="warnung">Nur die Verwaltung sieht das Protokoll.</Hinweis></>;
  const seite = Math.max(1, Number(p.seite ?? 1) || 1);
  const je = 100;
  const supabase = await serverClient();
  const [{ data: audit }, { data: aktivitaeten }, { data: benutzer }] = await Promise.all([
    supabase.from("audit_log").select("id, benutzer_id, aktion, ziel_art, ziel_id, details, erstellt_am").order("erstellt_am", { ascending: false }).range((seite - 1) * je, seite * je - 1),
    supabase.from("aktivitaeten").select("id, benutzer_id, typ, beschreibung, objekt_id, kontakt_id, erstellt_am").order("erstellt_am", { ascending: false }).limit(100),
    supabase.from("benutzer").select("id, name"),
  ]);
  const name = (id: string | null) => (benutzer ?? []).find((b) => b.id === id)?.name ?? "System";
  return (
    <>
      <Seitenkopf titel="Aktivitätsprotokoll" beschreibung="Wer hat wann was getan. Das Audit-Log ist unveränderbar (Rechte, Einladungen, Export, Kündigung, Support); der Verlauf zeigt fachliche Änderungen an Objekten und Kontakten.">
        <Link href="/einstellungen" className="text-[13px] text-akzent hover:underline">Einstellungen</Link>
      </Seitenkopf>
      <div className="grid gap-5 lg:grid-cols-2">
        <Karte>
          <KarteKopf><KarteTitel>Audit-Log</KarteTitel><KarteBeschreibung>Seite {seite}</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="text-[12px]">
            {(audit ?? []).length === 0 && <p className="text-gedaempft">Keine Einträge.</p>}
            {(audit ?? []).map((a) => <p key={a.id as string} className="border-t border-linie py-1"><span className="text-gedaempft">{zeitpunkt(a.erstellt_am as string)}</span> · <strong>{name(a.benutzer_id as string | null)}</strong> · {a.aktion as string}{a.ziel_art ? ` (${a.ziel_art as string})` : ""} <span className="text-gedaempft">{a.details ? JSON.stringify(a.details).slice(0, 140) : ""}</span></p>)}
            <div className="mt-2 flex gap-2">{seite > 1 && <Link href={`/einstellungen/protokoll?seite=${seite - 1}`} className="text-akzent hover:underline">‹ neuer</Link>}{(audit ?? []).length === je && <Link href={`/einstellungen/protokoll?seite=${seite + 1}`} className="text-akzent hover:underline">älter ›</Link>}</div>
          </KarteInhalt>
        </Karte>
        <Karte>
          <KarteKopf><KarteTitel>Fachlicher Verlauf (letzte 100)</KarteTitel></KarteKopf>
          <KarteInhalt className="text-[12px]">
            {(aktivitaeten ?? []).map((a) => <p key={a.id as string} className="border-t border-linie py-1"><span className="text-gedaempft">{zeitpunkt(a.erstellt_am as string)}</span> · <strong>{name(a.benutzer_id as string | null)}</strong> · {a.typ as string} · {a.beschreibung as string}{a.objekt_id ? <> · <Link href={`/objekte/${a.objekt_id as string}`} className="text-akzent hover:underline">Objekt</Link></> : null}{a.kontakt_id ? <> · <Link href={`/kontakte/${a.kontakt_id as string}`} className="text-akzent hover:underline">Kontakt</Link></> : null}</p>)}
          </KarteInhalt>
        </Karte>
      </div>
    </>
  );
}
