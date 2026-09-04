import type { Metadata } from "next";
import Link from "next/link";

import { Kachelgruppe, type KachelDaten } from "@/components/Kachel";
import { Tutorial, type TutorialSchritt } from "@/components/Tutorial";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Stempeluhr } from "@/components/verwaltung/Stempeluhr";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, type Modul } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum, uhrzeit } from "@/lib/format";
import { tutorialGesehen } from "@/server/arbeitsmittel-aktionen";
import { OBJEKTSTATUS, statusTon } from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";
import { soll, stundenAusStempeln, type Stempel, type Wochenmodell } from "@/lib/verwaltung/arbeitszeit";
import { heuteBerlin, tagPlus } from "@/lib/kalender/zeit";

export const metadata: Metadata = { title: "Übersicht" };

/**
 * Verbleibende Tage der Testphase.
 * Ausserhalb der Komponente, weil Date.now() im Render-Pfad als unrein gilt.
 */
function verbleibendeTage(bis: string): number {
  if (!bis) return 0;
  const ziel = new Date(bis).getTime();
  if (Number.isNaN(ziel)) return 0;
  return Math.max(0, Math.ceil((ziel - Date.now()) / 86_400_000));
}

const TUTORIAL: TutorialSchritt[] = [
  { id: "intro", ziel: null, titel: "Willkommen in ImmoOffice.ai", text: "In zwei Minuten gehen wir über die Startseite: Was heute ansteht, die Arbeitsbereiche als Kacheln und wo Sie was finden. Jederzeit überspringen — der Rundgang lässt sich unten auf der Startseite neu starten." },
  { id: "heute", ziel: "heute", titel: "Heute-Zone", text: "Links die Termine des Tages, in der Mitte fällige und überfällige Aufgaben, rechts alles, was auf Sie wartet: Unterschriften, Mietanfragen, Leads zum Nachfassen, Treffer und Objektaufnahmen. Ein Klick führt direkt hin." },
  { id: "tagesgeschaeft", ziel: "tagesgeschaeft", titel: "Tagesgeschäft", text: "Objektaufnahmen vor Ort, der Objektbestand, Kontakte mit Suchprofilen, die Akquise-Pipeline, Aufgaben und Termine. Die Zahl auf jeder Kachel zeigt, wo etwas liegt — betont, wenn es dringend ist." },
  { id: "vermarktung", ziel: "vermarktung", titel: "Vermarktung", text: "Exposés mit KI-Texten und PDF, der Portalexport nach OpenImmo, Marketing-Vorlagen und die offene Wertermittlung als Akquise-Werkzeug." },
  { id: "abwicklung", ziel: "abwicklung", titel: "Abwicklung", text: "Verträge aus Vorlagen mit Signaturlink, Übergaben und Notar-Laufzettel, Vermietung mit Anfragen und Mietverträgen, Checklisten als Arbeitsketten, Auswertungen." },
  { id: "verwaltung", ziel: "verwaltung", titel: "Verwaltung", text: "Unternehmen, Erscheinungsbild, Rechtstexte, Team und Rechte, Postfächer, Integrationen und die eigene Schnittstelle — sowie Abo und Credits. Credits kosten nur KI-Erstellungen; Exporte sind kostenlos." },
  { id: "notizen", ziel: "notizen", titel: "Notizen und Schnelleingabe", text: "Unter Aufgaben legen Sie mit einem Satz Aufgaben oder Notizen an: „Energieausweis anfordern morgen !! #unterlagen“. Ihre Notizen erscheinen hier auf der Startseite." },
  { id: "ende", ziel: null, titel: "Los geht's", text: "Fragen beantwortet die Anleitung im Menü unter Einstellungen. Viel Erfolg!" },
];

export default async function UebersichtSeite({ searchParams }: { searchParams: Promise<{ tutorial?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  const supabase = await serverClient();

  const [objekteAntwort, kontakteAntwort, letzteAntwort, guthaben, trefferAntwort] =
    await Promise.all([
      supabase
        .from("objekte")
        .select("status")
        .is("geloescht_am", null),
      supabase
        .from("kontakte")
        .select("id", { count: "exact", head: true })
        .is("geloescht_am", null),
      supabase
        .from("objekte")
        .select("id, objektnummer, bezeichnung, titel, status, geaendert_am")
        .is("geloescht_am", null)
        .order("geaendert_am", { ascending: false })
        .limit(5),
      supabase.rpc("credits_verfuegbar"),
      supabase
        .from("treffer")
        .select("id", { count: "exact", head: true })
        .eq("status", "neu"),
    ]);

  // Aufgaben und Termine getrennt geladen, weil beide einen Bezugstag brauchen.
  // Der Tagesbeginn statt „jetzt": Ein Termin, der heute um 9 Uhr war, gehoert
  // um 11 Uhr noch zum heutigen Tag und nicht in die Vergangenheit.
  const jetzt = new Date();
  const tagesbeginn = new Date(
    Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()),
  );
  const heuteDatum = tagesbeginn.toISOString().slice(0, 10);

  const [faelligAntwort, termineAntwort, aufnahmenAntwort] = await Promise.all([
    supabase
      .from("aufgaben")
      .select("id", { count: "exact", head: true })
      .is("erledigt_am", null)
      .lte("faellig_am", heuteDatum),
    supabase
      .from("termine")
      .select("id", { count: "exact", head: true })
      .is("abgesagt_am", null)
      .gte("beginnt_am", tagesbeginn.toISOString()),
    supabase
      .from("objektaufnahmen")
      .select("id", { count: "exact", head: true })
      .eq("status", "offen"),
  ]);

  // Heute-Zone (Referenz): Termine des Tages, faellige Aufgaben, was wartet
  const tagesende = new Date(tagesbeginn.getTime() + 86_400_000);
  const [heuteTermine, heuteAufgaben, notizen, signaturen, anfragen, nachfassen, konto] = await Promise.all([
    supabase.from("termine").select("id, titel, art, beginnt_am, ort").is("abgesagt_am", null).gte("beginnt_am", tagesbeginn.toISOString()).lt("beginnt_am", tagesende.toISOString()).order("beginnt_am").limit(8),
    supabase.from("aufgaben").select("id, titel, faellig_am, prioritaet").eq("typ", "aufgabe").not("status", "in", "(erledigt,verworfen)").lte("faellig_am", heuteDatum).or(`zustaendig_id.eq.${sitzung.benutzerId},erstellt_von.eq.${sitzung.benutzerId}`).order("faellig_am").limit(8),
    supabase.from("aufgaben").select("id, titel, tags, erstellt_am").eq("typ", "notiz").not("status", "in", "(erledigt,verworfen)").or(`zustaendig_id.eq.${sitzung.benutzerId},erstellt_von.eq.${sitzung.benutzerId}`).order("erstellt_am", { ascending: false }).limit(6),
    supabase.from("vertraege").select("id", { count: "exact", head: true }).eq("status", "versendet"),
    supabase.from("mietanfragen").select("id", { count: "exact", head: true }).eq("status", "neu"),
    supabase.from("akquise_leads").select("id", { count: "exact", head: true }).eq("status", "offen").eq("nachfassen", true).lte("nachfassen_am", heuteDatum),
    supabase.from("benutzer").select("tutorial_gesehen_am").eq("id", sitzung.benutzerId).maybeSingle(),
  ]);
  const tutorialStarten = p.tutorial === "1" || (konto.data ? konto.data.tutorial_gesehen_am === null : false);

  const faellig = faelligAntwort.count ?? 0;
  const offeneAufnahmen = aufnahmenAntwort.count ?? 0;
  const naechsteTermine = termineAntwort.count ?? 0;

  const objekte = objekteAntwort.data ?? [];
  const aktiv = objekte.filter((o) =>
    ["aktiv", "reserviert"].includes(o.status),
  ).length;
  const inArbeit = objekte.filter((o) =>
    ["akquise", "vorbereitung"].includes(o.status),
  ).length;
  const ohneTexte = 0; // wird mit der Exposé-Auswertung gefüllt
  const kontakteAnzahl = kontakteAntwort.count ?? 0;
  const offeneTreffer = trefferAntwort.count ?? 0;
  const credits = typeof guthaben.data === "number" ? guthaben.data : 0;

  const darf = (modul: Modul) =>
    hatRecht(sitzung.rolle, modul, "lesen", sitzung.uebersteuerung);

  const tagesgeschaeft: KachelDaten[] = [
    darf("objekte") && {
      titel: "Objektaufnahmen",
      hinweis: "Der Vor-Ort-Termin, bevor ein Objekt entsteht",
      symbol: "objekte" as const,
      pfad: "/aufnahmen",
      zahl: offeneAufnahmen,
      zahlHinweis: "offen",
      betont: offeneAufnahmen > 0,
    },
    darf("objekte") && {
      titel: "Objekte",
      hinweis: "Bestand, Neubau und Vermarktung",
      symbol: "objekte" as const,
      pfad: "/objekte",
      zahl: aktiv,
      zahlHinweis: inArbeit > 0 ? `${inArbeit} in Vorbereitung` : "aktiv",
      betont: true,
    },
    darf("kontakte") && {
      titel: "Kontakte",
      hinweis: "Eigentümer, Interessenten, Dienstleister",
      symbol: "kontakte" as const,
      pfad: "/kontakte",
      zahl: kontakteAnzahl,
      zahlHinweis: "erfasst",
    },
    darf("kontakte") && {
      titel: "Suchprofile",
      hinweis: "Gesuche der Interessenten gegen den Bestand",
      symbol: "suchprofile" as const,
      pfad: "/suchprofile",
      zahl: offeneTreffer,
      zahlHinweis: offeneTreffer === 1 ? "offener Treffer" : "offene Treffer",
    },
    darf("akquise") && {
      titel: "Akquise",
      hinweis: "Eigentümer-Leads, Pipeline, Nachfassen, Kampagnen",
      symbol: "kontakte" as const,
      pfad: "/akquise",
      zahl: nachfassen.count ?? 0,
      zahlHinweis: "nachzufassen",
      betont: (nachfassen.count ?? 0) > 0,
    },
    darf("kalender") && {
      titel: "Aufgaben",
      hinweis: "Was ansteht, mit Bezug zu Objekt und Kontakt",
      symbol: "aufgaben" as const,
      pfad: "/aufgaben",
      zahl: faellig,
      // „Fällig" statt „offen": Die Zahl soll den Blick auf das lenken, was
      // heute liegen bleibt, nicht auf die Gesamtmenge.
      zahlHinweis: "heute fällig",
      betont: faellig > 0,
    },
    darf("kalender") && {
      titel: "Termine",
      hinweis: "Besichtigungen, Übergaben, Notartermine",
      symbol: "kalender" as const,
      pfad: "/kalender",
      zahl: naechsteTermine,
      zahlHinweis: "anstehend",
    },
  ].filter(Boolean) as KachelDaten[];

  const vermarktung: KachelDaten[] = [
    darf("exposes") && {
      titel: "Exposés",
      hinweis: "KI-Texte, fünf Vorlagen, PDF und Web",
      symbol: "expose" as const,
      pfad: "/exposes",
      zahl: objekte.length,
      zahlHinweis: "Objekte",
      betont: true,
    },
    darf("objekte") && {
      titel: "Portalexport",
      hinweis: "OpenImmo für ImmoScout24, Immowelt, Kleinanzeigen",
      symbol: "portale" as const,
      pfad: "/portale",
      zahl: ohneTexte > 0 ? ohneTexte : "—",
      zahlHinweis: "bereit",
    },
    darf("marketing") && {
      titel: "Marketing",
      hinweis: "Social Media, Flyer, Schilder, Anschreiben",
      symbol: "marketing" as const,
      pfad: "/marketing",
    },
    darf("wertermittlung") && {
      titel: "Wertermittlung",
      hinweis: "Offene Rechenblätter nach ImmoWertV, als Akquiseinstrument",
      symbol: "wertermittlung" as const,
      pfad: "/wertermittlung",
    },
  ].filter(Boolean) as KachelDaten[];

  const abwicklung: KachelDaten[] = [
    darf("vertraege") && {
      titel: "Verträge",
      hinweis: "Aufträge, Reservierungen, Protokolle mit Signatur",
      symbol: "vertraege" as const,
      pfad: "/vertraege",
    },
    darf("vertraege") && {
      titel: "Vermietung",
      hinweis: "Mietanfragen, Mietverträge, Reservierungen",
      symbol: "vertraege" as const,
      pfad: "/vermietung",
      zahl: anfragen.count ?? 0,
      zahlHinweis: "neue Anfragen",
      betont: (anfragen.count ?? 0) > 0,
    },
    darf("kalender") && {
      titel: "Checklisten",
      hinweis: "Arbeitsketten aus Vorlagen — Unterlagen, Akquise, Aufnahme",
      symbol: "aufgaben" as const,
      pfad: "/checklisten",
    },
    darf("auswertungen") && {
      titel: "Auswertungen",
      hinweis: "Bestand, Vermarktungsdauer, Abschlüsse",
      symbol: "auswertungen" as const,
      pfad: "/auswertungen",
    },
  ].filter(Boolean) as KachelDaten[];

  const verwaltung: KachelDaten[] = [
    darf("einstellungen") && {
      titel: "Einstellungen",
      hinweis: "Unternehmen, Erscheinungsbild, Rechtstexte, Zugänge",
      symbol: "einstellungen" as const,
      pfad: "/einstellungen",
    },
    darf("abrechnung") && {
      titel: "Abo und Credits",
      hinweis: "Tarif, Zusatznutzer, Guthaben",
      symbol: "abrechnung" as const,
      pfad: "/credits",
      zahl: credits,
      zahlHinweis: "Credits",
    },
  ].filter(Boolean) as KachelDaten[];

  const testTage = verbleibendeTage(sitzung.testphaseBis);

  // Stempeluhr: heutige Stempel, Soll laut Wochenmodell, vergessene Feierabende der letzten 7 Tage
  const heuteIso = heuteBerlin();
  const [stempelAntwort, modelleAntwort] = await Promise.all([
    supabase.from("arbeitszeit_stempel").select("id, benutzer_id, datum, richtung, zeitpunkt, quelle").eq("benutzer_id", sitzung.benutzerId).gte("datum", tagPlus(heuteIso, -7)).order("zeitpunkt"),
    supabase.from("arbeitszeit_modelle").select("*").eq("benutzer_id", sitzung.benutzerId),
  ]);
  const alleStempel = (stempelAntwort.data ?? []) as Stempel[];
  const modelle = (modelleAntwort.data ?? []) as Wochenmodell[];
  const stempelHeute = alleStempel.filter((x) => x.datum === heuteIso);
  const sollHeute = soll(modelle, heuteIso);
  const vergessen = Array.from(new Set(alleStempel.filter((x) => x.datum < heuteIso).map((x) => x.datum)))
    .map((d) => ({ datum: d, offen: stundenAusStempeln(alleStempel.filter((x) => x.datum === d)).offen }))
    .filter((x): x is { datum: string; offen: string } => Boolean(x.offen))
    .map((x) => { const s = soll(modelle, x.datum) || 8; const v = new Date(new Date(x.offen).getTime() + s * 3600000); return { ...x, vorschlag: v.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) }; });

  return (
    <>
      <Seitenkopf
        titel={`Willkommen, ${sitzung.name.split(" ")[0]}`}
        beschreibung={sitzung.mandantName}
      >
        {hatRecht(sitzung.rolle, "objekte", "anlegen", sitzung.uebersteuerung) && (
          <Link href="/objekte/neu" className={buttonKlassen()}>
            Objekt anlegen
          </Link>
        )}
      </Seitenkopf>

      {sitzung.aboStatus === "test" && (
        <Hinweis ton="info" titel="Testphase läuft" className="mb-7">
          Noch {testTage} {testTage === 1 ? "Tag" : "Tage"} bis zum{" "}
          {datum(sitzung.testphaseBis)}. Es entstehen keine Kosten, solange kein
          Tarif ausgewählt wurde.
        </Hinweis>
      )}

      <section className="mb-5">
        <Karte>
          <KarteKopf><KarteTitel>Stempeluhr</KarteTitel></KarteKopf>
          <KarteInhalt><Stempeluhr heute={stempelHeute} sollHeute={sollHeute} vergessen={vergessen} /></KarteInhalt>
        </Karte>
      </section>

      <section data-tutorial="heute" className="mb-7 grid gap-4 lg:grid-cols-3">
        <Karte>
          <KarteKopf><KarteTitel>Heute</KarteTitel></KarteKopf>
          <KarteInhalt>
            {(heuteTermine.data ?? []).length === 0 ? <p className="text-[13px] text-gedaempft">Keine Termine heute.</p> : (
              <ul className="divide-y divide-linie text-[13px]">{(heuteTermine.data ?? []).map((t) => <li key={t.id} className="flex gap-2 py-1.5"><span className="w-12 shrink-0 text-gedaempft">{uhrzeit(t.beginnt_am)}</span><Link href="/kalender" className="min-w-0 truncate text-text hover:underline">{t.titel}</Link></li>)}</ul>
            )}
          </KarteInhalt>
        </Karte>
        <Karte>
          <KarteKopf><KarteTitel>Fällige Aufgaben</KarteTitel></KarteKopf>
          <KarteInhalt>
            {(heuteAufgaben.data ?? []).length === 0 ? <p className="text-[13px] text-gedaempft">Nichts fällig.</p> : (
              <ul className="divide-y divide-linie text-[13px]">{(heuteAufgaben.data ?? []).map((a) => <li key={a.id} className="flex items-center gap-2 py-1.5"><Link href={`/aufgaben/${a.id}`} className="min-w-0 flex-1 truncate text-text hover:underline">{a.titel}</Link><Marke ton={a.faellig_am && a.faellig_am < heuteDatum ? "fehler" : "warnung"}>{a.faellig_am && a.faellig_am < heuteDatum ? "überfällig" : "heute"}</Marke></li>)}</ul>
            )}
            <Link href="/aufgaben" className="mt-2 block text-[12px] text-akzent hover:underline">Alle Aufgaben</Link>
          </KarteInhalt>
        </Karte>
        <Karte>
          <KarteKopf><KarteTitel>Wartet auf Sie</KarteTitel></KarteKopf>
          <KarteInhalt>
            <ul className="space-y-1.5 text-[13px]">
              <li className="flex justify-between"><Link href="/vertraege" className="text-text hover:underline">Offene Unterschriften</Link><Marke ton={(signaturen.count ?? 0) > 0 ? "warnung" : "neutral"}>{signaturen.count ?? 0}</Marke></li>
              <li className="flex justify-between"><Link href="/vermietung/anfragen?status=neu" className="text-text hover:underline">Neue Mietanfragen</Link><Marke ton={(anfragen.count ?? 0) > 0 ? "warnung" : "neutral"}>{anfragen.count ?? 0}</Marke></li>
              <li className="flex justify-between"><Link href="/akquise/leads?nachfassen=1" className="text-text hover:underline">Leads nachfassen</Link><Marke ton={(nachfassen.count ?? 0) > 0 ? "warnung" : "neutral"}>{nachfassen.count ?? 0}</Marke></li>
              <li className="flex justify-between"><Link href="/suchprofile" className="text-text hover:underline">Offene Treffer</Link><Marke ton={offeneTreffer > 0 ? "warnung" : "neutral"}>{offeneTreffer}</Marke></li>
              <li className="flex justify-between"><Link href="/aufnahmen" className="text-text hover:underline">Offene Objektaufnahmen</Link><Marke ton={offeneAufnahmen > 0 ? "warnung" : "neutral"}>{offeneAufnahmen}</Marke></li>
            </ul>
          </KarteInhalt>
        </Karte>
      </section>

      <div data-tutorial="tagesgeschaeft"><Kachelgruppe titel="Tagesgeschäft" kacheln={tagesgeschaeft} /></div>
      <div data-tutorial="vermarktung"><Kachelgruppe titel="Vermarktung" kacheln={vermarktung} /></div>
      <div data-tutorial="abwicklung"><Kachelgruppe titel="Abwicklung" kacheln={abwicklung} /></div>
      <div data-tutorial="verwaltung"><Kachelgruppe titel="Verwaltung" kacheln={verwaltung} /></div>

      {(notizen.data ?? []).length > 0 && (
        <Karte className="mt-2" data-tutorial="notizen">
          <KarteKopf><KarteTitel>Notizen</KarteTitel></KarteKopf>
          <KarteInhalt>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(notizen.data ?? []).map((n) => (
                <li key={n.id}><Link href={`/aufgaben/${n.id}`} className="block rounded-[var(--radius)] border border-linie bg-flaeche-gedaempft px-3 py-2 text-[13px] text-text hover:border-akzent/50"><span className="block truncate">{n.titel}</span><span className="text-[11px] text-gedaempft">{((n.tags as string[] | null) ?? []).map((t) => `#${t}`).join(" ")} {datum(n.erstellt_am)}</span></Link></li>
              ))}
            </ul>
            <Link href="/aufgaben?ansicht=notizen" className="mt-2 block text-[12px] text-akzent hover:underline">Alle Notizen</Link>
          </KarteInhalt>
        </Karte>
      )}

      <Tutorial starten={tutorialStarten} schritte={TUTORIAL} />
      <form action={tutorialGesehen} className="mt-6 text-[12px] text-gedaempft">
        <input type="hidden" name="zuruecksetzen" value="1" />
        <button type="submit" className="text-akzent hover:underline">Rundgang durch die Startseite erneut starten</button>
      </form>

      {(letzteAntwort.data ?? []).length > 0 && (
        <Karte className="mt-2" data-tutorial="zuletzt">
          <KarteKopf>
            <KarteTitel>Zuletzt bearbeitet</KarteTitel>
          </KarteKopf>
          <KarteInhalt>
            <ul className="divide-y divide-linie">
              {(letzteAntwort.data ?? []).map((objekt) => (
                <li key={objekt.id}>
                  <Link
                    href={`/objekte/${objekt.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-akzent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {objekt.titel || objekt.bezeichnung}
                      </span>
                      <span className="zahl block text-[12px] text-gedaempft">
                        {objekt.objektnummer} · {datum(objekt.geaendert_am)}
                      </span>
                    </span>
                    <Marke
                      ton={statusTon(objekt.status as keyof typeof OBJEKTSTATUS)}
                    >
                      {OBJEKTSTATUS[objekt.status as keyof typeof OBJEKTSTATUS]}
                    </Marke>
                  </Link>
                </li>
              ))}
            </ul>
          </KarteInhalt>
        </Karte>
      )}
    </>
  );
}
