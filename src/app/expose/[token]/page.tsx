import type { Metadata } from "next";
import { cookies } from "next/headers";

import { KiKennzeichen, Marke } from "@/components/ui/Status";
import { BILD_BUCKET } from "@/lib/bilder";
import {
  DOKUMENTARTEN,
  DOKUMENT_BUCKET,
  dateigroesse,
  type Dokumentart,
} from "@/lib/dokumente";
import { euro, flaeche, zahl } from "@/lib/format";
import {
  ENERGIEAUSWEISTYPEN,
  OBJEKTKATEGORIEN,
  istMiete,
} from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";
import { ZUSTAND_TEXT, type WebExposeZustand } from "@/lib/web-expose";
import { passwortCookieName } from "@/server/web-expose-oeffentlich";

import { Kontaktformular } from "./Kontaktformular";
import { PasswortTor } from "./PasswortTor";

export const metadata: Metadata = {
  title: "Exposé",
  // Ein oeffentliches Exposé darf gefunden werden — anders als der angemeldete
  // Bereich, den das Wurzel-Layout auf noindex setzt.
  robots: { index: true, follow: true },
};

interface Bild {
  pfad: string;
  titel: string | null;
  art: string;
  ist_titelbild: boolean;
  ki_bearbeitet: boolean;
  mime: string | null;
}

/**
 * Freigegebene Unterlage.
 *
 * Die Datenbank liefert hier ausschliesslich Unterlagen mit
 * `sichtbarkeit = 'kunde'`, die nicht abgelaufen sind. Vertrauliche Arten wie
 * ein Grundbuchauszug koennen diesen Zustand gar nicht erreichen — das ist als
 * Bedingung in der Tabelle verankert.
 */
interface Unterlage {
  pfad: string;
  dateiname: string;
  art: string;
  titel: string | null;
  bytes: number | null;
  mime: string | null;
}

interface Antwort {
  zustand: WebExposeZustand;
  download_erlaubt?: boolean;
  kontaktformular?: boolean;
  objekt?: Record<string, unknown>;
  anbieter?: Record<string, unknown>;
  bilder?: Bild[];
  unterlagen?: Unterlage[];
}

function textOder(wert: unknown, ersatz = ""): string {
  return typeof wert === "string" && wert !== "" ? wert : ersatz;
}

function zahlOder(wert: unknown): number | null {
  if (typeof wert === "number") return wert;
  if (typeof wert === "string" && wert !== "" && !Number.isNaN(Number(wert))) {
    return Number(wert);
  }
  return null;
}

function Meldung({ text }: { text: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16 text-center">
      <h1 className="text-lg font-semibold text-text">Exposé nicht verfügbar</h1>
      <p className="mt-2 text-[13px] text-gedaempft">{text}</p>
      <p className="mt-6 text-[12px] text-gedaempft">
        Bitte wenden Sie sich an den Anbieter, von dem Sie den Link erhalten
        haben.
      </p>
    </main>
  );
}

function Kennzahl({ bezeichnung, wert }: { bezeichnung: string; wert: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-wide text-gedaempft uppercase">
        {bezeichnung}
      </p>
      <p className="zahl mt-1 text-[17px] font-semibold text-text">{wert}</p>
    </div>
  );
}

function Textabschnitt({
  titel,
  text,
}: {
  titel: string;
  text: string;
}) {
  if (!text) return null;
  return (
    <section className="mt-9">
      <h2 className="text-[13px] font-semibold tracking-wide text-gedaempft uppercase">
        {titel}
      </h2>
      <p className="mt-2 leading-relaxed whitespace-pre-line text-text">{text}</p>
    </section>
  );
}

export default async function WebExposeSeite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!/^[a-z0-9]{16,64}$/.test(token)) {
    return <Meldung text={ZUSTAND_TEXT.unbekannt} />;
  }

  const kekse = await cookies();
  const passwort = kekse.get(await passwortCookieName(token))?.value ?? null;

  const supabase = await serverClient();
  const { data } = await supabase.rpc("web_expose_oeffnen", {
    p_token: token,
    p_passwort: passwort,
    p_zaehlen: true,
  });

  const antwort = (data ?? { zustand: "unbekannt" }) as Antwort;

  if (antwort.zustand === "passwort") return <PasswortTor token={token} />;
  if (antwort.zustand !== "ok") {
    return <Meldung text={ZUSTAND_TEXT[antwort.zustand]} />;
  }

  const objekt = antwort.objekt ?? {};
  const anbieter = antwort.anbieter ?? {};
  const bilder = (antwort.bilder ?? []).filter(
    (b) => b.mime !== "application/pdf",
  );

  // Kurzlebige Verweise. Der Bucket bleibt nicht oeffentlich; die Freigabe
  // haengt an der Storage-Policy und endet mit Widerruf oder Ablauf.
  const verweise = new Map<string, string>();
  if (bilder.length > 0) {
    const { data: signiert } = await supabase.storage
      .from(BILD_BUCKET)
      .createSignedUrls(
        bilder.map((b) => b.pfad),
        60 * 30,
      );
    for (const eintrag of signiert ?? []) {
      if (eintrag.signedUrl && eintrag.path) {
        verweise.set(eintrag.path, eintrag.signedUrl);
      }
    }
  }

  // Dasselbe fuer die freigegebenen Unterlagen, aus einem eigenen Bucket. Die
  // Freigabe haengt am Kennzeichen der einzelnen Unterlage und endet mit
  // Widerruf oder Ablauf des Exposés — auch fuer eine bereits erzeugte Adresse,
  // sobald sie nach dreissig Minuten verfaellt.
  const unterlagen = antwort.unterlagen ?? [];
  const unterlagenVerweise = new Map<string, string>();
  if (unterlagen.length > 0) {
    const { data: signiert } = await supabase.storage
      .from(DOKUMENT_BUCKET)
      .createSignedUrls(
        unterlagen.map((u) => u.pfad),
        60 * 30,
      );
    for (const eintrag of signiert ?? []) {
      if (eintrag.signedUrl && eintrag.path) {
        unterlagenVerweise.set(eintrag.path, eintrag.signedUrl);
      }
    }
  }

  const firmenname = textOder(anbieter["firmenname"], "Der Anbieter");
  const primaer = textOder(anbieter["farbe_primaer"], "#1B2A47");
  const akzent = textOder(anbieter["farbe_akzent"], "#B5934F");

  const miete = istMiete(textOder(objekt["vermarktungsart"], "kauf"));
  const preis = miete
    ? `${euro(zahlOder(objekt["kaltmiete"]))} / Monat`
    : euro(zahlOder(objekt["kaufpreis"]));

  const kategorie =
    textOder(objekt["objektart"]) ||
    OBJEKTKATEGORIEN[
      textOder(objekt["objektkategorie"]) as keyof typeof OBJEKTKATEGORIEN
    ] ||
    "Immobilie";

  const ort =
    objekt["adresse_veroeffentlichen"] === true
      ? [
          [textOder(objekt["strasse"]), textOder(objekt["hausnummer"])]
            .filter(Boolean)
            .join(" "),
          [textOder(objekt["plz"]), textOder(objekt["ort"])]
            .filter(Boolean)
            .join(" "),
        ]
          .filter(Boolean)
          .join(", ")
      : [textOder(objekt["plz"]), textOder(objekt["ort"])]
          .filter(Boolean)
          .join(" ") || "Auf Anfrage";

  const kennzahlen = [
    zahlOder(objekt["wohnflaeche"]) !== null && {
      bezeichnung: "Wohnfläche",
      wert: flaeche(zahlOder(objekt["wohnflaeche"])),
    },
    zahlOder(objekt["nutzflaeche"]) !== null && {
      bezeichnung: "Nutzfläche",
      wert: flaeche(zahlOder(objekt["nutzflaeche"])),
    },
    zahlOder(objekt["grundstuecksflaeche"]) !== null && {
      bezeichnung: "Grundstück",
      wert: flaeche(zahlOder(objekt["grundstuecksflaeche"])),
    },
    zahlOder(objekt["zimmer"]) !== null && {
      bezeichnung: "Zimmer",
      wert: zahl(zahlOder(objekt["zimmer"])),
    },
    zahlOder(objekt["baujahr"]) !== null && {
      bezeichnung: "Baujahr",
      wert: String(zahlOder(objekt["baujahr"])),
    },
  ].filter(Boolean) as { bezeichnung: string; wert: string }[];

  const titelbild = bilder[0];
  const weitere = bilder.slice(1);
  const bildBearbeitet = bilder.some((b) => b.ki_bearbeitet);

  return (
    <div className="min-h-dvh bg-flaeche-gedaempft">
      <header
        className="px-5 py-4 text-white sm:px-8"
        style={{ backgroundColor: primaer }}
      >
        <p className="text-[13px] font-semibold tracking-[0.14em] uppercase">
          {firmenname}
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
        {titelbild && verweise.get(titelbild.pfad) && (
          <div className="relative mt-6 overflow-hidden rounded-[var(--radius-gross)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- signierte, kurzlebige Verweise lassen sich vom Bildoptimierer nicht zwischenspeichern */}
            <img
              src={verweise.get(titelbild.pfad)}
              alt={titelbild.titel ?? "Ansicht des Objekts"}
              className="aspect-[16/10] w-full object-cover"
            />
            {titelbild.ki_bearbeitet && (
              <span className="absolute right-3 bottom-3">
                <KiKennzeichen art="bearbeitet" />
              </span>
            )}
          </div>
        )}

        <div className="mt-7">
          <div className="flex flex-wrap items-center gap-2">
            <Marke ton="akzent">{miete ? "Zu vermieten" : "Zu verkaufen"}</Marke>
            <Marke>{kategorie}</Marke>
          </div>
          <h1 className="mt-3 text-[26px] leading-tight font-semibold text-text sm:text-[32px]">
            {textOder(objekt["titel"]) || textOder(objekt["bezeichnung"], "Immobilie")}
          </h1>
          <p className="mt-1.5 text-[14px] text-gedaempft">{ort}</p>
        </div>

        <div
          className="mt-6 rounded-[var(--radius)] border-l-4 bg-flaeche px-5 py-4"
          style={{ borderLeftColor: akzent }}
        >
          <p className="text-[11px] tracking-wide text-gedaempft uppercase">
            {miete ? "Kaltmiete" : "Kaufpreis"}
          </p>
          <p className="zahl mt-0.5 text-[26px] font-semibold" style={{ color: primaer }}>
            {preis}
          </p>
        </div>

        {kennzahlen.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-5 rounded-[var(--radius)] bg-flaeche p-5 sm:grid-cols-4">
            {kennzahlen.map((k) => (
              <Kennzahl key={k.bezeichnung} {...k} />
            ))}
          </div>
        )}

        <div className="mt-2 rounded-[var(--radius-gross)] bg-flaeche px-5 py-2 sm:px-7">
          <Textabschnitt
            titel="Das Objekt"
            text={textOder(objekt["beschreibung_objekt"])}
          />
          <Textabschnitt
            titel="Ausstattung"
            text={textOder(objekt["beschreibung_ausstattung"])}
          />
          <Textabschnitt titel="Lage" text={textOder(objekt["beschreibung_lage"])} />

          <section className="mt-9 pb-8">
            <h2 className="text-[13px] font-semibold tracking-wide text-gedaempft uppercase">
              Energieausweis
            </h2>
            <dl className="mt-2 space-y-1 text-[14px]">
              <div className="flex justify-between gap-4 border-b border-linie py-1.5">
                <dt className="text-gedaempft">Art</dt>
                <dd className="font-medium text-text">
                  {textOder(objekt["energieausweis_typ"])
                    ? (ENERGIEAUSWEISTYPEN[
                        textOder(
                          objekt["energieausweis_typ"],
                        ) as keyof typeof ENERGIEAUSWEISTYPEN
                      ] ?? "–")
                    : "Liegt nicht vor"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-linie py-1.5">
                <dt className="text-gedaempft">Kennwert</dt>
                <dd className="zahl font-medium text-text">
                  {zahlOder(objekt["energie_kennwert"]) !== null
                    ? `${zahl(zahlOder(objekt["energie_kennwert"]))} kWh/(m²·a)`
                    : "–"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-1.5">
                <dt className="text-gedaempft">Effizienzklasse</dt>
                <dd className="font-medium text-text">
                  {textOder(objekt["energie_klasse"], "–")}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        {weitere.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-gedaempft uppercase">
              Weitere Ansichten
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {weitere.map((bild) => {
                const verweis = verweise.get(bild.pfad);
                if (!verweis) return null;
                return (
                  <figure
                    key={bild.pfad}
                    className="relative overflow-hidden rounded-[var(--radius)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- siehe oben */}
                    <img
                      src={verweis}
                      alt={bild.titel ?? "Weitere Ansicht"}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    {bild.ki_bearbeitet && (
                      <figcaption className="absolute right-2 bottom-2">
                        <KiKennzeichen art="bearbeitet" />
                      </figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          </section>
        )}

        {/* Abschnitt 10 und 11: Die Kennzeichnung bleibt auch hier erhalten. */}
        {(objekt["texte_ki_erzeugt"] === true || bildBearbeitet) && (
          <p className="mt-6 text-[12px] text-gedaempft">
            {objekt["texte_ki_erzeugt"] === true &&
              "Die Beschreibungstexte wurden mit Unterstützung künstlicher Intelligenz erstellt und redaktionell geprüft. "}
            {bildBearbeitet &&
              "Einzelne Bilder wurden digital nachbearbeitet; die bauliche Substanz bleibt davon unberührt."}
          </p>
        )}

        {unterlagen.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-text">Unterlagen</h2>
            <p className="mt-1 mb-4 text-[13px] text-gedaempft">
              Vom Anbieter zur Weitergabe freigegeben.
            </p>
            <ul className="divide-y divide-linie rounded-[var(--radius-gross)] bg-flaeche px-5">
              {unterlagen.map((unterlage) => {
                const verweis = unterlagenVerweise.get(unterlage.pfad);
                if (!verweis) return null;

                return (
                  <li
                    key={unterlage.pfad}
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] text-text">
                        {unterlage.titel ||
                          DOKUMENTARTEN[unterlage.art as Dokumentart] ||
                          unterlage.dateiname}
                      </p>
                      <p className="mt-0.5 text-[12px] text-gedaempft">
                        {DOKUMENTARTEN[unterlage.art as Dokumentart]} ·{" "}
                        {dateigroesse(unterlage.bytes)}
                      </p>
                    </div>
                    <a
                      href={verweis}
                      className="shrink-0 text-[13px] font-medium underline decoration-2 underline-offset-2"
                      style={{ color: primaer, textDecorationColor: akzent }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Herunterladen
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {antwort.download_erlaubt && (
          <a
            href={`/expose/${token}/pdf`}
            className="mt-6 inline-flex items-center rounded-[var(--radius)] px-4 py-2.5 text-[13px] font-medium text-white"
            style={{ backgroundColor: primaer }}
            download
          >
            Exposé als PDF herunterladen
          </a>
        )}

        {antwort.kontaktformular && (
          <section className="mt-8 rounded-[var(--radius-gross)] bg-flaeche p-5 sm:p-7">
            <h2 className="text-lg font-semibold text-text">Interesse geweckt?</h2>
            <p className="mt-1 mb-5 text-[13px] text-gedaempft">
              Schreiben Sie {firmenname} — Sie erhalten zeitnah eine Rückmeldung.
            </p>
            <Kontaktformular token={token} firmenname={firmenname} />
          </section>
        )}
      </main>

      <footer className="border-t border-linie bg-flaeche px-5 py-8 text-[12px] text-gedaempft sm:px-8">
        <div className="mx-auto max-w-3xl space-y-2">
          <p className="font-medium text-text">{firmenname}</p>
          <p>
            {[
              textOder(anbieter["strasse"]),
              [textOder(anbieter["plz"]), textOder(anbieter["ort"])]
                .filter(Boolean)
                .join(" "),
              textOder(anbieter["telefon"]),
              textOder(anbieter["email"]),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p>
            Alle Angaben beruhen auf Informationen des Eigentümers. Eine Haftung
            für Vollständigkeit und Richtigkeit wird nicht übernommen. Irrtum und
            Zwischenverkauf vorbehalten.
          </p>
        </div>
      </footer>
    </div>
  );
}
