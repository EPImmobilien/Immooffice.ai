import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { VertragAnlegen } from "@/components/vertraege/VertragAnlegen";
import { Karte, KarteBeschreibung, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import {
  SIGNATUR_EINORDNUNG,
  VERTRAGSARTEN,
  VERTRAGSSTATUS,
  type Vertragsart,
  type Vertragsstatus,
} from "@/lib/vertraege";

export const metadata: Metadata = { title: "Verträge" };

const AUSWAHL =
  "id, titel, art, status, erstellt_am, geschlossen_am, unterzeichnungen, " +
  "objekt:objekte(objektnummer, bezeichnung), kontakt:kontakte(vorname, nachname, firma)";

interface Zeile {
  id: string;
  titel: string;
  art: Vertragsart;
  status: Vertragsstatus;
  erstellt_am: string;
  geschlossen_am: string | null;
  unterzeichnungen: unknown[];
  objekt: { objektnummer: string; bezeichnung: string } | null;
  kontakt: { vorname: string | null; nachname: string | null; firma: string | null } | null;
}

const STATUS_TON: Record<Vertragsstatus, "neutral" | "info" | "erfolg" | "fehler"> = {
  entwurf: "neutral",
  versendet: "info",
  unterzeichnet: "erfolg",
  widerrufen: "fehler",
  abgelehnt: "fehler",
};

export default async function VertraegeSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "lesen", sitzung.uebersteuerung);

  const supabase = await serverClient();
  const [liste, objekte, kontakte] = await Promise.all([
    supabase.from("vertraege").select(AUSWAHL).order("erstellt_am", { ascending: false }),
    supabase
      .from("objekte")
      .select("id, objektnummer, bezeichnung")
      .is("geloescht_am", null)
      .order("objektnummer", { ascending: false })
      .limit(300),
    supabase
      .from("kontakte")
      .select("id, vorname, nachname, firma")
      .is("geloescht_am", null)
      .order("nachname", { ascending: true })
      .limit(300),
  ]);

  const zeilen = (liste.data ?? []) as unknown as Zeile[];
  const darfAnlegen = hatRecht(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);

  return (
    <>
      <Seitenkopf
        titel="Verträge"
        beschreibung="Maklerverträge, Reservierungen und Protokolle mit einfacher elektronischer Signatur."
      />

      <Hinweis ton="warnung" className="mb-5" titel="Was diese Unterschrift ist">
        {SIGNATUR_EINORDNUNG}
      </Hinweis>

      {darfAnlegen && (
        <div className="mb-5">
          <VertragAnlegen
            objekte={(objekte.data ?? []).map((o) => ({
              id: o.id,
              name: `${o.objektnummer} ${o.bezeichnung}`,
            }))}
            kontakte={(kontakte.data ?? []).map((k) => ({
              id: k.id,
              name:
                [k.vorname, k.nachname].filter(Boolean).join(" ") ||
                k.firma ||
                "Ohne Namen",
            }))}
          />
        </div>
      )}

      {zeilen.length === 0 ? (
        <Karte>
          <KarteKopf>
            <KarteTitel>Noch kein Vertrag</KarteTitel>
            <KarteBeschreibung>
              Ein Vertrag entsteht als Entwurf, bekommt seinen Text und wird dann
              über einen Link zur Unterschrift gegeben. Der Text ist ab der ersten
              Unterschrift gesperrt.
            </KarteBeschreibung>
          </KarteKopf>
        </Karte>
      ) : (
        <div className="space-y-2">
          {zeilen.map((zeile) => {
            const name = zeile.kontakt
              ? [zeile.kontakt.vorname, zeile.kontakt.nachname]
                  .filter(Boolean)
                  .join(" ") || zeile.kontakt.firma
              : null;
            const anzahl = Array.isArray(zeile.unterzeichnungen)
              ? zeile.unterzeichnungen.length
              : 0;

            return (
              <Link
                key={zeile.id}
                href={`/vertraege/${zeile.id}`}
                className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4 transition-colors hover:border-akzent/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-text">
                        {zeile.titel}
                      </p>
                      <Marke ton={STATUS_TON[zeile.status]}>
                        {VERTRAGSSTATUS[zeile.status]}
                      </Marke>
                      <Marke>{VERTRAGSARTEN[zeile.art]}</Marke>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-gedaempft">
                      {[
                        zeile.objekt
                          ? `${zeile.objekt.objektnummer} ${zeile.objekt.bezeichnung}`
                          : null,
                        name,
                        zeile.geschlossen_am
                          ? `geschlossen ${datum(zeile.geschlossen_am)}`
                          : `angelegt ${datum(zeile.erstellt_am)}`,
                        anzahl > 0
                          ? `${anzahl} ${anzahl === 1 ? "Unterschrift" : "Unterschriften"}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
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
