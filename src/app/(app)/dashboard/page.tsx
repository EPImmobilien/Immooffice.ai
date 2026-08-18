import type { Metadata } from "next";
import Link from "next/link";

import { Kachelgruppe, type KachelDaten } from "@/components/Kachel";
import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, type Modul } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { OBJEKTSTATUS, statusTon } from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";

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

export default async function UebersichtSeite() {
  const sitzung = await sitzungErzwingen();
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
      hinweis: "Aufträge, Reservierungen, Protokolle",
      symbol: "vertraege" as const,
      geplant: true,
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

      <Kachelgruppe titel="Tagesgeschäft" kacheln={tagesgeschaeft} />
      <Kachelgruppe titel="Vermarktung" kacheln={vermarktung} />
      <Kachelgruppe titel="Abwicklung" kacheln={abwicklung} />
      <Kachelgruppe titel="Verwaltung" kacheln={verwaltung} />

      {(letzteAntwort.data ?? []).length > 0 && (
        <Karte className="mt-2">
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
