import type { Metadata } from "next";
import Link from "next/link";

import { BriefAnlegen } from "@/components/briefe/BriefAnlegen";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { BRIEF_VORLAGEN } from "@/lib/rechnungen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Geschäftsbriefe" };

const STATUS = { entwurf: "Entwurf", erstellt: "PDF erstellt", versendet: "Versendet" } as const;
const TON = { entwurf: "neutral", erstellt: "info", versendet: "erfolg" } as const;

/** Geschaeftsbriefe auf Briefpapier (Kachel 14): Behoerden- und Eigentuemerschreiben aus Vorlagen. */
export default async function BriefeSeite({ searchParams }: { searchParams: Promise<{ status?: string; objekt?: string; kontakt?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "rechnungen", "lesen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "rechnungen", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  let abfrage = supabase.from("briefe").select("id, vorlage, empfaenger_name, datum, betreff, status, versendet_am, objekt:objekte(objektnummer, bezeichnung)").order("erstellt_am", { ascending: false }).limit(300);
  if (p.status && p.status in STATUS) abfrage = abfrage.eq("status", p.status);
  if (p.objekt) abfrage = abfrage.eq("objekt_id", p.objekt);
  const [{ data: briefe }, { data: absender }, { data: kontakte }, { data: objekte }] = await Promise.all([
    abfrage,
    supabase.from("rechnungs_absender").select("id, name").eq("aktiv", true).order("typ").order("sortierung"),
    supabase.from("kontakte").select("id, vorname, nachname, firma").is("geloescht_am", null).order("nachname").limit(500),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
  ]);
  const zeilen = (briefe ?? []) as unknown as Array<{ id: string; vorlage: string | null; empfaenger_name: string; datum: string; betreff: string; status: keyof typeof STATUS; versendet_am: string | null; objekt: { objektnummer: string; bezeichnung: string } | null }>;

  return (
    <>
      <Seitenkopf titel="Geschäftsbriefe" beschreibung="Behörden- und Eigentümerschreiben aus Vorlagen — auf dem eigenen Briefpapier als PDF, per Post oder aus dem Postfach.">
        <div className="flex items-center gap-3 text-[13px]">
          <Link href="/rechnungen" className="text-akzent hover:underline">Rechnungen</Link>
          <Link href="/rechnungen/absender" className="text-akzent hover:underline">Absender & Briefpapier</Link>
        </div>
      </Seitenkopf>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/briefe" className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${!p.status ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>Alle</Link>
        {(Object.keys(STATUS) as Array<keyof typeof STATUS>).map((s) => <Link key={s} href={`/briefe?status=${s}`} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${p.status === s ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{STATUS[s]}</Link>)}
      </div>
      {darfAnlegen && (
        <Karte className="mb-5">
          <KarteKopf><KarteTitel>Brief anlegen</KarteTitel><KarteBeschreibung>Vorlagen für Flurkarte, Grundbuch, Altlasten, Baulasten, Eigentümer-Unterlagen und -Bericht, Dankschreiben — oder ein freier Brief.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>
            <BriefAnlegen
              absender={(absender ?? []).map((a) => ({ id: a.id as string, bezeichnung: a.name as string }))}
              kontakte={(kontakte ?? []).map((k) => ({ id: k.id as string, bezeichnung: [k.vorname, k.nachname].filter(Boolean).join(" ") + (k.firma ? ` (${k.firma as string})` : "") }))}
              objekte={(objekte ?? []).map((o) => ({ id: o.id as string, bezeichnung: `${o.objektnummer as string} · ${o.bezeichnung as string}` }))}
              vorgabe={{ ...(p.objekt ? { objekt_id: p.objekt } : {}), ...(p.kontakt ? { kontakt_id: p.kontakt } : {}) }}
            />
          </KarteInhalt>
        </Karte>
      )}
      {zeilen.length === 0 ? (
        <Hinweis>Keine Briefe{p.status ? " in dieser Auswahl" : ""}.</Hinweis>
      ) : (
        <div className="space-y-2">
          {zeilen.map((z) => (
            <Link key={z.id} href={`/briefe/${z.id}`} className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-3 transition-colors hover:border-akzent/50">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text">{z.betreff}</p>
                <Marke ton={TON[z.status]}>{STATUS[z.status]}</Marke>
                {z.vorlage && BRIEF_VORLAGEN[z.vorlage] && <Marke>{BRIEF_VORLAGEN[z.vorlage]?.bezeichnung}</Marke>}
              </div>
              <p className="mt-0.5 text-[13px] text-gedaempft">{[`an ${z.empfaenger_name}`, `vom ${datum(z.datum)}`, z.objekt ? `${z.objekt.objektnummer} ${z.objekt.bezeichnung}` : null, z.versendet_am ? `versendet ${datum(z.versendet_am)}` : null].filter(Boolean).join(" · ")}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
