import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AufgabeAnlegen } from "@/components/AufgabeAnlegen";
import { Aufgabenliste } from "@/components/Aufgabenliste";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Terminliste } from "@/components/Terminliste";
import { Verlauf } from "@/components/Verlauf";
import { buttonKlassen } from "@/components/ui/Button";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import type { Aufgabe, Termin } from "@/lib/arbeitsmittel";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { KONTAKTROLLEN, type Kontaktrolle } from "@/lib/kontakt-begriffe";
import { OBJEKTSTATUS, statusTon } from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";
import type { Verlaufseintrag } from "@/lib/verlauf";

export const metadata: Metadata = { title: "Kontakt" };

function Zeile({
  bezeichnung,
  wert,
}: {
  bezeichnung: string;
  wert: string | null;
}) {
  if (!wert) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-linie py-2 last:border-0">
      <dt className="text-[13px] text-gedaempft">{bezeichnung}</dt>
      <dd className="text-right text-[13px] text-text">{wert}</dd>
    </div>
  );
}

/**
 * Kontaktdetailseite.
 *
 * Der Kontakt ist das zweite Drehkreuz neben dem Objekt: Von hier aus sieht man
 * die verknuepften Objekte samt Rolle, die Suchprofile, den Verlauf und was
 * ansteht. Vorher gab es nur eine Liste und ein Formular — die Verknuepfung
 * `kontakt_objekt` lag in der Datenbank, ohne dass sie irgendwo sichtbar wurde.
 */
export default async function KontaktSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  const { data: kontakt } = await supabase
    .from("kontakte")
    .select("*")
    .eq("id", id)
    .is("geloescht_am", null)
    .maybeSingle();

  // Ein fremder Kontakt kommt durch die RLS-Policy gar nicht zurueck. Das
  // Ergebnis ist dann leer und fuehrt zur 404-Seite — nicht zu einer Meldung,
  // die die Existenz verraet.
  if (!kontakt) notFound();

  const [objekteAntwort, verlaufAntwort, aufgabenAntwort, termineAntwort, profileAntwort] =
    await Promise.all([
      supabase
        .from("kontakt_objekt")
        .select(
          "id, rolle, anteil, seit, objekte(id, objektnummer, bezeichnung, titel, status, ort)",
        )
        .eq("kontakt_id", id),
      supabase
        .from("aktivitaeten")
        .select("id, typ, beschreibung, metadaten, erstellt_am, benutzer:benutzer(name)")
        .eq("kontakt_id", id)
        .order("erstellt_am", { ascending: false })
        .limit(50),
      supabase
        .from("aufgaben")
        .select(
          "id, titel, beschreibung, prioritaet, faellig_am, erledigt_am, objekt_id, kontakt_id, " +
            "objekt:objekte(objektnummer, bezeichnung), " +
            "zustaendig:benutzer!aufgaben_zustaendig_id_fkey(name)",
        )
        .eq("kontakt_id", id)
        .is("erledigt_am", null)
        .order("faellig_am", { ascending: true, nullsFirst: false }),
      supabase
        .from("termine")
        .select(
          "id, titel, art, notiz, beginnt_am, endet_am, ort, abgesagt_am, objekt_id, kontakt_id, " +
            "objekt:objekte(objektnummer, bezeichnung), " +
            "zustaendig:benutzer!termine_zustaendig_id_fkey(name)",
        )
        .eq("kontakt_id", id)
        .order("beginnt_am", { ascending: true }),
      supabase
        .from("suchprofile")
        .select("id, bezeichnung, aktiv")
        .eq("kontakt_id", id),
    ]);

  const heute = new Date().toISOString();
  const darfAendern = hatRecht(sitzung.rolle, "kontakte", "aendern");
  const darfTermine = hatRecht(sitzung.rolle, "kalender", "anlegen");
  const darfTermineAendern = hatRecht(sitzung.rolle, "kalender", "aendern");

  const person = [kontakt.anrede, kontakt.titel, kontakt.vorname, kontakt.nachname]
    .filter(Boolean)
    .join(" ");
  const anzeige = person || kontakt.firma || "Ohne Namen";

  const anschrift = [
    [kontakt.strasse, kontakt.hausnummer].filter(Boolean).join(" "),
    [kontakt.plz, kontakt.ort].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const objekte = objekteAntwort.data ?? [];

  return (
    <>
      <Seitenkopf
        titel={anzeige}
        beschreibung={kontakt.firma && person ? kontakt.firma : (anschrift || "Kontakt")}
      >
        <Link href="/kontakte" className={buttonKlassen({ variante: "sekundaer" })}>
          Zur Übersicht
        </Link>
      </Seitenkopf>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Karte>
            <KarteKopf>
              <KarteTitel>Objekte</KarteTitel>
              <KarteBeschreibung>
                Womit dieser Kontakt zu tun hat — und in welcher Rolle.
              </KarteBeschreibung>
            </KarteKopf>
            <KarteInhalt>
              {objekte.length === 0 ? (
                <p className="text-[13px] text-gedaempft">
                  Noch keinem Objekt zugeordnet. Die Zuordnung erfolgt auf der
                  Objektseite unter „Beteiligte“.
                </p>
              ) : (
                <ul className="divide-y divide-linie">
                  {objekte.map((v) => {
                    const objekt = v.objekte as unknown as {
                      id: string;
                      objektnummer: string;
                      bezeichnung: string;
                      titel: string | null;
                      status: string;
                      ort: string | null;
                    } | null;
                    if (!objekt) return null;

                    return (
                      <li
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/objekte/${objekt.id}`}
                              className="text-[14px] text-text underline decoration-linie-stark underline-offset-2 hover:decoration-akzent"
                            >
                              {objekt.titel || objekt.bezeichnung}
                            </Link>
                            <Marke ton="akzent">
                              {KONTAKTROLLEN[v.rolle as Kontaktrolle]}
                            </Marke>
                            <Marke
                              ton={statusTon(
                                objekt.status as keyof typeof OBJEKTSTATUS,
                              )}
                            >
                              {OBJEKTSTATUS[objekt.status as keyof typeof OBJEKTSTATUS]}
                            </Marke>
                          </div>
                          <p className="mt-0.5 text-[12px] text-gedaempft">
                            {objekt.objektnummer}
                            {objekt.ort && ` · ${objekt.ort}`}
                            {v.anteil !== null &&
                              ` · Anteil ${String(v.anteil).replace(".", ",")} %`}
                            {v.seit && ` · seit ${datum(v.seit)}`}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </KarteInhalt>
          </Karte>

          <Karte>
            <KarteKopf>
              <KarteTitel>Verlauf</KarteTitel>
              <KarteBeschreibung>
                Anrufe, E-Mails, Besichtigungen. Einträge lassen sich nicht
                nachträglich ändern.
              </KarteBeschreibung>
            </KarteKopf>
            <KarteInhalt>
              <Verlauf
                eintraege={
                  (verlaufAntwort.data ?? []) as unknown as Verlaufseintrag[]
                }
                kontaktId={kontakt.id}
                darfSchreiben={darfAendern}
              />
            </KarteInhalt>
          </Karte>
        </div>

        <div className="space-y-5">
          <Karte>
            <KarteKopf>
              <KarteTitel>Kontaktdaten</KarteTitel>
            </KarteKopf>
            <KarteInhalt>
              <dl>
                <Zeile bezeichnung="Firma" wert={kontakt.firma} />
                <Zeile bezeichnung="E-Mail" wert={kontakt.email} />
                <Zeile bezeichnung="Telefon" wert={kontakt.telefon} />
                <Zeile bezeichnung="Mobil" wert={kontakt.mobil} />
                <Zeile bezeichnung="Anschrift" wert={anschrift || null} />
                <Zeile bezeichnung="Quelle" wert={kontakt.quelle} />
                <Zeile bezeichnung="Erfasst" wert={datum(kontakt.erstellt_am)} />
              </dl>

              {/* Die Einwilligung ist keine Nebensache: Ohne sie darf dieser
                  Kontakt keine Werbung erhalten, und das gilt auch fuer
                  Objektvorschlaege aus dem Matching. */}
              <div className="mt-4 border-t border-linie pt-3">
                {kontakt.einwilligung_werbung ? (
                  <Hinweis ton="erfolg" className="text-[13px]">
                    Einwilligung für Werbung liegt vor
                    {kontakt.einwilligung_am &&
                      ` (${datum(kontakt.einwilligung_am)})`}
                    .
                  </Hinweis>
                ) : (
                  <Hinweis ton="warnung" className="text-[13px]">
                    Keine Einwilligung für Werbung. Objektvorschläge nur auf
                    ausdrückliche Anfrage versenden.
                  </Hinweis>
                )}
              </div>

              {kontakt.notizen && (
                <p className="mt-3 whitespace-pre-line text-[13px] text-gedaempft">
                  {kontakt.notizen}
                </p>
              )}
            </KarteInhalt>
          </Karte>

          {(profileAntwort.data ?? []).length > 0 && (
            <Karte>
              <KarteKopf>
                <KarteTitel>Suchprofile</KarteTitel>
              </KarteKopf>
              <KarteInhalt>
                <ul className="space-y-1.5">
                  {(profileAntwort.data ?? []).map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <Link
                        href="/suchprofile"
                        className="text-[13px] text-text underline decoration-linie-stark underline-offset-2 hover:decoration-akzent"
                      >
                        {p.bezeichnung}
                      </Link>
                      {!p.aktiv && <Marke>Ruht</Marke>}
                    </li>
                  ))}
                </ul>
              </KarteInhalt>
            </Karte>
          )}

          <Karte>
            <KarteKopf>
              <KarteTitel>Aufgaben</KarteTitel>
            </KarteKopf>
            <KarteInhalt className="space-y-3">
              <Aufgabenliste
                aufgaben={(aufgabenAntwort.data ?? []) as unknown as Aufgabe[]}
                heute={heute}
                darfAendern={darfTermineAendern}
                darfLoeschen={hatRecht(sitzung.rolle, "kalender", "loeschen")}
              />
              {darfTermine && <AufgabeAnlegen kontaktId={kontakt.id} />}
            </KarteInhalt>
          </Karte>

          <Karte>
            <KarteKopf>
              <KarteTitel>Termine</KarteTitel>
            </KarteKopf>
            <KarteInhalt className="space-y-3">
              <Terminliste
                termine={(termineAntwort.data ?? []) as unknown as Termin[]}
                darfAendern={darfTermineAendern}
              />
              {darfTermine && (
                <AufgabeAnlegen kontaktId={kontakt.id} art="termin" />
              )}
            </KarteInhalt>
          </Karte>
        </div>
      </div>
    </>
  );
}
