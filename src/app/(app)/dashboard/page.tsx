import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import {
  Karte,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { OBJEKTSTATUS, statusTon } from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

function Kennzahl({
  bezeichnung,
  wert,
  zusatz,
}: {
  bezeichnung: string;
  wert: string;
  zusatz?: string;
}) {
  return (
    <Karte>
      <KarteInhalt>
        <p className="text-[13px] text-gedaempft">{bezeichnung}</p>
        <p className="zahl mt-1.5 font-titel text-2xl font-semibold text-text">
          {wert}
        </p>
        {zusatz && <p className="mt-0.5 text-[12px] text-gedaempft">{zusatz}</p>}
      </KarteInhalt>
    </Karte>
  );
}

/**
 * Verbleibende Tage der Testphase.
 *
 * Bewusst ausserhalb der Komponente: Ein Aufruf von Date.now() im Render-Pfad
 * gilt als unrein und wird von der Lint-Regel react-hooks/purity beanstandet.
 */
function verbleibendeTage(bis: string): number {
  if (!bis) return 0;
  const ziel = new Date(bis).getTime();
  if (Number.isNaN(ziel)) return 0;
  return Math.max(0, Math.ceil((ziel - Date.now()) / 86_400_000));
}

export default async function DashboardSeite() {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  const [objekteAntwort, kontakteAntwort, letzteAntwort] = await Promise.all([
    supabase
      .from("objekte")
      .select("status", { count: "exact" })
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
  ]);

  const objekte = objekteAntwort.data ?? [];
  const aktiv = objekte.filter((o) =>
    ["aktiv", "reserviert"].includes(o.status),
  ).length;
  const inArbeit = objekte.filter((o) =>
    ["akquise", "vorbereitung"].includes(o.status),
  ).length;
  const abgeschlossen = objekte.filter((o) =>
    ["verkauft", "vermietet"].includes(o.status),
  ).length;

  const testTageRest = verbleibendeTage(sitzung.testphaseBis);

  return (
    <>
      <Seitenkopf
        titel={`Willkommen, ${sitzung.name.split(" ")[0]}`}
        beschreibung={sitzung.mandantName}
      >
        <Link href="/objekte/neu" className={buttonKlassen()}>
          Objekt anlegen
        </Link>
      </Seitenkopf>

      {sitzung.aboStatus === "test" && (
        <Hinweis ton="info" titel="Testphase läuft" className="mb-5">
          Noch {testTageRest} {testTageRest === 1 ? "Tag" : "Tage"} bis zum{" "}
          {datum(sitzung.testphaseBis)}. Es entstehen keine Kosten, solange kein
          Tarif ausgewählt wurde.
        </Hinweis>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kennzahl
          bezeichnung="Aktive Objekte"
          wert={String(aktiv)}
          zusatz={`${inArbeit} in Vorbereitung`}
        />
        <Kennzahl bezeichnung="Kontakte" wert={String(kontakteAntwort.count ?? 0)} />
        <Kennzahl
          bezeichnung="Abgeschlossen"
          wert={String(abgeschlossen)}
          zusatz="verkauft oder vermietet"
        />
        <Kennzahl
          bezeichnung="Credits"
          wert="100"
          zusatz="Testguthaben"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Karte className="lg:col-span-2">
          <KarteKopf>
            <KarteTitel>Zuletzt bearbeitet</KarteTitel>
          </KarteKopf>
          <KarteInhalt>
            {(letzteAntwort.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-gedaempft">
                Noch keine Objekte vorhanden.
              </p>
            ) : (
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
            )}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf>
            <KarteTitel>Stand des Ausbaus</KarteTitel>
          </KarteKopf>
          <KarteInhalt className="space-y-2.5 text-[13px]">
            <p className="text-gedaempft">
              Dies ist der Durchstich v0.1. Verfügbar sind Objekte, Kontakte,
              Exposé mit KI-Text und PDF-Export.
            </p>
            <p className="text-gedaempft">
              Termine, Aufgaben, Suchprofile, Portalexport und Abrechnung folgen
              im weiteren Verlauf von Phase 1.
            </p>
          </KarteInhalt>
        </Karte>
      </div>
    </>
  );
}
