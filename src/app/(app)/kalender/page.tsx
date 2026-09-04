import type { Metadata } from "next";
import Link from "next/link";

import { Kalenderansicht, type Ansicht } from "@/components/kalender/Kalenderansicht";
import { TerminAnlegen } from "@/components/kalender/TerminAnlegen";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Terminliste } from "@/components/Terminliste";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import type { Termin } from "@/lib/arbeitsmittel";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { TERMIN_FELDER, type KalenderTermin, type Mitarbeiter } from "@/lib/kalender/typen";
import { ausBerlin, heuteBerlin, tagPlus, wochenstart } from "@/lib/kalender/zeit";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kalender" };

/**
 * Kalender (Referenz-Kachel 1): Tag, Woche, Monat und Liste; Farbe je
 * Mitarbeiter, Filter nach Person, Fahrzeiten als Schraffur, Klick in eine
 * Stunde legt einen Termin an. Serien, Erinnerungen, Bestaetigung und
 * Abgleich haengen am Termin bzw. in den Einstellungen.
 */
export default async function KalenderSeite({ searchParams }: { searchParams: Promise<{ ansicht?: string; datum?: string; person?: string; neu?: string; zeit?: string; titel?: string; kontakt?: string; objekt?: string; art?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "kalender", "anlegen", sitzung.uebersteuerung);
  const darfAendern = hatRecht(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const heute = heuteBerlin();
  const ansicht: Ansicht = (["tag", "woche", "monat", "liste"] as Ansicht[]).includes(p.ansicht as Ansicht) ? (p.ansicht as Ansicht) : "woche";
  const datum = p.datum && /^\d{4}-\d{2}-\d{2}$/.test(p.datum) ? p.datum : heute;
  // Personenfilter: eine oder mehrere Personen (Referenz: Auswahl), sonst alle
  const personen = (p.person ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const person = personen.length > 0 ? personen.join(",") : "alle";

  // Sichtbereich
  let von: string;
  let bis: string;
  if (ansicht === "tag") { von = datum; bis = tagPlus(datum, 1); }
  else if (ansicht === "woche") { von = wochenstart(datum); bis = tagPlus(von, 7); }
  else if (ansicht === "monat") { von = wochenstart(`${datum.slice(0, 8)}01`); bis = tagPlus(von, 42); }
  else { von = heute; bis = tagPlus(heute, 120); }

  let abfrage = supabase.from("termine").select(TERMIN_FELDER).is("geloescht_am", null).lt("beginnt_am", ausBerlin(bis, "00:00").toISOString()).gt("endet_am", ausBerlin(von, "00:00").toISOString()).order("beginnt_am");
  if (personen.length > 0) abfrage = abfrage.or(`zustaendig_id.in.(${personen.join(",")}),teilnehmer.ov.{${personen.join(",")}}`);
  const [{ data: termine }, { data: benutzer }, { data: objekte }, { data: kontakte }, { data: ich }] = await Promise.all([
    abfrage,
    supabase.from("benutzer").select("id, name, kalender_farbe").eq("mandant_id", sitzung.mandantId).eq("aktiv", true).order("name"),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("kontakte").select("id, vorname, nachname, firma, email").is("geloescht_am", null).order("nachname").limit(500),
    supabase.from("benutzer").select("besichtigung_dauer_min, fahrzeit_aktiv").eq("id", sitzung.benutzerId).maybeSingle(),
  ]);
  // Beantragter Urlaub erscheint bis zur Entscheidung als „beantragt" (Referenz)
  const { data: antraege } = await supabase.from("urlaubsantraege").select("id, benutzer_id, von, bis, status, benutzer:benutzer!urlaubsantraege_benutzer_id_fkey(name)").eq("status", "beantragt").lte("von", bis).gte("bis", von);
  const mitarbeiter: Mitarbeiter[] = (benutzer ?? []).map((b) => ({ id: b.id as string, name: b.name as string, farbe: (b.kalender_farbe as string | null) ?? null }));
  const urlaube: KalenderTermin[] = ((antraege ?? []) as Array<Record<string, unknown>>)
    .filter((a) => personen.length === 0 || personen.includes(a["benutzer_id"] as string))
    .map((a) => ({
      id: a["id"] as string, titel: `Urlaub (beantragt): ${((a["benutzer"] as { name?: string } | null)?.name) ?? ""}`, art: "sonstiges" as const, notiz: null,
      beginnt_am: ausBerlin(a["von"] as string, "00:00").toISOString(), endet_am: ausBerlin(tagPlus(a["bis"] as string, 1), "00:00").toISOString(), ganztags: true, ort: null, abgesagt_am: null,
      objekt_id: null, kontakt_id: null, zustaendig_id: a["benutzer_id"] as string, teilnehmer: [], privat: false, serie_id: null, serie_regel: null, erinnerung_minuten: null, erinnert_am: null,
      nachfassen: false, nachgefasst_am: null, fahrzeit: null, bestaetigt_am: null, extern_quelle: null, link: "/urlaub",
    }));
  const liste = ([...((termine ?? []) as unknown as KalenderTermin[]), ...urlaube]).sort((a, b) => a.beginnt_am.localeCompare(b.beginnt_am));
  const zeit = p.zeit && /^\d{2}:\d{2}$/.test(p.zeit) ? p.zeit : "10:00";

  return (
    <div className="space-y-5">
      <Seitenkopf titel="Kalender" beschreibung={`${liste.filter((t) => !t.abgesagt_am).length} Termin${liste.filter((t) => !t.abgesagt_am).length === 1 ? "" : "e"} im Zeitraum`}>
        <Link href="/kalender/einstellungen" className="text-[13px] text-akzent hover:underline">Einstellungen, Abo und Abgleich</Link>
      </Seitenkopf>

      {darfAnlegen && (
        <TerminAnlegen
          offen={p.neu === "1"}
          start={{
            datum, zeit, zustaendig_id: sitzung.benutzerId, teilnehmer: [sitzung.benutzerId],
            ...(p.titel ? { titel: p.titel.slice(0, 300) } : {}),
            ...(p.kontakt && /^[0-9a-f-]{36}$/.test(p.kontakt) ? { kontakt_id: p.kontakt } : {}),
            ...(p.objekt && /^[0-9a-f-]{36}$/.test(p.objekt) ? { objekt_id: p.objekt } : {}),
            ...(p.art && ["besichtigung", "beratung", "objektaufnahme", "notartermin", "uebergabe", "telefonat", "sonstiges"].includes(p.art) ? { art: p.art as KalenderTermin["art"] } : {}),
          }}
          mitarbeiter={mitarbeiter}
          objekte={(objekte ?? []).map((o) => ({ id: o.id as string, bezeichnung: `${o.objektnummer as string} · ${o.bezeichnung as string}` }))}
          kontakte={(kontakte ?? []).map((k) => ({ id: k.id as string, bezeichnung: [k.vorname, k.nachname].filter(Boolean).join(" ") + (k.firma ? ` (${k.firma as string})` : ""), email: (k.email as string | null) ?? null }))}
          benutzerId={sitzung.benutzerId}
          standardDauer={Number(ich?.besichtigung_dauer_min ?? 60)}
        />
      )}

      {ansicht === "liste" ? (
        <Karte>
          <KarteKopf><KarteTitel>Anstehend</KarteTitel><KarteBeschreibung>Ab heute, 120 Tage, nach Tagen geordnet.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>
            <div className="mb-3"><Kalenderansicht ansicht="liste" datum={datum} termine={[]} mitarbeiter={mitarbeiter} person={person} heute={heute} fahrzeit={false} /></div>
            <Terminliste termine={liste as unknown as Termin[]} darfAendern={darfAendern} />
          </KarteInhalt>
        </Karte>
      ) : (
        <Kalenderansicht ansicht={ansicht} datum={datum} termine={liste} mitarbeiter={mitarbeiter} person={person} heute={heute} fahrzeit={ich?.fahrzeit_aktiv !== false} />
      )}
    </div>
  );
}
