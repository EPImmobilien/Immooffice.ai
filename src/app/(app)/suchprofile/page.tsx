import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Button, buttonKlassen } from "@/components/ui/Button";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { euro, flaeche, zahl } from "@/lib/format";
import { OBJEKTKATEGORIEN, VERMARKTUNGSARTEN, istMiete } from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";
import {
  trefferAktualisieren,
  trefferStatusSetzen,
} from "@/server/suchprofil-aktionen";

export const metadata: Metadata = { title: "Suchprofile" };

/** Farbton nach Trefferqualität — ab 80 Punkten passt praktisch alles. */
function punktTon(p: number): "erfolg" | "info" | "neutral" {
  if (p >= 80) return "erfolg";
  if (p >= 50) return "info";
  return "neutral";
}

const STATUS_BEZEICHNUNG: Record<string, string> = {
  neu: "Neu",
  gesendet: "Gesendet",
  vorgemerkt: "Vorgemerkt",
  abgelehnt: "Abgelehnt",
};

export default async function SuchprofileSeite() {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  const { data: profile } = await supabase
    .from("suchprofile")
    .select(
      "id, bezeichnung, aktiv, vermarktungsart, objektkategorien, preis_von, preis_bis, flaeche_von, flaeche_bis, zimmer_von, zimmer_bis, orte, bemerkung, kontakte(vorname, nachname, firma)",
    )
    .order("erstellt_am", { ascending: false });

  const { data: treffer } = await supabase
    .from("treffer")
    .select(
      "id, suchprofil_id, punktzahl, status, objekte(id, objektnummer, bezeichnung, titel, ort, wohnflaeche, zimmer, kaufpreis, kaltmiete, vermarktungsart)",
    )
    .order("punktzahl", { ascending: false });

  const liste = profile ?? [];
  const darfAendern = hatRecht(sitzung.rolle, "kontakte", "aendern");

  const trefferJeProfil = new Map<string, typeof treffer>();
  for (const t of treffer ?? []) {
    const vorhanden = trefferJeProfil.get(t.suchprofil_id) ?? [];
    vorhanden.push(t);
    trefferJeProfil.set(t.suchprofil_id, vorhanden);
  }

  return (
    <>
      <Seitenkopf
        titel="Suchprofile"
        beschreibung={
          liste.length === 1 ? "1 Suchprofil" : `${liste.length} Suchprofile`
        }
      >
        {hatRecht(sitzung.rolle, "kontakte", "anlegen") && (
          <Link href="/suchprofile/neu" className={buttonKlassen()}>
            Suchprofil anlegen
          </Link>
        )}
      </Seitenkopf>

      {liste.length === 0 ? (
        <Karte>
          <KarteInhalt className="py-14 text-center">
            <p className="text-sm font-medium text-text">Noch keine Suchprofile</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-gedaempft">
              Ein Suchprofil hält fest, was ein Interessent sucht. Neue Objekte
              werden automatisch dagegen geprüft — Sie sehen sofort, wen ein
              Zugang interessieren dürfte.
            </p>
            <Link
              href="/suchprofile/neu"
              className={buttonKlassen({ className: "mt-5" })}
            >
              Erstes Suchprofil anlegen
            </Link>
          </KarteInhalt>
        </Karte>
      ) : (
        <div className="space-y-5">
          {liste.map((profil) => {
            const kontakt = profil.kontakte as unknown as {
              vorname: string | null;
              nachname: string | null;
              firma: string | null;
            } | null;
            const name =
              [kontakt?.vorname, kontakt?.nachname].filter(Boolean).join(" ") ||
              kontakt?.firma ||
              "Unbekannt";

            const eigene = trefferJeProfil.get(profil.id) ?? [];
            const offen = eigene.filter((t) => t.status === "neu");

            const kriterien = [
              VERMARKTUNGSARTEN[
                profil.vermarktungsart as keyof typeof VERMARKTUNGSARTEN
              ],
              profil.objektkategorien.length > 0
                ? profil.objektkategorien
                    .map(
                      (k: string) =>
                        OBJEKTKATEGORIEN[k as keyof typeof OBJEKTKATEGORIEN],
                    )
                    .join(", ")
                : "alle Kategorien",
              profil.orte.length > 0 ? profil.orte.join(", ") : "alle Orte",
              profil.preis_bis ? `bis ${euro(profil.preis_bis)}` : null,
              profil.flaeche_von ? `ab ${flaeche(profil.flaeche_von)}` : null,
              profil.zimmer_von ? `ab ${zahl(profil.zimmer_von)} Zi.` : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <Karte key={profil.id}>
                <KarteKopf className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <KarteTitel>
                      {profil.bezeichnung || `Suchprofil ${name}`}
                    </KarteTitel>
                    <KarteBeschreibung>
                      {name} · {kriterien}
                    </KarteBeschreibung>
                  </div>
                  <div className="flex items-center gap-2">
                    {offen.length > 0 ? (
                      <Marke ton="erfolg">
                        {offen.length} neue{offen.length === 1 ? "r" : ""} Treffer
                      </Marke>
                    ) : (
                      <Marke>keine offenen Treffer</Marke>
                    )}
                    {darfAendern && (
                      <form action={trefferAktualisieren}>
                        <input type="hidden" name="profil_id" value={profil.id} />
                        <Button
                          type="submit"
                          variante="sekundaer"
                          groesse="klein"
                        >
                          Erneut suchen
                        </Button>
                      </form>
                    )}
                  </div>
                </KarteKopf>

                <KarteInhalt>
                  {eigene.length === 0 ? (
                    <p className="py-3 text-[13px] text-gedaempft">
                      Im Bestand passt derzeit nichts. Neue Objekte werden
                      automatisch geprüft.
                    </p>
                  ) : (
                    <ul className="divide-y divide-linie">
                      {eigene.map((t) => {
                        const objekt = t.objekte as unknown as {
                          id: string;
                          objektnummer: string;
                          bezeichnung: string;
                          titel: string | null;
                          ort: string | null;
                          wohnflaeche: number | null;
                          zimmer: number | null;
                          kaufpreis: number | null;
                          kaltmiete: number | null;
                          vermarktungsart: string;
                        } | null;
                        if (!objekt) return null;

                        return (
                          <li
                            key={t.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <Marke ton={punktTon(t.punktzahl)}>
                                {t.punktzahl} %
                              </Marke>
                              <span className="min-w-0">
                                <Link
                                  href={`/objekte/${objekt.id}`}
                                  className="block truncate text-[13px] font-medium hover:text-akzent"
                                >
                                  {objekt.titel || objekt.bezeichnung}
                                </Link>
                                <span className="zahl block text-[12px] text-gedaempft">
                                  {objekt.objektnummer}
                                  {objekt.ort ? ` · ${objekt.ort}` : ""} ·{" "}
                                  {istMiete(objekt.vermarktungsart)
                                    ? `${euro(objekt.kaltmiete)} / Monat`
                                    : euro(objekt.kaufpreis)}
                                  {objekt.wohnflaeche
                                    ? ` · ${flaeche(objekt.wohnflaeche)}`
                                    : ""}
                                </span>
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {t.status !== "neu" && (
                                <Marke
                                  ton={
                                    t.status === "abgelehnt" ? "neutral" : "info"
                                  }
                                >
                                  {STATUS_BEZEICHNUNG[t.status]}
                                </Marke>
                              )}
                              {darfAendern && t.status === "neu" && (
                                <>
                                  <form action={trefferStatusSetzen}>
                                    <input type="hidden" name="treffer_id" value={t.id} />
                                    <input type="hidden" name="status" value="vorgemerkt" />
                                    <Button type="submit" variante="sekundaer" groesse="klein">
                                      Vormerken
                                    </Button>
                                  </form>
                                  <form action={trefferStatusSetzen}>
                                    <input type="hidden" name="treffer_id" value={t.id} />
                                    <input type="hidden" name="status" value="abgelehnt" />
                                    <Button type="submit" variante="leise" groesse="klein">
                                      Passt nicht
                                    </Button>
                                  </form>
                                </>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </KarteInhalt>
              </Karte>
            );
          })}
        </div>
      )}

      <Hinweis ton="info" className="mt-6">
        Vermarktungsart, Kategorie, Ort und Preisrahmen schließen aus. Fläche und
        Zimmerzahl bestimmen nur die Reihenfolge — ein Objekt, das knapp
        danebenliegt, bleibt dadurch sichtbar. Die Auswahl trifft weiterhin der
        Makler, nicht das System.
      </Hinweis>
    </>
  );
}
