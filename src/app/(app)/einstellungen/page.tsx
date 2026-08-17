import type { Metadata } from "next";

import { Benutzerliste, type BenutzerZeile } from "@/components/einstellungen/Benutzerliste";
import { Erscheinungsbild } from "@/components/einstellungen/Erscheinungsbild";
import { Rechtstexte } from "@/components/einstellungen/Rechtstexte";
import { Stammdaten, type Branding } from "@/components/einstellungen/Stammdaten";
import { Seitenkopf } from "@/components/Seitenkopf";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { supabaseUmgebung } from "@/lib/supabase/umgebung";

export const metadata: Metadata = { title: "Einstellungen" };

/**
 * Einstellungen des Unternehmens.
 *
 * Die Reihenfolge ist nach Wirkung geordnet, nicht nach Vollstaendigkeit: Was
 * in Exposés, PDF und Web-Exposé sichtbar wird, steht oben. Rechtstexte und
 * Benutzer folgen.
 *
 * Lesen darf nur, wer das Modul hat — das sind Inhaber und Administrator.
 * Aendern verlangen zusaetzlich die Policies der Datenbank ausdruecklich von
 * der Verwaltung; die Pruefung hier ist die freundliche Meldung, nicht der
 * Schutz.
 */
export default async function EinstellungenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "lesen");

  const supabase = await serverClient();
  const { url } = supabaseUmgebung();

  const [brandingAntwort, benutzerAntwort] = await Promise.all([
    supabase
      .from("mandant_branding")
      .select(
        "firmenname, strasse, hausnummer, plz, ort, telefon, email, web, " +
          "farbe_primaer, farbe_akzent, logo_pfad, impressum, datenschutztext, widerrufsbelehrung",
      )
      .eq("mandant_id", sitzung.mandantId)
      .maybeSingle(),
    supabase
      .from("benutzer")
      .select("id, name, email, rolle, aktiv, letzter_login_am")
      .order("name", { ascending: true }),
  ]);

  const branding = (brandingAntwort.data ?? null) as unknown as Branding | null;
  const benutzer = (benutzerAntwort.data ?? []) as unknown as BenutzerZeile[];
  const darfAendern = hatRecht(sitzung.rolle, "einstellungen", "aendern");

  // Solange kein Firmenname hinterlegt ist, behilft sich die Anwendung mit dem
  // bei der Registrierung angegebenen Namen. Das funktioniert, sieht aber in
  // einem Exposé nach nichts aus — deshalb der Hinweis nach oben.
  const unvollstaendig = !branding?.firmenname;

  return (
    <>
      <Seitenkopf
        titel="Einstellungen"
        beschreibung={`${sitzung.mandantName} — Unternehmensangaben, Erscheinungsbild, Rechtstexte und Zugänge.`}
      />

      {unvollstaendig && (
        <Hinweis ton="info" className="mb-5">
          Es ist noch kein Firmenname hinterlegt. Solange er fehlt, verwenden
          Exposés, PDF-Ausgaben und Web-Exposés den bei der Registrierung
          angegebenen Namen und die Standardfarben.
        </Hinweis>
      )}

      {!darfAendern && (
        <Hinweis ton="warnung" className="mb-5">
          Sie können die Einstellungen ansehen, aber nicht ändern. Dafür braucht
          es Inhaber- oder Administratorrechte.
        </Hinweis>
      )}

      <div className="space-y-5">
        <Karte>
          <KarteKopf>
            <KarteTitel>Erscheinungsbild</KarteTitel>
            <KarteBeschreibung>
              Die Farben wirken in allen fünf Exposé-Vorlagen, den
              Marketingmotiven und im veröffentlichten Web-Exposé. Das Logo
              erscheint im Kopf der Vorlagen „Klassisch“ und „Kurzexposé“ sowie
              im Web-Exposé; die bildbetonten Vorlagen setzen weiterhin den
              Firmennamen als Wortmarke, weil ein Logo auf dunklem Foto eine
              eigene, helle Fassung braucht.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            {darfAendern ? (
              <Erscheinungsbild
                branding={branding}
                mandantId={sitzung.mandantId}
                supabaseUrl={url}
              />
            ) : (
              <p className="text-[13px] text-gedaempft">
                Hauptfarbe {branding?.farbe_primaer ?? "#1B2A47"}, Akzentfarbe{" "}
                {branding?.farbe_akzent ?? "#B5934F"}.
              </p>
            )}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf>
            <KarteTitel>Unternehmen</KarteTitel>
            <KarteBeschreibung>
              Diese Angaben stehen im Kopf und Fuß jedes Exposés und im
              Fußbereich veröffentlichter Web-Exposés.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            {darfAendern ? (
              <Stammdaten branding={branding} />
            ) : (
              <dl className="space-y-1 text-[13px]">
                <div className="flex justify-between gap-4 border-b border-linie py-2">
                  <dt className="text-gedaempft">Firmenname</dt>
                  <dd className="text-text">{branding?.firmenname ?? "–"}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-gedaempft">E-Mail</dt>
                  <dd className="text-text">{branding?.email ?? "–"}</dd>
                </div>
              </dl>
            )}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf>
            <KarteTitel>Rechtstexte</KarteTitel>
            <KarteBeschreibung>
              Impressum, Datenschutzerklärung und Widerrufsbelehrung. Ihre
              eigenen Angaben — ohne Vorlage und ohne Prüfung durch
              ImmoOffice.ai.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            {darfAendern ? (
              <Rechtstexte branding={branding} />
            ) : (
              <p className="text-[13px] text-gedaempft">
                {branding?.impressum
                  ? "Ein Impressum ist hinterlegt."
                  : "Es ist kein Impressum hinterlegt."}
              </p>
            )}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf>
            <KarteTitel>Zugänge</KarteTitel>
            <KarteBeschreibung>
              Wer im Unternehmen mit welcher Rolle arbeitet. Rechte werden
              serverseitig und in der Datenbank erzwungen — nicht durch
              ausgeblendete Schaltflächen.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            {darfAendern ? (
              <Benutzerliste benutzer={benutzer} eigeneId={sitzung.benutzerId} />
            ) : (
              <p className="text-[13px] text-gedaempft">
                {benutzer.length}{" "}
                {benutzer.length === 1 ? "Zugang" : "Zugänge"} im Unternehmen.
              </p>
            )}
          </KarteInhalt>
        </Karte>
      </div>
    </>
  );
}
