import type { Metadata } from "next";
import Link from "next/link";

import { RechnungAnlegen } from "@/components/rechnungen/RechnungAnlegen";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum, euro } from "@/lib/format";
import { RECHNUNG_STATUS, type RechnungStatus } from "@/lib/rechnungen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rechnungen" };

interface Zeile { id: string; rechnungsnummer: string | null; typ: "rechnung" | "storno"; status: RechnungStatus; ist_test: boolean; empfaenger_name: string; ausstellungsdatum: string; faellig_am: string | null; brutto: number; bezahlt_am: string | null; objekt: { objektnummer: string; bezeichnung: string } | null }
const TON: Record<RechnungStatus, "neutral" | "warnung" | "erfolg" | "info"> = { entwurf: "neutral", gestellt: "warnung", bezahlt: "erfolg", storniert: "info" };

/**
 * Rechnungen (Kachel 14 der Referenz): Uebersicht mit offenen Posten, Filter
 * nach Status, Anlage aus Kunde/Kontakt/Objekt/Maklervertrag, Stammdaten
 * fuer Absender und Kunden.
 */
export default async function RechnungenSeite({ searchParams }: { searchParams: Promise<{ status?: string; objekt?: string; vertrag?: string; kontakt?: string; jahr?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "rechnungen", "lesen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "rechnungen", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const heute = new Date().toISOString().slice(0, 10);

  let abfrage = supabase.from("rechnungen").select("id, rechnungsnummer, typ, status, ist_test, empfaenger_name, ausstellungsdatum, faellig_am, brutto, bezahlt_am, objekt:objekte(objektnummer, bezeichnung)").order("erstellt_am", { ascending: false }).limit(300);
  if (p.status && p.status in RECHNUNG_STATUS) abfrage = abfrage.eq("status", p.status);
  if (p.status === "ueberfaellig") abfrage = abfrage.eq("status", "gestellt").lt("faellig_am", heute);
  if (p.objekt) abfrage = abfrage.eq("objekt_id", p.objekt);
  const [{ data: roh }, { data: absender }, { data: kunden }, { data: kontakte }, { data: objekte }, { data: vertraege }] = await Promise.all([
    abfrage,
    supabase.from("rechnungs_absender").select("id, name, typ").eq("aktiv", true).order("typ").order("sortierung"),
    supabase.from("rechnungskunden").select("id, name, ort").order("name").limit(500),
    supabase.from("kontakte").select("id, vorname, nachname, firma").is("geloescht_am", null).order("nachname").limit(500),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("vertraege").select("id, titel").eq("art", "maklervertrag").order("erstellt_am", { ascending: false }).limit(200),
  ]);
  const zeilen = (roh ?? []).map((z) => ({ ...z, brutto: Number(z.brutto) })) as unknown as Zeile[];
  const offen = zeilen.filter((z) => z.status === "gestellt" && !z.ist_test);
  const ueberfaellig = offen.filter((z) => z.faellig_am !== null && z.faellig_am < heute);
  const summe = (l: Zeile[]) => l.reduce((a, z) => a + z.brutto, 0);
  const jahr = heute.slice(0, 4);
  const bezahltJahr = zeilen.filter((z) => z.status === "bezahlt" && !z.ist_test && (z.bezahlt_am ?? "").startsWith(jahr));

  const filter = [["", "Alle"], ["entwurf", "Entwürfe"], ["gestellt", "Offen"], ["ueberfaellig", "Überfällig"], ["bezahlt", "Bezahlt"], ["storniert", "Storniert"]] as const;

  return (
    <>
      <Seitenkopf titel="Rechnungen" beschreibung="Fortlaufender Nummernkreis, festgeschriebene Belege, Storno als Gegenrechnung — GoBD-konform aufgebaut.">
        <div className="flex items-center gap-3 text-[13px]">
          <Link href="/rechnungen/absender" className="text-akzent hover:underline">Absender & Nummernkreis</Link>
          <Link href="/rechnungen/kunden" className="text-akzent hover:underline">Kunden</Link>
          <Link href="/briefe" className="text-akzent hover:underline">Geschäftsbriefe</Link>
        </div>
      </Seitenkopf>

      {!p.status && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Karte className="p-4"><p className="text-[12px] uppercase tracking-wide text-gedaempft">Offen</p><p className="font-titel text-xl font-semibold text-text">{euro(summe(offen), true)}</p><p className="text-[12px] text-gedaempft">{offen.length} Rechnung(en)</p></Karte>
          <Karte className="p-4"><p className="text-[12px] uppercase tracking-wide text-gedaempft">Überfällig</p><p className={`font-titel text-xl font-semibold ${ueberfaellig.length > 0 ? "text-fehler" : "text-text"}`}>{euro(summe(ueberfaellig), true)}</p><p className="text-[12px] text-gedaempft">{ueberfaellig.length} Rechnung(en)</p></Karte>
          <Karte className="p-4"><p className="text-[12px] uppercase tracking-wide text-gedaempft">Bezahlt {jahr}</p><p className="font-titel text-xl font-semibold text-text">{euro(summe(bezahltJahr), true)}</p><p className="text-[12px] text-gedaempft">{bezahltJahr.length} Rechnung(en)</p></Karte>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {filter.map(([wert, label]) => (
          <Link key={wert} href={wert ? `/rechnungen?status=${wert}` : "/rechnungen"} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${(p.status ?? "") === wert ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{label}</Link>
        ))}
      </div>

      {darfAnlegen && (
        <Karte className="mb-5">
          <KarteKopf><KarteTitel>Rechnung anlegen</KarteTitel><KarteBeschreibung>Entsteht als Entwurf. Aus einem Maklervertrag wird die Provisionsposition vorbelegt; aus einem Kontakt der Rechnungskunde.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>
            <RechnungAnlegen
              absender={(absender ?? []).map((a) => ({ id: a.id as string, bezeichnung: `${a.name as string}${a.typ === "persoenlich" ? " (persönlich)" : ""}` }))}
              kunden={(kunden ?? []).map((k) => ({ id: k.id as string, bezeichnung: `${k.name as string}${k.ort ? `, ${k.ort as string}` : ""}` }))}
              kontakte={(kontakte ?? []).map((k) => ({ id: k.id as string, bezeichnung: [k.vorname, k.nachname].filter(Boolean).join(" ") + (k.firma ? ` (${k.firma as string})` : "") }))}
              objekte={(objekte ?? []).map((o) => ({ id: o.id as string, bezeichnung: `${o.objektnummer as string} · ${o.bezeichnung as string}` }))}
              vertraege={(vertraege ?? []).map((v) => ({ id: v.id as string, bezeichnung: v.titel as string }))}
              vorgabe={{ ...(p.objekt ? { objekt_id: p.objekt } : {}), ...(p.vertrag ? { vertrag_id: p.vertrag } : {}), ...(p.kontakt ? { kontakt_id: p.kontakt } : {}) }}
            />
          </KarteInhalt>
        </Karte>
      )}

      {zeilen.length === 0 ? (
        <Hinweis>Keine Rechnungen{p.status ? " in dieser Auswahl" : ""}.</Hinweis>
      ) : (
        <div className="space-y-2">
          {zeilen.map((z) => (
            <Link key={z.id} href={`/rechnungen/${z.id}`} className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-3 transition-colors hover:border-akzent/50">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text">{z.rechnungsnummer ?? "Entwurf"} · {z.empfaenger_name || "Ohne Empfänger"}</p>
                <Marke ton={TON[z.status]}>{RECHNUNG_STATUS[z.status]}</Marke>
                {z.typ === "storno" && <Marke ton="info">Storno</Marke>}
                {z.ist_test && <Marke ton="warnung">Test</Marke>}
                {z.status === "gestellt" && z.faellig_am && z.faellig_am < heute && <Marke ton="fehler">überfällig</Marke>}
                <span className="ml-auto text-sm tabular-nums text-text">{euro(z.brutto, true)}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-gedaempft">{[`vom ${datum(z.ausstellungsdatum)}`, z.faellig_am && z.status === "gestellt" ? `fällig ${datum(z.faellig_am)}` : null, z.bezahlt_am ? `bezahlt ${datum(z.bezahlt_am)}` : null, z.objekt ? `${z.objekt.objektnummer} ${z.objekt.bezeichnung}` : null].filter(Boolean).join(" · ")}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
