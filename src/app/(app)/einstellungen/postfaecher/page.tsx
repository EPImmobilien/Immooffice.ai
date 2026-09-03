import type { Metadata } from "next";
import Link from "next/link";

import { PostfachKarte } from "@/components/postfach/PostfachKarte";
import { PostfachVerbinden } from "@/components/postfach/PostfachVerbinden";
import type { BenutzerKurz, FreigabeZeile, PostfachZeile } from "@/components/postfach/typen";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { oauthVerfuegbar } from "@/lib/postfach/oauth";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Postfächer" };

const FELDER = "id, adresse, anzeigename, anbieter, status, benutzer_id, intervall_minuten, signatur_anhaengen, letzter_abruf_am, fehler_text, fehler_zaehler";

/**
 * Postfaecher verwalten (docs/AUTONOMIE.md P1, P2, P7): verbinden, freigeben,
 * Abrufabstand und Signatur einstellen, trennen.
 */
export default async function PostfaecherSeite({ searchParams }: { searchParams: Promise<{ fehler?: string; verbunden?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "postfach", "lesen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "postfach", "anlegen", sitzung.uebersteuerung);
  const istVerwaltung = hatRecht(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const supabase = await serverClient();
  const [{ data: postfaecherRoh }, { data: freigabenRoh }, { data: benutzerRoh }] = await Promise.all([
    supabase.from("postfaecher").select(FELDER).order("erstellt_am", { ascending: true }),
    supabase.from("postfach_freigaben").select("postfach_id, benutzer_id, darf_senden"),
    istVerwaltung ? supabase.from("benutzer").select("id, name, email").eq("aktiv", true).order("name") : Promise.resolve({ data: [] }),
  ]);
  const postfaecher = (postfaecherRoh ?? []) as PostfachZeile[];
  const freigaben = (freigabenRoh ?? []) as FreigabeZeile[];
  const benutzer = ((benutzerRoh ?? []) as BenutzerKurz[]).filter((b) => b.id !== sitzung.benutzerId);

  return (
    <>
      <Seitenkopf titel="Postfächer" beschreibung="Eingang lesen, zuordnen und antworten — Ordner, Regeln und Signaturen bleiben beim Anbieter.">
        <Link href="/einstellungen" className="text-[13px] text-akzent hover:underline">Zurück zu den Einstellungen</Link>
      </Seitenkopf>

      {p.fehler && <Hinweis ton="fehler" className="mb-5">{p.fehler}</Hinweis>}
      {p.verbunden === "1" && <Hinweis ton="erfolg" className="mb-5">Postfach verbunden. Der erste Abruf läuft.</Hinweis>}

      <div className="space-y-5">
        {darfAnlegen && (
          <Karte>
            <KarteKopf>
              <KarteTitel>Postfach verbinden</KarteTitel>
              <KarteBeschreibung>
                Gespeichert werden nur Kopfdaten und Text der Nachrichten, Anhänge erst bei Übernahme in die Unterlagen.
                Zugangsdaten liegen verschlüsselt und sind nach dem Speichern nicht mehr abrufbar.
              </KarteBeschreibung>
            </KarteKopf>
            <KarteInhalt>
              <PostfachVerbinden
                microsoft={oauthVerfuegbar("microsoft")}
                google={oauthVerfuegbar("google")}
                darfUnternehmen={istVerwaltung}
                verschluesselungFehlt={!process.env["VERSCHLUESSELUNG_SCHLUESSEL"]}
              />
            </KarteInhalt>
          </Karte>
        )}

        {postfaecher.length === 0 ? (
          <Hinweis>Noch kein Postfach verbunden.</Hinweis>
        ) : (
          postfaecher.map((pf) => (
            <PostfachKarte
              key={pf.id}
              postfach={pf}
              freigaben={freigaben.filter((f) => f.postfach_id === pf.id)}
              benutzer={benutzer}
              istVerwaltung={istVerwaltung}
              eigenes={pf.benutzer_id === sitzung.benutzerId}
            />
          ))
        )}

        <p className="text-[12px] text-gedaempft">
          Aufbewahrung gespiegelter Inhalte: 24 Monate, danach bleibt nur die Verknüpfung (Betreff, Datum, Kontakt, Objekt).
          Die Frist ist je Unternehmen einstellbar — bis zum Plattform-Admin über den Support.
        </p>
      </div>
    </>
  );
}
