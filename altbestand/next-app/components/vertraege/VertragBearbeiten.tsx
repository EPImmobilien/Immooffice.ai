"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import type { Vertragsstatus } from "@/lib/vertraege";
import {
  vertragSpeichern,
  vertragVersenden,
  vertragZurueckziehen,
  widerrufFesthalten,
} from "@/server/vertrag-aktionen";

/**
 * Vertragstext und Unterschriftslink.
 *
 * Der Text ist ab der ersten Unterschrift gesperrt — nicht nur hier, sondern
 * auch in der Datenbank. Sonst stuende eine Unterschrift unter einem anderen
 * Text als dem unterzeichneten.
 */
export function VertragBearbeiten({
  vertragId,
  titel,
  inhalt,
  verbraucher,
  belehrtAm,
  geschlossenAm,
  gesperrt,
  status,
  link,
  darfAendern,
  darfFreigeben,
}: {
  vertragId: string;
  titel: string;
  inhalt: string;
  verbraucher: boolean;
  belehrtAm: string | null;
  geschlossenAm: string | null;
  gesperrt: boolean;
  status: Vertragsstatus;
  link: string | null;
  darfAendern: boolean;
  darfFreigeben: boolean;
}) {
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler"; text: string } | null>(
    null,
  );
  const [laeuft, starten] = useTransition();

  function fuehre(
    aktion: (daten: FormData) => Promise<{ fehler?: string; hinweis?: string }>,
    daten: FormData,
  ) {
    setMeldung(null);
    starten(async () => {
      const e = await aktion(daten);
      if (e.fehler) setMeldung({ ton: "fehler", text: e.fehler });
      else if (e.hinweis) setMeldung({ ton: "erfolg", text: e.hinweis });
    });
  }

  return (
    <div className="space-y-5">
      <form
        action={(daten) => fuehre(vertragSpeichern, daten)}
        className="space-y-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5"
      >
        <input type="hidden" name="vertrag_id" value={vertragId} />

        <Feld beschriftung="Titel" id="vb-titel">
          <Eingabe name="titel" defaultValue={titel} maxLength={200} disabled={!darfAendern} />
        </Feld>

        <Feld
          beschriftung="Vertragstext"
          id="vb-inhalt"
          hinweis={
            gesperrt
              ? "Gesperrt: Nach der ersten Unterschrift ist der Text unveränderlich."
              : "Ihr eigener Text. ImmoOffice.ai liefert bewusst kein Muster mit."
          }
        >
          <Textfeld
            name="inhalt"
            rows={16}
            defaultValue={inhalt}
            disabled={gesperrt || !darfAendern}
            className="font-mono text-[13px]"
          />
        </Feld>

        <div className="grid gap-4 sm:grid-cols-3">
          <Feld
            beschriftung="Vertragspartner ist Verbraucher"
            id="vb-verbraucher"
            hinweis="Ihre Einschätzung — entscheidet über das Widerrufsrecht"
          >
            <label className="flex h-10 items-center gap-2 text-[13px] text-text">
              <input
                type="checkbox"
                name="verbraucher"
                value="ja"
                defaultChecked={verbraucher}
                disabled={!darfAendern}
                className="size-4 rounded border-linie-stark accent-akzent"
              />
              Ja
            </label>
          </Feld>
          <Feld beschriftung="Vertragsschluss" id="vb-geschlossen">
            <Eingabe
              type="date"
              name="geschlossen_am"
              defaultValue={geschlossenAm ?? ""}
              disabled={!darfAendern}
            />
          </Feld>
          <Feld
            beschriftung="Widerrufsbelehrung am"
            id="vb-belehrt"
            hinweis="Ohne Belehrung läuft die Frist zwölf Monate länger"
          >
            <Eingabe
              type="date"
              name="belehrt_am"
              defaultValue={belehrtAm ?? ""}
              disabled={!darfAendern}
            />
          </Feld>
        </div>

        {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

        {darfAendern && (
          <Button type="submit" disabled={laeuft}>
            {laeuft ? "Speichert …" : "Speichern"}
          </Button>
        )}
      </form>

      <div className="space-y-3 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
        <h2 className="text-[15px] font-semibold text-text">Zur Unterschrift geben</h2>

        {link ? (
          <>
            <p className="text-[13px] text-gedaempft">
              Geben Sie diesen Link an die Gegenseite. Er wird{" "}
              <strong className="text-text">nicht automatisch versendet</strong> —
              ein eigener Mailversand ist noch nicht eingerichtet.
            </p>
            <p className="zahl rounded-[var(--radius)] border border-linie bg-hintergrund px-3 py-2 text-[12.5px] break-all">
              {link}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-gedaempft">
            Noch kein Link erzeugt. Ein Entwurf ist bewusst nicht abrufbar.
          </p>
        )}

        {darfFreigeben && (
          <div className="flex flex-wrap gap-2">
            {status !== "unterzeichnet" && (
              <form action={(daten) => fuehre(vertragVersenden, daten)}>
                <input type="hidden" name="vertrag_id" value={vertragId} />
                <Button type="submit" groesse="klein" disabled={laeuft}>
                  {link ? "Link erneuern" : "Link erzeugen"}
                </Button>
              </form>
            )}
            {status === "versendet" && (
              <form action={vertragZurueckziehen}>
                <input type="hidden" name="vertrag_id" value={vertragId} />
                <Button type="submit" variante="sekundaer" groesse="klein">
                  Zurückziehen
                </Button>
              </form>
            )}
            {status === "unterzeichnet" && (
              <form action={widerrufFesthalten}>
                <input type="hidden" name="vertrag_id" value={vertragId} />
                <Button type="submit" variante="sekundaer" groesse="klein">
                  Widerruf festhalten
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
