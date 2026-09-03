import type { Metadata } from "next";
import Link from "next/link";

import { Kachel } from "@/components/Kachel";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Marke } from "@/components/ui/Status";
import { pipelinePrognose } from "@/lib/akquise/auswertung";
import { leadAdresse, nachfassLage, type LeadZeile, type Stufe } from "@/lib/akquise/stammdaten";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum, euro } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { akquiseVorbereiten } from "@/server/akquise-aktionen";

export const metadata: Metadata = { title: "Akquise" };

/** Akquise-Übersicht (Referenz-Kachel „Akquise"): Leads, Nachfassen, Prognose, Kampagnen, Automationen, Radar. */
export default async function AkquiseSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "lesen", sitzung.uebersteuerung);
  await akquiseVorbereiten();
  const supabase = await serverClient();
  const heute = new Date().toISOString().slice(0, 10);
  const [{ data: leads }, { data: stufen }, kampagnen, laeufe, radar, { data: aktivitaeten }] = await Promise.all([
    supabase.from("akquise_leads").select("id, titel, strasse, hausnummer, plz, ort, status, stufe_id, provision_erwartet, nachfassen, nachfassen_am, erstellt_am").order("erstellt_am", { ascending: false }).limit(1000),
    supabase.from("akquise_stufen").select("id, pipeline_id, name, zusatz, sortierung, wahrscheinlichkeit, ist_gewonnen, ist_verloren"),
    supabase.from("akquise_kampagnen").select("id", { count: "exact", head: true }).eq("aktiv", true),
    supabase.from("akquise_laeufe").select("id", { count: "exact", head: true }).eq("status", "geplant"),
    supabase.from("akquise_radar").select("id", { count: "exact", head: true }).eq("status", "neu"),
    supabase.from("akquise_aktivitaeten").select("id, lead_id, typ, titel, faellig_am, lead:akquise_leads(titel)").is("erledigt_am", null).not("faellig_am", "is", null).lte("faellig_am", `${heute}T23:59:59Z`).order("faellig_am").limit(20),
  ]);
  const alle = ((leads ?? []) as unknown as LeadZeile[]).map((l) => ({ ...l, provision_erwartet: l.provision_erwartet === null ? null : Number(l.provision_erwartet) }));
  const offen = alle.filter((l) => l.status === "offen");
  const nachfassen = offen.filter((l) => nachfassLage(l, heute) === "ueberfaellig" || nachfassLage(l, heute) === "heute").sort((a, b) => (a.nachfassen_am ?? "").localeCompare(b.nachfassen_am ?? ""));
  const prognose = pipelinePrognose(alle, (stufen ?? []) as Stufe[]);
  const gewonnenMonat = alle.filter((l) => l.status === "gewonnen" && (l.gewonnen_am ?? "").slice(0, 7) === heute.slice(0, 7)).length;

  return (
    <>
      <Seitenkopf titel="Akquise" beschreibung="Eigentümer-Leads von der ersten Anfrage bis zum Maklervertrag — Pipeline, Nachfassen, Kampagnen, Automationen, Preis-Finder." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kachel daten={{ titel: "Leads", hinweis: "Liste und Kanban je Pipeline, Dossier, Preis-Finder, Aktivitäten", pfad: "/akquise/leads", zahl: offen.length, zahlHinweis: `offen · ${gewonnenMonat} gewonnen im Monat`, symbol: "kontakte", betont: nachfassen.length > 0 }} />
        <Kachel daten={{ titel: "Nachfassen", hinweis: "Heute fällige und überfällige Leads", pfad: "/akquise/leads?nachfassen=1", zahl: nachfassen.length, zahlHinweis: "fällig", symbol: "aufgaben" }} />
        <Kachel daten={{ titel: "Prognose", hinweis: "Erwartete Provision der offenen Leads, gewichtet nach Stufen-Wahrscheinlichkeit", pfad: "/akquise/auswertung", zahl: euro(prognose.gewichtet), zahlHinweis: `roh ${euro(prognose.roh)}`, symbol: "auswertungen" }} />
        <Kachel daten={{ titel: "Kampagnen und Quellen", hinweis: "Budget und Ausgaben, Quellen mit Pipeline-Zuordnung", pfad: "/akquise/kampagnen", zahl: kampagnen.count ?? 0, zahlHinweis: "aktiv", symbol: "marketing" }} />
        <Kachel daten={{ titel: "Automationen", hinweis: "Matrix Pipeline × Stufe × Quelle, Vorlagen, geplante Läufe", pfad: "/akquise/automationen", zahl: laeufe.count ?? 0, zahlHinweis: "Läufe geplant", symbol: "einstellungen" }} />
        <Kachel daten={{ titel: "Akquise-Radar", hinweis: "Privatinserate erfassen und als Lead übernehmen", pfad: "/akquise/radar", zahl: radar.count ?? 0, zahlHinweis: "neu", symbol: "objekte" }} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Karte>
          <KarteKopf><KarteTitel>Nachfassen</KarteTitel><KarteBeschreibung>Leads, deren Nachfasstermin heute oder früher liegt.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>
            {nachfassen.length === 0 ? <p className="text-[13px] text-gedaempft">Nichts fällig.</p> : (
              <ul className="divide-y divide-linie">
                {nachfassen.slice(0, 12).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                    <Link href={`/akquise/leads/${l.id}`} className="min-w-0 truncate text-text hover:underline">{l.titel} <span className="text-gedaempft">· {leadAdresse(l)}</span></Link>
                    <Marke ton={nachfassLage(l, heute) === "ueberfaellig" ? "fehler" : "warnung"}>{datum(l.nachfassen_am)}</Marke>
                  </li>
                ))}
              </ul>
            )}
          </KarteInhalt>
        </Karte>
        <Karte>
          <KarteKopf><KarteTitel>Fällige Aktivitäten</KarteTitel><KarteBeschreibung>Geplante Anrufe, Aufgaben und Mail-Entwürfe — auch aus Automationen.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>
            {(aktivitaeten ?? []).length === 0 ? <p className="text-[13px] text-gedaempft">Keine fälligen Aktivitäten.</p> : (
              <ul className="divide-y divide-linie">
                {((aktivitaeten ?? []) as unknown as Array<{ id: string; lead_id: string; typ: string; titel: string; faellig_am: string; lead: { titel: string } | null }>).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                    <Link href={`/akquise/leads/${a.lead_id}#aktivitaeten`} className="min-w-0 truncate text-text hover:underline"><Marke>{a.typ}</Marke> {a.titel} <span className="text-gedaempft">· {a.lead?.titel}</span></Link>
                    <span className="shrink-0 text-gedaempft">{datum(a.faellig_am)}</span>
                  </li>
                ))}
              </ul>
            )}
          </KarteInhalt>
        </Karte>
      </div>
      <p className="mt-6 text-[12px] text-gedaempft">Pipelines, Stufen, Verlustgründe und Preis-Finder-Vorgaben verwalten Sie unter <Link href="/akquise/einstellungen" className="text-akzent hover:underline">Akquise-Einstellungen</Link>.</p>
    </>
  );
}
