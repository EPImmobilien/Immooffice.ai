import type { Metadata } from "next";
import Link from "next/link";

import { Startkacheln, type StartkachelAnzeige } from "@/components/Startkacheln";
import { Tutorial, type TutorialSchritt } from "@/components/Tutorial";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Stempeluhr } from "@/components/verwaltung/Stempeluhr";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, ROLLEN_BEZEICHNUNG } from "@/lib/auth/rechte";
import { kachelEinstellungLesen, STARTKACHELN } from "@/lib/kacheln";
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
  { id: "intro", ziel: null, titel: "Willkommen in ImmoOffice.ai", text: "In zwei Minuten gehen wir über die Startseite: Was heute ansteht und die Arbeitsbereiche als Kacheln. Jederzeit überspringen — der Rundgang lässt sich unten auf der Startseite neu starten." },
  { id: "heute", ziel: "heute", titel: "Heute-Zone", text: "Links die Termine des Tages, in der Mitte fällige und überfällige ToDos, rechts alles, was auf Sie wartet: Unterschriften, Mietanfragen, Leads zum Nachfassen, Treffer und Objektaufnahmen. Ein Klick führt direkt hin." },
  { id: "kacheln", ziel: "kacheln", titel: "Arbeitsbereiche als Kacheln", text: "Jede Kachel öffnet einen Bereich mit seinen Unterkacheln: Immobilien, Adressbuch, Marketing, Verkauf, Vermietung, Exposé-Schmiede, KI-Agenten, Dokumente, Termine, Kundenbereich, ToDos, Arbeitszeit, Werkzeuge, Akquise, Admin, Finanzen, Rechnungen, Posteingang. Die Zahl auf der Kachel zeigt, wo etwas liegt. Mit „Anpassen“ ordnen Sie die Kacheln per Ziehen um oder blenden welche aus — je Benutzer gespeichert." },
  { id: "notizen", ziel: "notizen", titel: "Notizen und Schnelleingabe", text: "Unter ToDos legen Sie mit einem Satz Aufgaben oder Notizen an: „Energieausweis anfordern morgen !! #unterlagen“. Ihre Notizen erscheinen hier auf der Startseite." },
  { id: "ende", ziel: null, titel: "Los geht's", text: "Fragen beantwortet die Anleitung im Menü unter Admin. Viel Erfolg!" },
];

/** Begruessung nach Tageszeit in Deutschland (Referenz: Guten Morgen / Tag / Abend). */
function begruessung(): string {
  const stunde = Number(new Intl.DateTimeFormat("de-DE", { hour: "numeric", hour12: false, timeZone: "Europe/Berlin" }).format(new Date()));
  return stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
}

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

  const [faelligAntwort, aufnahmenAntwort] = await Promise.all([
    supabase
      .from("aufgaben")
      .select("id", { count: "exact", head: true })
      .is("erledigt_am", null)
      .lte("faellig_am", heuteDatum),
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
    supabase.from("benutzer").select("tutorial_gesehen_am, kacheln").eq("id", sitzung.benutzerId).maybeSingle(),
  ]);
  const vor14Tagen = new Date(tagesbeginn.getTime() - 14 * 86_400_000).toISOString();
  const [ungelesen, ueberfaellig, anfragen14, projekte] = await Promise.all([
    supabase.from("nachrichten").select("id", { count: "exact", head: true }).eq("gelesen", false).eq("ordner", "eingang"),
    supabase.from("aufgaben").select("id", { count: "exact", head: true }).eq("typ", "aufgabe").not("status", "in", "(erledigt,verworfen)").lt("faellig_am", heuteDatum),
    supabase.from("mietanfragen").select("id", { count: "exact", head: true }).gte("erstellt_am", vor14Tagen),
    supabase.from("projekte").select("id", { count: "exact", head: true }),
  ]);
  const tutorialStarten = p.tutorial === "1" || (konto.data ? konto.data.tutorial_gesehen_am === null : false);

  const faellig = faelligAntwort.count ?? 0;
  const offeneAufnahmen = aufnahmenAntwort.count ?? 0;

  const objekte = objekteAntwort.data ?? [];
  const aktiv = objekte.filter((o) =>
    ["aktiv", "reserviert"].includes(o.status),
  ).length;
    const kontakteAnzahl = kontakteAntwort.count ?? 0;
  const offeneTreffer = trefferAntwort.count ?? 0;
  const credits = typeof guthaben.data === "number" ? guthaben.data : 0;

  const verwaltung = sitzung.rolle === "inhaber" || sitzung.rolle === "administrator";
  const kennzahlen: Record<string, { zahl: number; zahlHinweis: string; betont?: boolean }> = {
    immobilien: { zahl: aktiv, zahlHinweis: `in Vermarktung bzw. reserviert${(projekte.count ?? 0) > 0 ? ` · ${projekte.count} Projekte` : ""}` },
    kontakte: { zahl: kontakteAnzahl, zahlHinweis: "Kontakte" },
    verkauf: { zahl: signaturen.count ?? 0, zahlHinweis: (signaturen.count ?? 0) === 1 ? "Unterschrift ausstehend" : "Unterschriften ausstehend", betont: (signaturen.count ?? 0) > 0 },
    vermietung: { zahl: anfragen14.count ?? 0, zahlHinweis: `neue Mietanfrage${(anfragen14.count ?? 0) === 1 ? "" : "n"} (14 Tage)`, betont: (anfragen.count ?? 0) > 0 },
    kalender: { zahl: (heuteTermine.data ?? []).length, zahlHinweis: (heuteTermine.data ?? []).length === 1 ? "Termin heute" : "Termine heute", betont: (heuteTermine.data ?? []).length > 0 },
    todos: { zahl: faellig, zahlHinweis: (ueberfaellig.count ?? 0) > 0 ? `fällig, ${ueberfaellig.count} überfällig` : "heute fällig", betont: faellig > 0 },
    akquise: { zahl: nachfassen.count ?? 0, zahlHinweis: "nachzufassen", betont: (nachfassen.count ?? 0) > 0 },
    posteingang: { zahl: ungelesen.count ?? 0, zahlHinweis: (ungelesen.count ?? 0) === 1 ? "ungelesene Mail" : "ungelesene Mails", betont: (ungelesen.count ?? 0) > 0 },
    finanzen: { zahl: credits, zahlHinweis: "Credits" },
    immobilien_aufnahmen: { zahl: offeneAufnahmen, zahlHinweis: "offene Aufnahmen" },
  };
  const startkacheln: StartkachelAnzeige[] = STARTKACHELN
    .filter((k) => (k.modul === null || hatRecht(sitzung.rolle, k.modul, "lesen", sitzung.uebersteuerung)) && (!k.nurVerwaltung || verwaltung))
    .map((k) => ({ id: k.id, titel: k.titel, untertitel: k.untertitel, pfad: k.pfad, symbol: k.symbol, ...(kennzahlen[k.id] ?? {}) }));
  const kachelEinstellung = kachelEinstellungLesen(konto.data?.kacheln);

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
        titel={`${begruessung()}, ${sitzung.name.split(" ")[0]}`}
        beschreibung={`Angemeldet als ${sitzung.name} · ${ROLLEN_BEZEICHNUNG[sitzung.rolle]} · ${sitzung.mandantName}`}
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
          <KarteKopf><KarteTitel>Fällige ToDos</KarteTitel></KarteKopf>
          <KarteInhalt>
            {(heuteAufgaben.data ?? []).length === 0 ? <p className="text-[13px] text-gedaempft">Nichts fällig.</p> : (
              <ul className="divide-y divide-linie text-[13px]">{(heuteAufgaben.data ?? []).map((a) => <li key={a.id} className="flex items-center gap-2 py-1.5"><Link href={`/aufgaben/${a.id}`} className="min-w-0 flex-1 truncate text-text hover:underline">{a.titel}</Link><Marke ton={a.faellig_am && a.faellig_am < heuteDatum ? "fehler" : "warnung"}>{a.faellig_am && a.faellig_am < heuteDatum ? "überfällig" : "heute"}</Marke></li>)}</ul>
            )}
            <Link href="/aufgaben" className="mt-2 block text-[12px] text-akzent hover:underline">Alle ToDos</Link>
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

      <Startkacheln kacheln={startkacheln} einstellung={kachelEinstellung} />

      <section className="mb-5 mt-2">
        <Karte>
          <KarteKopf><KarteTitel>Stempeluhr</KarteTitel></KarteKopf>
          <KarteInhalt><Stempeluhr heute={stempelHeute} sollHeute={sollHeute} vergessen={vergessen} /></KarteInhalt>
        </Karte>
      </section>

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
