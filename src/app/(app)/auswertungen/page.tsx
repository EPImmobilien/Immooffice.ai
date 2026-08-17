import type { Metadata } from "next";

import { Seitenkopf } from "@/components/Seitenkopf";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { fristlage } from "@/lib/arbeitsmittel";
import {
  MINDESTZAHL,
  aufgabenlage,
  bestandsuebersicht,
  trichter,
  vermarktungsdauer,
  type BestandZeile,
  type Statuswechsel,
} from "@/lib/auswertungen";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { euro, zahl } from "@/lib/format";
import { OBJEKTSTATUS, statusTon } from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Auswertungen" };

/** Ein Wert mit Beschriftung. `null` erscheint als Hinweis, nicht als Null. */
function Kennzahl({
  bezeichnung,
  wert,
  hinweis,
}: {
  bezeichnung: string;
  wert: string | null;
  hinweis?: string;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-gedaempft">
        {bezeichnung}
      </p>
      {wert === null ? (
        <p className="mt-1 text-[13px] text-gedaempft">Noch keine Grundlage</p>
      ) : (
        <p className="zahl mt-1 text-[22px] font-semibold text-text">{wert}</p>
      )}
      {hinweis && <p className="mt-0.5 text-[12px] text-gedaempft">{hinweis}</p>}
    </div>
  );
}

/** Waagerechter Balken, Breite als Anteil am größten Wert. */
function Balken({ anteil }: { anteil: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-flaeche-gedaempft">
      <div
        className="h-full rounded-full bg-akzent"
        style={{ width: `${Math.max(anteil, 2)}%` }}
      />
    </div>
  );
}

export default async function AuswertungenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "auswertungen", "lesen", sitzung.uebersteuerung);

  const supabase = await serverClient();

  const [objekteAntwort, wechselAntwort, aufnahmenAntwort, aufgabenAntwort, exposeAntwort] =
    await Promise.all([
      supabase
        .from("objekte")
        .select("status, kaufpreis, kaltmiete, erstellt_am")
        .is("geloescht_am", null),
      // Der Verlauf ist die Grundlage der Dauer: Ein Feld am Objekt würde beim
      // zweiten Statuswechsel überschrieben.
      supabase
        .from("aktivitaeten")
        .select("objekt_id, metadaten, erstellt_am")
        .eq("typ", "status_geaendert")
        .order("erstellt_am", { ascending: true }),
      supabase.from("objektaufnahmen").select("status"),
      supabase.from("aufgaben").select("faellig_am").is("erledigt_am", null),
      supabase
        .from("web_expose")
        .select("objekt_id, objekte(objektnummer, bezeichnung), web_expose_aufruf(aufrufe)")
        .is("widerrufen_am", null),
    ]);

  const objekte = (objekteAntwort.data ?? []) as unknown as BestandZeile[];
  const bestand = bestandsuebersicht(objekte);

  const wechsel: Statuswechsel[] = (wechselAntwort.data ?? [])
    .map((w) => ({
      objekt_id: String(w.objekt_id ?? ""),
      nachher: String(
        (w.metadaten as Record<string, unknown> | null)?.["nachher"] ?? "",
      ),
      erstellt_am: String(w.erstellt_am),
    }))
    .filter((w) => w.objekt_id !== "" && w.nachher !== "");

  const dauer = vermarktungsdauer(wechsel);

  const aufnahmen = aufnahmenAntwort.data ?? [];
  const abgeschlossen = objekte.filter((o) =>
    ["verkauft", "vermietet"].includes(o.status),
  ).length;

  const stufen = trichter([
    { bezeichnung: "Objektaufnahmen", anzahl: aufnahmen.length },
    {
      bezeichnung: "In den Bestand übernommen",
      anzahl: aufnahmen.filter((a) => a.status === "uebernommen").length,
    },
    {
      bezeichnung: "In Vermarktung",
      anzahl: objekte.filter((o) =>
        ["aktiv", "reserviert"].includes(o.status),
      ).length,
    },
    { bezeichnung: "Abgeschlossen", anzahl: abgeschlossen },
  ]);

  const heute = new Date();
  const lage = aufgabenlage(aufgabenAntwort.data ?? [], heute, fristlage);

  // Aufrufe je veröffentlichtem Web-Exposé, absteigend.
  const exposes = (exposeAntwort.data ?? [])
    .map((e) => {
      const objekt = e.objekte as unknown as {
        objektnummer: string;
        bezeichnung: string;
      } | null;
      const aufrufe = (
        (e.web_expose_aufruf ?? []) as unknown as { aufrufe: number }[]
      ).reduce((summe, tag) => summe + (tag.aufrufe ?? 0), 0);
      return {
        objektId: String(e.objekt_id),
        name: objekt ? `${objekt.objektnummer} ${objekt.bezeichnung}` : "Objekt",
        aufrufe,
      };
    })
    .sort((a, b) => b.aufrufe - a.aufrufe)
    .slice(0, 8);

  const meisteAufrufe = exposes[0]?.aufrufe ?? 0;
  const groessteGruppe = bestand.jeStatus[0]?.anzahl ?? 0;

  return (
    <>
      <Seitenkopf
        titel="Auswertungen"
        beschreibung="Zahlen aus dem eigenen Bestand — ohne Vergleich mit fremden Marktdaten."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Karte className="lg:col-span-2">
          <KarteKopf>
            <KarteTitel>Bestand</KarteTitel>
            <KarteBeschreibung>
              {bestand.gesamt === 0
                ? "Noch keine Objekte erfasst."
                : `${bestand.gesamt} ${bestand.gesamt === 1 ? "Objekt" : "Objekte"} insgesamt.`}
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt className="space-y-3">
            {bestand.jeStatus.map(({ status, anzahl }) => (
              <div key={status} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Marke ton={statusTon(status)}>{OBJEKTSTATUS[status]}</Marke>
                  <span className="zahl text-[13px] text-text">{zahl(anzahl)}</span>
                </div>
                <Balken
                  anteil={
                    groessteGruppe > 0 ? (anzahl / groessteGruppe) * 100 : 0
                  }
                />
              </div>
            ))}
            {bestand.jeStatus.length === 0 && (
              <p className="text-[13px] text-gedaempft">
                Sobald Objekte angelegt sind, steht hier die Verteilung.
              </p>
            )}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf>
            <KarteTitel>Kennzahlen</KarteTitel>
          </KarteKopf>
          <KarteInhalt className="space-y-5">
            <Kennzahl
              bezeichnung="Volumen in Vermarktung"
              wert={bestand.volumenAktiv > 0 ? euro(bestand.volumenAktiv) : null}
              hinweis="Kaufpreise aktiver und reservierter Objekte"
            />
            <Kennzahl
              bezeichnung="Vermarktungsdauer"
              wert={dauer ? `${zahl(dauer.medianTage)} Tage` : null}
              hinweis={
                dauer
                  ? `Median aus ${dauer.faelle} ${dauer.faelle === 1 ? "Abschluss" : "Abschlüssen"}`
                  : `Ab ${MINDESTZAHL} Abschlüssen aussagekräftig`
              }
            />
            <Kennzahl
              bezeichnung="Offene Aufgaben"
              wert={zahl(
                lage.ueberfaellig + lage.heute + lage.dieseWoche + lage.spaeter + lage.ohneFrist,
              )}
              hinweis={
                lage.ueberfaellig > 0
                  ? `${lage.ueberfaellig} davon überfällig`
                  : "nichts überfällig"
              }
            />
          </KarteInhalt>
        </Karte>

        <Karte className="lg:col-span-2">
          <KarteKopf>
            <KarteTitel>Von der Aufnahme zum Abschluss</KarteTitel>
            <KarteBeschreibung>
              Jeder Anteil bezieht sich auf die Stufe darüber.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt className="space-y-3">
            {stufen.map((stufe) => (
              <div
                key={stufe.bezeichnung}
                className="flex items-center justify-between gap-3 border-b border-linie py-2 last:border-0"
              >
                <span className="text-[13.5px] text-text">{stufe.bezeichnung}</span>
                <span className="flex items-center gap-3">
                  {stufe.anteil !== null && (
                    <span className="text-[12px] text-gedaempft">
                      {stufe.anteil} % der Stufe darüber
                    </span>
                  )}
                  <span className="zahl text-[15px] font-semibold text-text">
                    {zahl(stufe.anzahl)}
                  </span>
                </span>
              </div>
            ))}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf>
            <KarteTitel>Aufgabenlage</KarteTitel>
          </KarteKopf>
          <KarteInhalt>
            <dl className="space-y-2 text-[13px]">
              {[
                ["Überfällig", lage.ueberfaellig],
                ["Heute", lage.heute],
                ["Diese Woche", lage.dieseWoche],
                ["Später", lage.spaeter],
                ["Ohne Frist", lage.ohneFrist],
              ].map(([bezeichnung, anzahl]) => (
                <div key={String(bezeichnung)} className="flex justify-between gap-4">
                  <dt className="text-gedaempft">{bezeichnung}</dt>
                  <dd className="zahl text-text">{zahl(Number(anzahl))}</dd>
                </div>
              ))}
            </dl>
          </KarteInhalt>
        </Karte>

        <Karte className="lg:col-span-3">
          <KarteKopf>
            <KarteTitel>Web-Exposés</KarteTitel>
            <KarteBeschreibung>
              Aufrufe seit der Veröffentlichung. Gezählt wird ein Aufruf je Tag
              und Exposé, ohne Personenbezug.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt className="space-y-3">
            {exposes.length === 0 ? (
              <p className="text-[13px] text-gedaempft">
                Noch kein Web-Exposé veröffentlicht.
              </p>
            ) : (
              exposes.map((e) => (
                <div key={e.objektId} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[13.5px] text-text">{e.name}</span>
                    <span className="zahl shrink-0 text-[13px] text-gedaempft">
                      {zahl(e.aufrufe)}
                    </span>
                  </div>
                  <Balken
                    anteil={
                      meisteAufrufe > 0 ? (e.aufrufe / meisteAufrufe) * 100 : 0
                    }
                  />
                </div>
              ))
            )}
          </KarteInhalt>
        </Karte>
      </div>

      {/*
        Bewusst nicht gebaut: eine Auswertung je Mitarbeiter.
        Technisch wäre sie einfach — der Verlauf hält fest, wer was getan hat.
        Eine Anwendung, die daraus eine Leistungsübersicht macht, ist in
        Deutschland aber eine Einrichtung zur Verhaltens- und Leistungskontrolle
        und damit mitbestimmungspflichtig (§ 87 Absatz 1 Nummer 6 BetrVG). Das
        ist keine Funktion, die nebenbei entsteht.
      */}
      <Hinweis ton="info" className="mt-5">
        Alle Zahlen stammen ausschließlich aus dem eigenen Bestand. Sie sind kein
        Marktvergleich und keine Bewertung. Eine Auswertung der Leistung
        einzelner Mitarbeiter ist bewusst nicht enthalten — sie wäre in
        Unternehmen mit Betriebsrat mitbestimmungspflichtig.
      </Hinweis>
    </>
  );
}
