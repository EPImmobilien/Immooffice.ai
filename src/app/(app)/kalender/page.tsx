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
export default async function KalenderSeite({ searchParams }: { searchParams: Promise<{ ansicht?: string; datum?: string; person?: string; neu?: string; zeit?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "kalender", "anlegen", sitzung.uebersteuerung);
  const darfAendern = hatRecht(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const heute = heuteBerlin();
  const ansicht: Ansicht = (["tag", "woche", "monat", "liste"] as Ansicht[]).includes(p.ansicht as Ansicht) ? (p.ansicht as Ansicht) : "woche";
  const datum = p.datum && /^\d{4}-\d{2}-\d{2}$/.test(p.datum) ? p.datum : heute;
  const person = p.person && /^[0-9a-f-]{36}$/.test(p.person) ? p.person : "alle";

  // Sichtbereich
  let von: string;
  let bis: string;
  if (ansicht === "tag") { von = datum; bis = tagPlus(datum, 1); }
  else if (ansicht === "woche") { von = wochenstart(datum); bis = tagPlus(von, 7); }
  else if (ansicht === "monat") { von = wochenstart(`${datum.slice(0, 8)}01`); bis = tagPlus(von, 42); }
  else { von = heute; bis = tagPlus(heute, 120); }

  let abfrage = supabase.from("termine").select(TERMIN_FELDER).is("geloescht_am", null).lt("beginnt_am", ausBerlin(bis, "00:00").toISOString()).gt("endet_am", ausBerlin(von, "00:00").toISOString()).order("beginnt_am");
  if (person !== "alle") abfrage = abfrage.or(`zustaendig_id.eq.${person},teilnehmer.cs.{${person}}`);
  const [{ data: termine }, { data: benutzer }, { data: objekte }, { data: kontakte }, { data: ich }] = await Promise.all([
    abfrage,
    supabase.from("benutzer").select("id, name, kalender_farbe").eq("mandant_id", sitzung.mandantId).eq("aktiv", true).order("name"),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("kontakte").select("id, vorname, nachname, firma, email").is("geloescht_am", null).order("nachname").limit(500),
    supabase.from("benutzer").select("besichtigung_dauer_min, fahrzeit_aktiv").eq("id", sitzung.benutzerId).maybeSingle(),
  ]);
  const mitarbeiter: Mitarbeiter[] = (benutzer ?? []).map((b) => ({ id: b.id as string, name: b.name as string, farbe: (b.kalender_farbe as string | null) ?? null }));
  const liste = (termine ?? []) as unknown as KalenderTermin[];
  const zeit = p.zeit && /^\d{2}:\d{2}$/.test(p.zeit) ? p.zeit : "10:00";

  return (
    <div className="space-y-5">
      <Seitenkopf titel="Kalender" beschreibung={`${liste.filter((t) => !t.abgesagt_am).length} Termin${liste.filter((t) => !t.abgesagt_am).length === 1 ? "" : "e"} im Zeitraum`}>
        <Link href="/kalender/einstellungen" className="text-[13px] text-akzent hover:underline">Einstellungen, Abo und Abgleich</Link>
      </Seitenkopf>

      {darfAnlegen && (
        <TerminAnlegen
          offen={p.neu === "1"}
          start={{ datum, zeit, zustaendig_id: sitzung.benutzerId, teilnehmer: [sitzung.benutzerId] }}
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
