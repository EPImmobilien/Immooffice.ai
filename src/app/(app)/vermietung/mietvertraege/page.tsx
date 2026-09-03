import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Button } from "@/components/ui/Button";
import { Auswahl, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum, euro } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { parteiName, STATUS, type MietvertragStatus, type Partei } from "@/lib/vermietung/mietvertrag";
import { mietvertragAnlegen } from "@/server/vermietung-aktionen";

export const metadata: Metadata = { title: "Mietverträge" };

interface Zeile { id: string; bezeichnung: string; ordner: string | null; status: MietvertragStatus; mieter: Partei; mietbeginn: string | null; gesamtmiete: number; erstellt_am: string; objekt: { objektnummer: string; bezeichnung: string } | null }
const TON: Record<MietvertragStatus, "neutral" | "warnung" | "erfolg" | "info"> = { entwurf: "neutral", zur_unterschrift: "warnung", unterzeichnet: "erfolg", beendet: "info" };

export default async function MietvertraegeSeite({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "vertraege", "lesen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  let abfrage = supabase.from("mietvertraege").select("id, bezeichnung, ordner, status, mieter, mietbeginn, gesamtmiete, erstellt_am, objekt:objekte(objektnummer, bezeichnung)").order("erstellt_am", { ascending: false }).limit(300);
  if (p.status && p.status in STATUS) abfrage = abfrage.eq("status", p.status);
  const [{ data: liste }, { data: objekte }, { data: anfragen }] = await Promise.all([
    abfrage,
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).eq("vermarktungsart", "miete").order("objektnummer").limit(300),
    supabase.from("mietanfragen").select("id, vorname, nachname, objekt_id").in("status", ["zusage", "unterlagen_angefordert", "besichtigung_erfolgt"]).order("eingegangen_am", { ascending: false }).limit(200),
  ]);
  const zeilen = (liste ?? []) as unknown as Zeile[];
  async function anlegen(formular: FormData) {
    "use server";
    await mietvertragAnlegen({}, formular);
  }

  return (
    <>
      <Seitenkopf titel="Mietverträge" beschreibung="Wohnraummietvertrag aus der Vorlage — Vermieter und Mieter, Miete und Kaution, Neubau-Klausel, Unterschrift über den Signaturlink.">
        <Link href="/vermietung" className="text-[13px] text-akzent hover:underline">Zur Vermietung</Link>
      </Seitenkopf>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/vermietung/mietvertraege" className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${!p.status ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>Alle</Link>
        {(Object.keys(STATUS) as MietvertragStatus[]).map((s) => (
          <Link key={s} href={`/vermietung/mietvertraege?status=${s}`} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${p.status === s ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{STATUS[s]}</Link>
        ))}
      </div>

      {darfAnlegen && (
        <Karte className="mb-5">
          <KarteKopf>
            <KarteTitel>Mietvertrag anlegen</KarteTitel>
            <KarteBeschreibung>Objekt und Eigentümer werden aus der Objektakte vorbelegt, der Mieter aus der Anfrage. Alles bleibt im Entwurf editierbar.</KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <form action={anlegen} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Feld id="mv-objekt" beschriftung="Mietobjekt"><Auswahl name="objekt_id" defaultValue=""><option value="">— ohne —</option>{(objekte ?? []).map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}</Auswahl></Feld>
              <Feld id="mv-anfrage" beschriftung="Mieter aus Anfrage" hinweis="Nur Anfragen mit Zusage oder nach Besichtigung"><Auswahl name="mietanfrage_id" defaultValue=""><option value="">— ohne —</option>{(anfragen ?? []).map((a) => <option key={a.id} value={a.id}>{[a.vorname, a.nachname].filter(Boolean).join(" ")}</option>)}</Auswahl></Feld>
              <Button type="submit">Anlegen</Button>
            </form>
          </KarteInhalt>
        </Karte>
      )}

      {zeilen.length === 0 ? (
        <Hinweis>Keine Mietverträge{p.status ? ` mit Status „${STATUS[p.status as MietvertragStatus]}“` : ""}.</Hinweis>
      ) : (
        <div className="space-y-2">
          {zeilen.map((z) => (
            <Link key={z.id} href={`/vermietung/mietvertraege/${z.id}`} className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4 transition-colors hover:border-akzent/50">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text">{z.bezeichnung}</p>
                <Marke ton={TON[z.status]}>{STATUS[z.status]}</Marke>
                {z.ordner && <Marke>{z.ordner}</Marke>}
              </div>
              <p className="mt-0.5 text-[13px] text-gedaempft">{[`Mieter ${parteiName(z.mieter)}`, z.objekt ? `${z.objekt.objektnummer} ${z.objekt.bezeichnung}` : null, z.mietbeginn ? `ab ${datum(z.mietbeginn)}` : null, z.gesamtmiete > 0 ? `${euro(z.gesamtmiete)} monatlich` : null].filter(Boolean).join(" · ")}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
