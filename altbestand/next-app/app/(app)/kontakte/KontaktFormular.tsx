"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import {
  Karte,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { KONTAKTROLLEN } from "@/lib/kontakt-begriffe";
import { kontaktSpeichern, type KontaktErgebnis } from "@/server/kontakt-aktionen";

export interface KontaktWerte {
  id?: string;
  anrede?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  firma?: string | null;
  email?: string | null;
  telefon?: string | null;
  mobil?: string | null;
  strasse?: string | null;
  hausnummer?: string | null;
  plz?: string | null;
  ort?: string | null;
  notizen?: string | null;
  einwilligung_werbung?: boolean | null;
  rollen?: string[];
}

export function KontaktFormular({ kontakt }: { kontakt?: KontaktWerte }) {
  const [zustand, aktion, laeuft] = useActionState<KontaktErgebnis, FormData>(
    kontaktSpeichern,
    {},
  );

  const fehlerZu = (feld: string) => zustand.feldFehler?.[feld];
  const gewaehlt = new Set(kontakt?.rollen ?? []);

  return (
    <form action={aktion} className="space-y-5">
      {kontakt?.id && <input type="hidden" name="id" value={kontakt.id} />}

      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Speichern nicht möglich">
          {zustand.fehler}
        </Hinweis>
      )}

      <Karte>
        <KarteKopf>
          <KarteTitel>Person</KarteTitel>
        </KarteKopf>
        <KarteInhalt className="grid gap-5 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Feld id="anrede" beschriftung="Anrede">
              <Auswahl name="anrede" defaultValue={kontakt?.anrede ?? ""}>
                <option value="">Keine Angabe</option>
                <option value="Frau">Frau</option>
                <option value="Herr">Herr</option>
                <option value="Firma">Firma</option>
              </Auswahl>
            </Feld>
          </div>
          <div className="sm:col-span-2">
            <Feld id="vorname" beschriftung="Vorname">
              <Eingabe name="vorname" defaultValue={kontakt?.vorname ?? ""} />
            </Feld>
          </div>
          <div className="sm:col-span-2">
            <Feld
              id="nachname"
              beschriftung="Nachname"
              {...(fehlerZu("nachname") ? { fehler: fehlerZu("nachname")! } : {})}
            >
              <Eingabe name="nachname" defaultValue={kontakt?.nachname ?? ""} />
            </Feld>
          </div>
          <div className="sm:col-span-6">
            <Feld
              id="firma"
              beschriftung="Firma"
              hinweis="Nachname oder Firma ist erforderlich."
            >
              <Eingabe name="firma" defaultValue={kontakt?.firma ?? ""} />
            </Feld>
          </div>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Rollen</KarteTitel>
        </KarteKopf>
        <KarteInhalt>
          <fieldset>
            <legend className="sr-only">Rollen des Kontakts</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2.5">
              {Object.entries(KONTAKTROLLEN).map(([w, b]) => (
                <label
                  key={w}
                  className="flex cursor-pointer items-center gap-2 text-[13px] text-text"
                >
                  <input
                    type="checkbox"
                    name="rollen"
                    value={w}
                    defaultChecked={gewaehlt.has(w)}
                    className="size-4 accent-[var(--f-akzent)]"
                  />
                  {b}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-3 text-[12px] text-gedaempft">
            Eine Person kann mehrere Rollen haben — Eigentümer eines Objekts und
            zugleich Interessent für ein anderes.
          </p>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Kontaktdaten</KarteTitel>
        </KarteKopf>
        <KarteInhalt className="grid gap-5 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <Feld
              id="email"
              beschriftung="E-Mail"
              {...(fehlerZu("email") ? { fehler: fehlerZu("email")! } : {})}
            >
              <Eingabe type="email" name="email" defaultValue={kontakt?.email ?? ""} />
            </Feld>
          </div>
          <div className="sm:col-span-3">
            <Feld id="telefon" beschriftung="Telefon">
              <Eingabe name="telefon" defaultValue={kontakt?.telefon ?? ""} />
            </Feld>
          </div>
          <div className="sm:col-span-4">
            <Feld id="strasse" beschriftung="Straße">
              <Eingabe name="strasse" defaultValue={kontakt?.strasse ?? ""} />
            </Feld>
          </div>
          <div className="sm:col-span-2">
            <Feld id="hausnummer" beschriftung="Hausnummer">
              <Eingabe name="hausnummer" defaultValue={kontakt?.hausnummer ?? ""} />
            </Feld>
          </div>
          <div className="sm:col-span-2">
            <Feld id="plz" beschriftung="Postleitzahl">
              <Eingabe name="plz" inputMode="numeric" defaultValue={kontakt?.plz ?? ""} />
            </Feld>
          </div>
          <div className="sm:col-span-4">
            <Feld id="ort" beschriftung="Ort">
              <Eingabe name="ort" defaultValue={kontakt?.ort ?? ""} />
            </Feld>
          </div>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Weiteres</KarteTitel>
        </KarteKopf>
        <KarteInhalt className="space-y-5">
          <Feld id="notizen" beschriftung="Notizen">
            <Textfeld name="notizen" defaultValue={kontakt?.notizen ?? ""} />
          </Feld>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="einwilligung_werbung"
              defaultChecked={kontakt?.einwilligung_werbung ?? false}
              className="mt-0.5 size-4 accent-[var(--f-akzent)]"
            />
            <span className="text-[13px] text-text">
              Einwilligung in werbliche Ansprache liegt vor
              <span className="mt-0.5 block text-[12px] text-gedaempft">
                Der Zeitpunkt wird für den Nachweis mitgespeichert.
              </span>
            </span>
          </label>
        </KarteInhalt>
      </Karte>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" laedt={laeuft}>
          {kontakt?.id ? "Änderungen speichern" : "Kontakt anlegen"}
        </Button>
        <Link href="/kontakte" className={buttonKlassen({ variante: "sekundaer" })}>
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
