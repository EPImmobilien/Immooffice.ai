import type { Metadata } from "next";
import Link from "next/link";

import { ChecklistenVorlagen } from "@/components/checklisten/ChecklistenVorlagen";
import { ObjektChecklisteStart } from "@/components/checklisten/ObjektChecklisteStart";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { BEREICHE, fortschritt, type Checkliste, type Punkt, type Vorlage, type VorlagenPunkt } from "@/lib/checklisten";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { checklistenVorbereiten } from "@/server/checklisten-aktionen";

export const metadata: Metadata = { title: "Checklisten" };

type Zeile = Checkliste & { punkte: Pick<Punkt, "status" | "pflicht" | "faellig_am">[]; objekt: { objektnummer: string; bezeichnung: string } | null; kontakt: { vorname: string | null; nachname: string | null } | null; lead: { titel: string } | null; zustaendig: { name: string } | null };

export default async function ChecklistenSeite({ searchParams }: { searchParams: Promise<{ ansicht?: string; status?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  await checklistenVorbereiten();
  const supabase = await serverClient();
  const ansicht = p.ansicht === "vorlagen" ? "vorlagen" : "laufend";
  let abfrage = supabase.from("checklisten").select("id, name, bereich, vorlage_id, objekt_id, kontakt_id, lead_id, vertrag_id, zustaendig_id, abgeschlossen_am, erstellt_am, punkte:checklisten_punkte(status, pflicht, faellig_am), objekt:objekte(objektnummer, bezeichnung), kontakt:kontakte(vorname, nachname), lead:akquise_leads(titel), zustaendig:benutzer!checklisten_zustaendig_id_fkey(name)").order("erstellt_am", { ascending: false }).limit(300);
  if (p.status === "abgeschlossen") abfrage = abfrage.not("abgeschlossen_am", "is", null);
  else abfrage = abfrage.is("abgeschlossen_am", null);
  const [{ data: listen }, { data: vorlagen }, { data: punkte }, { data: objekte }] = await Promise.all([
    abfrage,
    supabase.from("checklisten_vorlagen").select("id, name, bereich, beschreibung, ist_standard, aktiv").order("bereich").order("name"),
    supabase.from("checklisten_vorlagen_punkte").select("id, vorlage_id, titel, beschreibung, pflicht, dokumentart, frist_tage, sortierung").order("sortierung"),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(300),
  ]);
  const zeilen = (listen ?? []) as unknown as Zeile[];
  const heute = new Date().toISOString().slice(0, 10);
  const darfAendern = hatRecht(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "kalender", "anlegen", sitzung.uebersteuerung);
  const chip = (aktiv: boolean) => `rounded-[var(--radius)] border px-3 py-1 text-[12px] ${aktiv ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`;

  return (
    <div className="space-y-5">
      <Seitenkopf titel="Checklisten" beschreibung="Arbeitsketten aus Vorlagen — Unterlagen für Verkauf und Vermietung, Akquise bis Auftrag, Objektaufnahme. Unterlagen am Objekt erledigen Punkte automatisch.">
        <Link href="/aufgaben" className="text-[13px] text-akzent hover:underline">Aufgaben</Link>
      </Seitenkopf>
      <div className="flex flex-wrap gap-2">
        <Link href="/checklisten" className={chip(ansicht === "laufend" && p.status !== "abgeschlossen")}>Laufend</Link>
        <Link href="/checklisten?status=abgeschlossen" className={chip(ansicht === "laufend" && p.status === "abgeschlossen")}>Abgeschlossen</Link>
        <Link href="/checklisten?ansicht=vorlagen" className={chip(ansicht === "vorlagen")}>Vorlagen</Link>
      </div>

      {ansicht === "vorlagen" ? (
        <ChecklistenVorlagen vorlagen={(vorlagen ?? []) as Vorlage[]} punkte={(punkte ?? []) as VorlagenPunkt[]} darfAendern={darfAendern} darfLoeschen={hatRecht(sitzung.rolle, "kalender", "loeschen", sitzung.uebersteuerung)} />
      ) : (
        <>
          {darfAnlegen && (
            <Karte>
              <KarteKopf><KarteTitel>Checkliste an einem Objekt starten</KarteTitel><KarteBeschreibung>Für Kontakte, Leads und Verträge starten Sie Checklisten direkt auf deren Seite.</KarteBeschreibung></KarteKopf>
              <KarteInhalt>
                <ObjektChecklisteStart objekte={(objekte ?? []) as { id: string; objektnummer: string; bezeichnung: string }[]} vorlagen={((vorlagen ?? []) as Vorlage[]).filter((v) => v.aktiv)} />
              </KarteInhalt>
            </Karte>
          )}
          {zeilen.length === 0 ? <Hinweis>Keine {p.status === "abgeschlossen" ? "abgeschlossenen" : "laufenden"} Checklisten.</Hinweis> : (
            <div className="space-y-2">
              {zeilen.map((c) => {
                const f = fortschritt(c.punkte, heute);
                const bezug = c.objekt ? `${c.objekt.objektnummer} · ${c.objekt.bezeichnung}` : c.kontakt ? [c.kontakt.vorname, c.kontakt.nachname].filter(Boolean).join(" ") : c.lead ? c.lead.titel : "Vertrag";
                return (
                  <Link key={c.id} href={`/checklisten/${c.id}`} className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-3 transition-colors hover:border-akzent/50">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-text">{c.name}</p>
                      <Marke>{BEREICHE[c.bereich]}</Marke>
                      <Marke ton={c.abgeschlossen_am ? "erfolg" : f.ueberfaellig > 0 ? "fehler" : "info"}>{c.abgeschlossen_am ? "abgeschlossen" : `${f.erledigt}/${f.gesamt}`}</Marke>
                      {f.ueberfaellig > 0 && !c.abgeschlossen_am && <Marke ton="fehler">{f.ueberfaellig} überfällig</Marke>}
                      <span className="ml-auto text-[11px] text-gedaempft">{c.zustaendig?.name} · {datum(c.erstellt_am)}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-gedaempft">{bezug}</p>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-flaeche-gedaempft"><div className={`h-1.5 rounded-full ${c.abgeschlossen_am ? "bg-erfolg" : "bg-akzent"}`} style={{ width: `${f.prozent}%` }} /></div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
