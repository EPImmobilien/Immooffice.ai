import type { Metadata } from "next";
import Link from "next/link";

import { ProjektFormular } from "@/components/portal/ProjektFormular";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { PROJEKT_STATUS, type ProjektStatus } from "@/lib/portal/typen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Neubauprojekte" };

/** Projektliste (Referenz: Immobilien → Neubauprojekte). */
export default async function ProjekteSeite({ searchParams }: { searchParams: Promise<{ neu?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "portal", "lesen", sitzung.uebersteuerung);
  const darfAendern = hatRecht(sitzung.rolle, "portal", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: projekte }, { data: einheiten }, { data: anfragen }, { data: mitarbeiter }] = await Promise.all([
    supabase.from("projekte").select("id, name, ort, vermarktungsart, status, oeffentlich, erstellt_am").is("geloescht_am", null).order("erstellt_am", { ascending: false }),
    supabase.from("projekt_einheiten").select("projekt_id, status"),
    supabase.from("projekt_anfragen").select("projekt_id").eq("status", "offen"),
    supabase.from("benutzer").select("id, name").eq("aktiv", true).order("name"),
  ]);
  const liste = (projekte ?? []) as Array<{ id: string; name: string; ort: string | null; vermarktungsart: string; status: ProjektStatus; oeffentlich: boolean; erstellt_am: string }>;
  const je = (id: string, s?: string) => ((einheiten ?? []) as Array<{ projekt_id: string; status: string }>).filter((e) => e.projekt_id === id && (!s || e.status === s)).length;
  const offen = (id: string) => ((anfragen ?? []) as Array<{ projekt_id: string }>).filter((a) => a.projekt_id === id).length;
  return (
    <>
      <Seitenkopf titel="Neubauprojekte" beschreibung="Projekte mit Einheiten, Unterlagen, Baufortschritt, Kundenzugängen, Anfragen und Merklisten — plus öffentlicher Projektseite.">
        {darfAendern && !p.neu && <Link href="/projekte?neu=1" className="text-[13px] text-akzent hover:underline">+ Neues Projekt</Link>}
      </Seitenkopf>
      <Hinweis ton="info" className="mb-4">Hinweis zum Rahmen: Der Masterprompt schließt einen Kundenbereich aus; dieses Paket ist auf Weisung des Auftraggebers (1:1-Übernahme) gebaut und kann als Ganzes gestrichen werden (E-2026-09-03-36).</Hinweis>
      {p.neu && darfAendern && (
        <Karte className="mb-4"><KarteKopf><KarteTitel>Neues Projekt</KarteTitel><KarteBeschreibung>Nach dem Anlegen folgen Einheiten, Dateien und Zugänge in der Projektakte.</KarteBeschreibung></KarteKopf><KarteInhalt><ProjektFormular mitarbeiter={(mitarbeiter ?? []).map((m) => ({ id: m.id as string, name: m.name as string }))} /></KarteInhalt></Karte>
      )}
      <Karte>
        <KarteInhalt className="text-[13px]">
          {liste.length === 0 && <p className="text-gedaempft">Noch keine Projekte.</p>}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {liste.map((pr) => (
              <Link key={pr.id} href={`/projekte/${pr.id}`} className="rounded-[var(--radius)] border border-linie p-3 hover:border-akzent">
                <p className="font-medium">{pr.name}</p>
                <p className="text-[12px] text-gedaempft">{pr.ort ?? "—"} · {pr.vermarktungsart === "miete" ? "Vermietung" : "Verkauf"}</p>
                <div className="mt-2 flex flex-wrap gap-1"><Marke ton={pr.status === "aktiv" ? "erfolg" : "neutral"}>{PROJEKT_STATUS[pr.status] ?? pr.status}</Marke>{pr.oeffentlich && <Marke ton="akzent">öffentlich</Marke>}{offen(pr.id) > 0 && <Marke ton="warnung">{offen(pr.id)} Anfrage(n)</Marke>}</div>
                <p className="mt-2 text-[12px]">{je(pr.id)} Einheiten · {je(pr.id, "verfuegbar")} verfügbar · {je(pr.id, "reserviert")} reserviert · {je(pr.id, "verkauft") + je(pr.id, "vermietet")} vergeben</p>
              </Link>
            ))}
          </div>
        </KarteInhalt>
      </Karte>
    </>
  );
}
