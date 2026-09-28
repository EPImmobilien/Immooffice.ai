import { Button } from "@/components/ui/Button";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { webExposeAdresse } from "@/lib/web-expose";
import {
  anfrageGelesen,
  webExposeLinkErneuern,
  webExposeWiderrufen,
} from "@/server/web-expose-aktionen";

import { WebExposeFormular } from "./WebExposeFormular";

/**
 * Ist der Zeitpunkt bereits verstrichen?
 * Ausserhalb der Komponente, weil `Date.now()` im Render-Pfad als unrein gilt.
 */
function abgelaufenSeit(zeitpunkt: string | null): boolean {
  if (!zeitpunkt) return false;
  const ziel = new Date(zeitpunkt).getTime();
  return !Number.isNaN(ziel) && ziel <= Date.now();
}

/**
 * Verwaltung des oeffentlichen Web-Exposes (Abschnitt 8).
 *
 * Zusammen an einer Stelle: Adresse, Einstellungen, Aufrufe und eingegangene
 * Anfragen. Der Widerruf steht bewusst hier und nicht in einem Untermenue —
 * wer eine Veroeffentlichung beenden will, hat es meist eilig.
 */
export async function WebExpose({
  objektId,
  darfFreigeben,
  basisUrl,
}: {
  objektId: string;
  darfFreigeben: boolean;
  basisUrl: string;
}) {
  const supabase = await serverClient();

  const { data: expose } = await supabase
    .from("web_expose")
    .select(
      "id, token, passwort_hash, ablauf_am, download_erlaubt, kontaktformular, widerrufen_am, veroeffentlicht_am",
    )
    .eq("objekt_id", objektId)
    .maybeSingle();

  const [{ data: aufrufe }, { data: anfragen }] = await Promise.all([
    expose
      ? supabase
          .from("web_expose_aufruf")
          .select("tag, aufrufe")
          .eq("web_expose_id", expose.id)
          .order("tag", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: null }),
    expose
      ? supabase
          .from("web_expose_anfrage")
          .select("id, name, email, telefon, nachricht, gelesen_am, erstellt_am")
          .eq("web_expose_id", expose.id)
          .order("erstellt_am", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: null }),
  ]);

  const gesamt = (aufrufe ?? []).reduce((summe, a) => summe + a.aufrufe, 0);
  const offen = (anfragen ?? []).filter((a) => !a.gelesen_am);

  const abgelaufen = abgelaufenSeit(expose?.ablauf_am ?? null);
  const aktiv = Boolean(expose) && !expose?.widerrufen_am && !abgelaufen;

  return (
    <Karte>
      <KarteKopf className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <KarteTitel>Web-Exposé</KarteTitel>
          <KarteBeschreibung>
            Eine eigene Adresse zum Weitergeben — ohne Zugang zur Anwendung.
          </KarteBeschreibung>
        </div>
        {!expose ? (
          <Marke>nicht veröffentlicht</Marke>
        ) : aktiv ? (
          <Marke ton="erfolg">öffentlich</Marke>
        ) : (
          <Marke ton="warnung">
            {expose.widerrufen_am ? "zurückgezogen" : "abgelaufen"}
          </Marke>
        )}
      </KarteKopf>

      <KarteInhalt className="space-y-5">
        {expose && (
          <div className="rounded-[var(--radius)] bg-flaeche-gedaempft px-4 py-3">
            <p className="text-[11px] tracking-wide text-gedaempft uppercase">
              Adresse
            </p>
            <p className="zahl mt-1 break-all text-[13px] text-text">
              {webExposeAdresse(expose.token, basisUrl)}
            </p>
            <p className="mt-2 text-[12px] text-gedaempft">
              {expose.passwort_hash
                ? "Passwortgeschützt."
                : "Ohne Passwort — wer die Adresse kennt, sieht das Exposé."}
              {expose.ablauf_am
                ? ` Sichtbar bis ${datum(expose.ablauf_am)}.`
                : " Unbefristet."}
            </p>
          </div>
        )}

        {expose && (
          <div className="flex flex-wrap gap-5">
            <div>
              <p className="text-[11px] tracking-wide text-gedaempft uppercase">
                Aufrufe
              </p>
              <p className="zahl mt-0.5 text-[19px] font-semibold text-text">
                {gesamt}
              </p>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-gedaempft uppercase">
                Anfragen
              </p>
              <p className="zahl mt-0.5 text-[19px] font-semibold text-text">
                {anfragen?.length ?? 0}
                {offen.length > 0 && (
                  <span className="ml-1.5 text-[12px] font-normal text-akzent">
                    {offen.length} neu
                  </span>
                )}
              </p>
            </div>
            <p className="max-w-xs text-[12px] text-gedaempft">
              Gezählt werden Seitenaufrufe je Tag. Es werden keine IP-Adressen
              und keine Wiedererkennungsmerkmale gespeichert — eindeutige
              Besucher lassen sich deshalb nicht ausweisen.
            </p>
          </div>
        )}

        {darfFreigeben ? (
          <WebExposeFormular
            objektId={objektId}
            vorhanden={
              expose
                ? {
                    hatPasswort: Boolean(expose.passwort_hash),
                    ablaufAm: expose.ablauf_am,
                    downloadErlaubt: expose.download_erlaubt,
                    kontaktformular: expose.kontaktformular,
                  }
                : null
            }
          />
        ) : (
          <Hinweis ton="info">
            Veröffentlichen und Zurückziehen dürfen nur Rollen mit
            Freigaberecht.
          </Hinweis>
        )}

        {expose && darfFreigeben && (
          <div className="flex flex-wrap gap-2 border-t border-linie pt-4">
            <form action={webExposeLinkErneuern}>
              <input type="hidden" name="objekt_id" value={objektId} />
              <Button type="submit" variante="sekundaer" groesse="klein">
                Neuen Link erzeugen
              </Button>
            </form>
            {aktiv && (
              <form action={webExposeWiderrufen}>
                <input type="hidden" name="objekt_id" value={objektId} />
                <Button type="submit" variante="gefahr" groesse="klein">
                  Veröffentlichung zurückziehen
                </Button>
              </form>
            )}
            <p className="w-full text-[12px] text-gedaempft">
              Ein neuer Link macht die bisherige Adresse sofort ungültig — der
              richtige Weg, wenn ein Link in falsche Hände geraten ist. Der
              Widerruf beendet die Veröffentlichung ganz.
            </p>
          </div>
        )}

        {anfragen && anfragen.length > 0 && (
          <div className="border-t border-linie pt-4">
            <p className="mb-2 text-[13px] font-medium text-text">Anfragen</p>
            <ul className="divide-y divide-linie">
              {anfragen.map((anfrage) => (
                <li key={anfrage.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-text">
                        {anfrage.name}
                        {!anfrage.gelesen_am && (
                          <Marke ton="akzent" className="ml-2">
                            neu
                          </Marke>
                        )}
                      </p>
                      <p className="zahl text-[12px] text-gedaempft">
                        {anfrage.email}
                        {anfrage.telefon ? ` · ${anfrage.telefon}` : ""} ·{" "}
                        {datum(anfrage.erstellt_am)}
                      </p>
                    </div>
                    {!anfrage.gelesen_am && (
                      <form action={anfrageGelesen}>
                        <input type="hidden" name="anfrage_id" value={anfrage.id} />
                        <input type="hidden" name="objekt_id" value={objektId} />
                        <Button type="submit" variante="leise" groesse="klein">
                          Als gelesen markieren
                        </Button>
                      </form>
                    )}
                  </div>
                  {anfrage.nachricht && (
                    <p className="mt-1.5 text-[13px] whitespace-pre-line text-gedaempft">
                      {anfrage.nachricht}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </KarteInhalt>
    </Karte>
  );
}
