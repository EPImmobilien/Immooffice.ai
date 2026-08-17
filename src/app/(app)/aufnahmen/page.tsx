import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Marke } from "@/components/ui/Status";
import { AUFNAHMESTATUS, type Aufnahmestatus } from "@/lib/aufnahme";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum, euro, flaeche } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Objektaufnahmen" };

const STATUS_TON: Record<Aufnahmestatus, "warnung" | "erfolg" | "neutral"> = {
  offen: "warnung",
  uebernommen: "erfolg",
  verworfen: "neutral",
};

const AUSWAHL =
  "id, aufgenommen_am, bezeichnung, ort, wohnflaeche, zimmer, preisvorstellung, " +
  "status, objekt_id, unterlagen_offen, kontakt:kontakte(vorname, nachname, firma)";

/**
 * Gestalt einer Zeile dieser Liste.
 *
 * Nötig, weil im Projekt keine aus dem Schema generierten Datenbanktypen
 * liegen: Die Abfrage liefert deshalb keinen brauchbaren Typ, und ein direkter
 * Feldzugriff darauf schlägt in der Typprüfung fehl. Dieselbe Handhabung wie in
 * den übrigen Listen — die Angaben hier sind eine Zusage über die Abfrage
 * darüber, keine geprüfte Wahrheit.
 */
interface Zeile {
  id: string;
  aufgenommen_am: string;
  bezeichnung: string;
  ort: string | null;
  wohnflaeche: number | null;
  zimmer: number | null;
  preisvorstellung: number | null;
  status: Aufnahmestatus;
  objekt_id: string | null;
  unterlagen_offen: string[] | null;
  kontakt: {
    vorname: string | null;
    nachname: string | null;
    firma: string | null;
  } | null;
}

export default async function AufnahmenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "lesen");

  const supabase = await serverClient();
  const { data: aufnahmen } = await supabase
    .from("objektaufnahmen")
    .select(AUSWAHL)
    .order("aufgenommen_am", { ascending: false });

  const liste = (aufnahmen ?? []) as unknown as Zeile[];
  const offen = liste.filter((a) => a.status === "offen").length;
  const darfAnlegen = hatRecht(sitzung.rolle, "objekte", "anlegen");

  return (
    <>
      <Seitenkopf
        titel="Objektaufnahmen"
        beschreibung={
          offen > 0
            ? `${offen} ${offen === 1 ? "Aufnahme wartet" : "Aufnahmen warten"} auf eine Entscheidung.`
            : "Der Vor-Ort-Termin beim Eigentümer — vor dem Objekt."
        }
      >
        {darfAnlegen && (
          <Link href="/aufnahmen/neu" className={buttonKlassen()}>
            Neue Aufnahme
          </Link>
        )}
      </Seitenkopf>

      {liste.length === 0 ? (
        <Karte>
          <KarteKopf>
            <KarteTitel>Noch keine Aufnahme</KarteTitel>
            <KarteBeschreibung>
              Eine Objektaufnahme bildet den Termin in der Wohnung ab: Kerndaten,
              Zustand der Bauteile, fehlende Unterlagen, Notizen. Kommt der
              Auftrag zustande, wird daraus mit einem Klick ein Objekt samt
              verknüpftem Eigentümer und Aufgaben für die offenen Unterlagen.
            </KarteBeschreibung>
          </KarteKopf>
          {darfAnlegen && (
            <KarteInhalt>
              <Link href="/aufnahmen/neu" className={buttonKlassen()}>
                Erste Aufnahme anlegen
              </Link>
            </KarteInhalt>
          )}
        </Karte>
      ) : (
        <div className="space-y-2">
          {liste.map((aufnahme) => {
            const kontakt = aufnahme.kontakt as unknown as {
              vorname: string | null;
              nachname: string | null;
              firma: string | null;
            } | null;
            const name = kontakt
              ? [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ") ||
                kontakt.firma
              : null;
            const fehlend = (aufnahme.unterlagen_offen ?? []).length;

            return (
              <Link
                key={aufnahme.id}
                href={`/aufnahmen/${aufnahme.id}`}
                className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4 transition-colors hover:border-akzent/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-text">
                        {aufnahme.bezeichnung}
                      </p>
                      <Marke ton={STATUS_TON[aufnahme.status as Aufnahmestatus]}>
                        {AUFNAHMESTATUS[aufnahme.status as Aufnahmestatus]}
                      </Marke>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-gedaempft">
                      {[
                        datum(aufnahme.aufgenommen_am),
                        aufnahme.ort,
                        name,
                        fehlend > 0
                          ? `${fehlend} ${fehlend === 1 ? "Unterlage" : "Unterlagen"} offen`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  <div className="text-right text-[13px] text-gedaempft">
                    {aufnahme.wohnflaeche !== null && (
                      <p className="zahl">{flaeche(aufnahme.wohnflaeche)}</p>
                    )}
                    {aufnahme.preisvorstellung !== null && (
                      <p className="zahl">{euro(aufnahme.preisvorstellung)}</p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
