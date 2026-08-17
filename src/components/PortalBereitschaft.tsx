import { buttonKlassen } from "@/components/ui/Button";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Marke } from "@/components/ui/Status";
import type { Befund } from "@/lib/openimmo/typen";

/**
 * Zeigt an, ob ein Objekt an die Portale uebertragen werden kann.
 *
 * Die Pruefung laeuft VOR der Uebertragung, damit fehlende Angaben in der
 * Oberflaeche sichtbar werden statt als Ablehnung des Portals zurueckzukommen
 * (OPENIMMO_MAPPING.md, Abschnitt 13).
 */
export function PortalBereitschaft({
  objektId,
  befunde,
}: {
  objektId: string;
  befunde: Befund[];
}) {
  const fehler = befunde.filter((b) => b.schwere === "fehler");
  const warnungen = befunde.filter((b) => b.schwere === "warnung");
  const bereit = fehler.length === 0;

  return (
    <Karte>
      <KarteKopf className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <KarteTitel>Portalexport</KarteTitel>
          <KarteBeschreibung>
            OpenImmo 1.2.7 für ImmoScout24, Immowelt und Kleinanzeigen
          </KarteBeschreibung>
        </div>
        {bereit ? (
          <Marke ton="erfolg">Bereit</Marke>
        ) : (
          <Marke ton="warnung">
            {fehler.length} {fehler.length === 1 ? "Angabe fehlt" : "Angaben fehlen"}
          </Marke>
        )}
      </KarteKopf>

      <KarteInhalt className="space-y-4">
        {fehler.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-text">
              Vor der Veröffentlichung zu ergänzen
            </p>
            <ul className="space-y-1.5">
              {fehler.map((b) => (
                <li key={b.feld} className="flex gap-2 text-[13px]">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fehler" />
                  <span>
                    <strong className="font-medium text-text">{b.bezeichnung}</strong>
                    <span className="block text-gedaempft">{b.hinweis}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {warnungen.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-text">Empfohlen</p>
            <ul className="space-y-1.5">
              {warnungen.map((b) => (
                <li key={b.feld} className="flex gap-2 text-[13px]">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warnung" />
                  <span>
                    <strong className="font-medium text-text">{b.bezeichnung}</strong>
                    <span className="block text-gedaempft">{b.hinweis}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {bereit && warnungen.length === 0 && (
          <p className="text-[13px] text-gedaempft">
            Alle Pflichtangaben liegen vor.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a
            href={`/api/openimmo/${objektId}?paket=1`}
            className={buttonKlassen({
              variante: bereit ? "primaer" : "sekundaer",
              groesse: "klein",
            })}
            download
            aria-disabled={!bereit || undefined}
          >
            Übertragungspaket (ZIP)
          </a>
          <a
            href={`/api/openimmo/${objektId}`}
            className={buttonKlassen({ variante: "leise", groesse: "klein" })}
            download
            aria-disabled={!bereit || undefined}
          >
            Nur XML
          </a>
        </div>

        <p className="text-[12px] text-gedaempft">
          Das Paket enthält das OpenImmo-Dokument und die Bilddateien, so wie
          die Portale es erwarten. Das reine XML dient der Prüfung — es
          verweist auf keine Dateien. Die Übertragung an die Portale folgt in
          Phase 2.
        </p>
      </KarteInhalt>
    </Karte>
  );
}
