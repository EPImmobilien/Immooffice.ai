import type { Metadata } from "next";

import { Bildmarke, Wortmarke } from "@/components/Marke";
import { ModusSchalter } from "@/components/ModusSchalter";
import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, KiKennzeichen, Marke } from "@/components/ui/Status";

export const metadata: Metadata = {
  title: "Styleguide",
  description: "Design-Tokens und Kernkomponenten von ImmoOffice.ai",
};

const farben = [
  { name: "grund", beschreibung: "Seitenhintergrund" },
  { name: "flaeche", beschreibung: "Karten und Dialoge" },
  { name: "flaeche-gedaempft", beschreibung: "Ruhige Flächen, Tabellenköpfe" },
  { name: "linie", beschreibung: "Trennlinien" },
  { name: "linie-stark", beschreibung: "Feldränder" },
  { name: "text", beschreibung: "Fließtext" },
  { name: "gedaempft", beschreibung: "Sekundärtext, Hilfetexte" },
  { name: "primaer", beschreibung: "Primäraktion" },
  { name: "akzent", beschreibung: "Markenakzent, Hervorhebung" },
  { name: "erfolg", beschreibung: "Bestätigung" },
  { name: "warnung", beschreibung: "Prüfen erforderlich" },
  { name: "fehler", beschreibung: "Fehler, Zerstörendes" },
  { name: "info", beschreibung: "Neutrale Information" },
];

function Abschnitt({
  titel,
  hinweis,
  children,
}: {
  titel: string;
  hinweis?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-20" id={titel.toLowerCase()}>
      <h2 className="font-titel text-lg font-semibold text-text">{titel}</h2>
      {hinweis && (
        <p className="mt-1 max-w-2xl text-[13px] text-gedaempft">{hinweis}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function StyleguideSeite() {
  return (
    <div className="min-h-screen bg-grund">
      <header className="sticky top-0 z-10 border-b border-linie bg-flaeche/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <Wortmarke />
          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-gedaempft sm:inline">
              Styleguide
            </span>
            <ModusSchalter />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-6 py-10">
        <div>
          <h1 className="font-titel text-2xl font-semibold text-text">
            Designsystem
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gedaempft">
            Verbindliche Grundlage für die Oberfläche von ImmoOffice.ai. Farben,
            Radien und Schatten stammen ausschließlich aus den Tokens in{" "}
            <code className="rounded bg-flaeche-gedaempft px-1 py-0.5 text-[12px]">
              globals.css
            </code>
            . Rohe Farbwerte gehören nicht in Komponenten — nur so bleiben
            Dunkelmodus und späteres Mandanten-Branding wartbar.
          </p>
        </div>

        <Abschnitt
          titel="Marke"
          hinweis="Die Bildmarke folgt dem Farbmodus. Die Wortmarke steht in Poppins SemiBold, die Endung .ai trägt den Goldakzent."
        >
          <Karte>
            <KarteInhalt className="flex flex-wrap items-end gap-10">
              <div className="space-y-2">
                <Wortmarke />
                <p className="text-xs text-gedaempft">Sperrung</p>
              </div>
              <div className="flex items-end gap-4">
                <Bildmarke className="size-14" />
                <Bildmarke className="size-9" />
                <Bildmarke className="size-6" />
              </div>
              <div className="rounded-[var(--radius)] bg-[#12203B] px-5 py-4">
                <Bildmarke className="size-9" schluessel="#1B2A47" />
              </div>
            </KarteInhalt>
          </Karte>
        </Abschnitt>

        <Abschnitt
          titel="Farben"
          hinweis="Semantische Tokens. Jeder Wert hat im Hell- und Dunkelmodus eine eigene Entsprechung — die Bedeutung bleibt gleich, der Farbwert ändert sich."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {farben.map((farbe) => (
              <div
                key={farbe.name}
                className="overflow-hidden rounded-[var(--radius)] border border-linie bg-flaeche"
              >
                <div
                  className="h-14 border-b border-linie"
                  style={{ background: `var(--f-${farbe.name})` }}
                />
                <div className="px-3 py-2">
                  <code className="text-[12px] font-medium text-text">
                    {farbe.name}
                  </code>
                  <p className="mt-0.5 text-[11px] leading-tight text-gedaempft">
                    {farbe.beschreibung}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Abschnitt>

        <Abschnitt
          titel="Typografie"
          hinweis="Poppins für Überschriften — sie trägt die Wortmarke. Inter für Fließtext, Formulare und Tabellen. Beide werden selbst ausgeliefert, es gibt keine Anfrage an einen fremden Schrift-Dienst."
        >
          <Karte>
            <KarteInhalt className="space-y-4">
              <div>
                <h1 className="font-titel text-2xl font-semibold">
                  Objekte verwalten
                </h1>
                <p className="mt-1 text-xs text-gedaempft">
                  Poppins SemiBold · 24 px · Seitentitel
                </p>
              </div>
              <div>
                <h2 className="font-titel text-lg font-semibold">
                  Energieausweis
                </h2>
                <p className="mt-1 text-xs text-gedaempft">
                  Poppins SemiBold · 18 px · Abschnitt
                </p>
              </div>
              <div>
                <p className="max-w-2xl text-sm leading-relaxed">
                  Die Wohnung liegt im dritten Obergeschoss eines gepflegten
                  Mehrfamilienhauses und verfügt über einen nach Süden
                  ausgerichteten Balkon.
                </p>
                <p className="mt-1 text-xs text-gedaempft">
                  Inter · 14 px · Fließtext
                </p>
              </div>
              <div>
                <p className="zahl text-sm">349.000,00 € · 78,5 m² · 3 Zimmer</p>
                <p className="mt-1 text-xs text-gedaempft">
                  Inter · Tabellenziffern für Beträge und Flächen
                </p>
              </div>
            </KarteInhalt>
          </Karte>
        </Abschnitt>

        <Abschnitt titel="Schaltflächen">
          <Karte>
            <KarteInhalt className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button>Objekt anlegen</Button>
                <Button variante="sekundaer">Abbrechen</Button>
                <Button variante="leise">Weitere Optionen</Button>
                <Button variante="gefahr">Löschen</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button groesse="klein">Klein</Button>
                <Button groesse="standard">Standard</Button>
                <Button groesse="gross">Groß</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button laedt>Exposé wird erzeugt</Button>
                <Button disabled>Nicht verfügbar</Button>
              </div>
            </KarteInhalt>
          </Karte>
        </Abschnitt>

        <Abschnitt
          titel="Formulare"
          hinweis="Jedes Feld hat eine sichtbare Beschriftung. Platzhalter ersetzen keine Beschriftung, und Fehlermeldungen sind mit dem Feld verknüpft."
        >
          <Karte>
            <KarteInhalt className="grid max-w-2xl gap-5 sm:grid-cols-2">
              <Feld
                id="sg-bezeichnung"
                beschriftung="Objektbezeichnung"
                pflicht
                hinweis="Interne Bezeichnung, erscheint nicht im Exposé."
              >
                <Eingabe placeholder="z. B. ETW Rosenweg 12" />
              </Feld>
              <Feld id="sg-objektart" beschriftung="Objektart" pflicht>
                <Auswahl defaultValue="">
                  <option value="" disabled>
                    Bitte wählen
                  </option>
                  <option>Eigentumswohnung</option>
                  <option>Einfamilienhaus</option>
                  <option>Mehrfamilienhaus</option>
                  <option>Grundstück</option>
                </Auswahl>
              </Feld>
              <Feld
                id="sg-kaufpreis"
                beschriftung="Kaufpreis"
                fehler="Bitte einen Betrag größer als 0 angeben."
              >
                <Eingabe inputMode="decimal" defaultValue="0" />
              </Feld>
              <Feld id="sg-verfuegbar" beschriftung="Verfügbar ab">
                <Eingabe type="date" />
              </Feld>
              <div className="sm:col-span-2">
                <Feld
                  id="sg-lage"
                  beschriftung="Lagebeschreibung"
                  hinweis="Kann per KI vorbereitet und anschließend bearbeitet werden."
                >
                  <Textfeld placeholder="Ruhige Wohnlage am Stadtrand …" />
                </Feld>
              </div>
            </KarteInhalt>
          </Karte>
        </Abschnitt>

        <Abschnitt titel="Zustände">
          <div className="space-y-4">
            <Karte>
              <KarteInhalt className="flex flex-wrap gap-2">
                <Marke>Entwurf</Marke>
                <Marke ton="info">In Vermarktung</Marke>
                <Marke ton="warnung">Reserviert</Marke>
                <Marke ton="erfolg">Verkauft</Marke>
                <Marke ton="fehler">Abgelehnt</Marke>
                <Marke ton="akzent">Alleinauftrag</Marke>
              </KarteInhalt>
            </Karte>

            <Hinweis ton="info" titel="Portalübertragung geplant">
              Das Objekt wird bei der nächsten Übertragung an ImmoScout24 und
              Immowelt übermittelt.
            </Hinweis>
            <Hinweis ton="warnung" titel="Angaben unvollständig">
              Für den OpenImmo-Export fehlen der Energieausweistyp und der
              Endenergiebedarf. Bitte vor der Veröffentlichung ergänzen.
            </Hinweis>
            <Hinweis ton="fehler" titel="Nicht genügend Credits">
              Für die Exposé-Erstellung werden 10 Credits benötigt, verfügbar
              sind 4.
            </Hinweis>
          </div>
        </Abschnitt>

        <Abschnitt
          titel="KI-Kennzeichnung"
          hinweis="Verbindlich für alle KI-erzeugten und KI-bearbeiteten Inhalte. Die Kennzeichnung bleibt in PDF-Exporten und Web-Exposés erhalten und darf nicht abschaltbar sein."
        >
          <Karte>
            <KarteInhalt className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <KiKennzeichen art="erzeugt" />
                <KiKennzeichen art="bearbeitet" />
                <KiKennzeichen art="moebliert" />
              </div>
              <div className="max-w-md overflow-hidden rounded-[var(--radius)] border border-linie">
                <div className="relative flex h-32 items-center justify-center bg-flaeche-gedaempft">
                  <span className="text-xs text-gedaempft">Objektbild</span>
                  <div className="absolute bottom-2 left-2">
                    <KiKennzeichen art="moebliert" />
                  </div>
                </div>
              </div>
              <Hinweis ton="warnung" titel="Angabe nicht belegt">
                Das Baujahr wurde nicht aus den Objektdaten übernommen. Bitte
                prüfen und bestätigen, bevor der Text veröffentlicht wird.
              </Hinweis>
            </KarteInhalt>
          </Karte>
        </Abschnitt>

        <Abschnitt titel="Karten">
          <div className="grid gap-4 sm:grid-cols-2">
            <Karte>
              <KarteKopf>
                <KarteTitel>Aktive Objekte</KarteTitel>
                <KarteBeschreibung>Stand heute, 08:00 Uhr</KarteBeschreibung>
              </KarteKopf>
              <KarteInhalt>
                <p className="zahl font-titel text-3xl font-semibold text-text">
                  24
                </p>
                <p className="mt-1 text-[13px] text-gedaempft">
                  davon 6 reserviert
                </p>
              </KarteInhalt>
            </Karte>
            <Karte>
              <KarteKopf>
                <KarteTitel>Credit-Kontostand</KarteTitel>
                <KarteBeschreibung>
                  Tarif Professional · 3 Benutzer
                </KarteBeschreibung>
              </KarteKopf>
              <KarteInhalt className="flex items-end justify-between">
                <div>
                  <p className="zahl font-titel text-3xl font-semibold text-text">
                    1.240
                  </p>
                  <p className="mt-1 text-[13px] text-gedaempft">
                    von 1.500 im laufenden Monat
                  </p>
                </div>
                <Marke ton="erfolg">Aktiv</Marke>
              </KarteInhalt>
            </Karte>
          </div>
        </Abschnitt>

        <footer className="border-t border-linie pt-6 text-[13px] text-gedaempft">
          Diese Seite ist ein internes Werkzeug und Bestandteil der
          Gate-A-Freigabe. Sie ist nicht Teil der ausgelieferten Anwendung für
          Endkunden.
        </footer>
      </main>
    </div>
  );
}
