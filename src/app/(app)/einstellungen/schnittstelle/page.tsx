import type { Metadata } from "next";
import Link from "next/link";

import { RueckrufZiele } from "@/components/schnittstelle/RueckrufZiele";
import { SchluesselVerwaltung } from "@/components/schnittstelle/SchluesselVerwaltung";
import type { RueckrufZeile, SchluesselZeile, ZielZeile } from "@/components/schnittstelle/typen";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { rechteParsen } from "@/lib/schnittstelle/schluessel";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Schnittstelle" };

function basisUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Eigene Schnittstelle (docs/AUTONOMIE.md 5.4): Schluessel je Anbindung,
 * Rueckrufziele, Zustellprotokoll. Nur fuer die Verwaltung.
 */
export default async function SchnittstelleSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "lesen", sitzung.uebersteuerung);
  const darfAendern = hatRecht(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const supabase = await serverClient();
  const [{ data: schluesselRoh }, { data: zieleRoh }, { data: rueckrufeRoh }] = await Promise.all([
    supabase
      .from("api_schluessel")
      .select("id, bezeichnung, praefix, rechte, ratenlimit_pro_minute, erstellt_am, zuletzt_verwendet_am, widerrufen_am")
      .order("erstellt_am", { ascending: false }),
    supabase
      .from("rueckruf_ziele")
      .select("id, bezeichnung, url, ereignisse, aktiv, fehler_zaehler, letzter_fehler, erstellt_am")
      .order("erstellt_am", { ascending: true }),
    supabase
      .from("rueckrufe")
      .select("id, ziel_id, ereignis, status, versuche, naechster_versuch_am, antwort_status, fehler_text, erstellt_am, zugestellt_am")
      .order("erstellt_am", { ascending: false })
      .limit(80),
  ]);
  const schluessel = ((schluesselRoh ?? []) as Array<Omit<SchluesselZeile, "rechte"> & { rechte: unknown }>).map((z) => ({ ...z, rechte: rechteParsen(z.rechte) }));
  const ziele = (zieleRoh ?? []) as ZielZeile[];
  const rueckrufe = (rueckrufeRoh ?? []) as RueckrufZeile[];
  const basis = basisUrl();

  return (
    <>
      <Seitenkopf titel="Schnittstelle" beschreibung="Fremde Systeme lesen und schreiben Objekte, Kontakte und Termine — mit eigenem Schlüssel je Anbindung und signierten Rückrufen.">
        <Link href="/einstellungen" className="text-[13px] text-akzent hover:underline">Zurück zu den Einstellungen</Link>
      </Seitenkopf>

      {!darfAendern && (
        <Hinweis ton="warnung" className="mb-5">Sie können die Schnittstelle ansehen, aber nicht ändern. Dafür braucht es Inhaber- oder Administratorrechte.</Hinweis>
      )}

      <div className="space-y-5">
        <Karte>
          <KarteKopf>
            <KarteTitel>Zugang</KarteTitel>
            <KarteBeschreibung>
              Basisadresse <code className="font-mono text-[12px]">{basis}/api/v1</code> · Beschreibung als OpenAPI unter{" "}
              <a href="/api/v1/openapi.json" className="text-akzent hover:underline">/api/v1/openapi.json</a>.
              Jede Anfrage trägt <code className="font-mono text-[12px]">Authorization: Bearer io_…</code>. Bis zu 600 Anfragen je Minute und Schlüssel,
              je Schlüssel einstellbar; im Lesemodus des Unternehmens sind nur Leseanfragen möglich.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <pre className="overflow-x-auto rounded-[var(--radius)] bg-grund p-3 font-mono text-[12px] text-text">{`curl -H "Authorization: Bearer io_…" \\
  "${basis}/api/v1/objekte?seite=1&groesse=50"`}</pre>
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf>
            <KarteTitel>Schlüssel</KarteTitel>
            <KarteBeschreibung>
              Ein Schlüssel je angebundenem System. Gespeichert wird nur ein Hash — ein verlorener Schlüssel wird widerrufen und neu angelegt.
              Rechte gelten je Bereich: kein Zugriff, nur lesen, lesen und schreiben.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            {darfAendern ? (
              <SchluesselVerwaltung schluessel={schluessel} />
            ) : (
              <p className="text-[13px] text-gedaempft">{schluessel.filter((s) => !s.widerrufen_am).length} aktive Schlüssel.</p>
            )}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf>
            <KarteTitel>Rückrufe</KarteTitel>
            <KarteBeschreibung>
              Bei neuen Objekten, Kontakten und Terminen ruft ImmoOffice.ai die hinterlegte Adresse auf. Jede Lieferung ist im Kopf{" "}
              <code className="font-mono text-[12px]">X-ImmoOffice-Signatur</code> mit HMAC-SHA256 über <code className="font-mono text-[12px]">{"<zeit>.<körper>"}</code> signiert.
              Scheitert die Zustellung, wird sie mit wachsendem Abstand bis zu acht Mal wiederholt.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            {darfAendern ? (
              <RueckrufZiele ziele={ziele} rueckrufe={rueckrufe} verschluesselungFehlt={!process.env["VERSCHLUESSELUNG_SCHLUESSEL"]} />
            ) : (
              <p className="text-[13px] text-gedaempft">{ziele.length} Rückrufziele.</p>
            )}
          </KarteInhalt>
        </Karte>
      </div>
    </>
  );
}
