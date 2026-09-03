import type { Metadata } from "next";
import Link from "next/link";

import { IntegrationenUebersicht, type IntegrationZeile, type LaufZeile } from "@/components/integrationen/IntegrationenUebersicht";
import { NeueIntegration } from "@/components/integrationen/NeueIntegration";
import { OpenImmoImport } from "@/components/integrationen/OpenImmoImport";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { connectorBeschreibungen } from "@/integrationen/kern/beschreibung";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Integrationen" };

/**
 * Integrationen (docs/AUTONOMIE.md Abschnitt 5).
 *
 * Reihenfolge nach Nutzen: Erst, was ohne Vertrag geht (OpenImmo-Datei),
 * dann die verbundenen Systeme mit ihren Laeufen, dann das Anlegen.
 */
export default async function IntegrationenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "lesen", sitzung.uebersteuerung);
  const darfAendern = hatRecht(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const supabase = await serverClient();
  const [{ data: integrationen }, { data: laeufe }, { data: offeneJobs }] = await Promise.all([
    supabase
      .from("integrationen")
      .select("id, anbieter, bezeichnung, richtung, intervall, status, letzter_sync_am, fehler_text, erstellt_am")
      .order("erstellt_am", { ascending: true }),
    supabase
      .from("sync_laeufe")
      .select("id, integration_id, richtung, ausloeser, status, gestartet_am, beendet_am, angelegt, geaendert, uebersprungen, fehler, konflikte")
      .order("gestartet_am", { ascending: false })
      .limit(30),
    supabase.from("jobs").select("id, nutzlast, status").eq("art", "sync").in("status", ["offen", "laeuft"]),
  ]);

  const laufend = new Set<string>();
  for (const j of offeneJobs ?? []) {
    const n = j.nutzlast as { integration_id?: string } | null;
    if (n?.integration_id) laufend.add(n.integration_id);
  }

  const beschreibungen = connectorBeschreibungen();
  const dienstschluesselFehlt = !process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const verschluesselungFehlt = !process.env["VERSCHLUESSELUNG_SCHLUESSEL"];

  return (
    <>
      <Seitenkopf
        titel="Integrationen"
        beschreibung="Objekte und Kontakte mit anderen Systemen abgleichen — Zugangsdaten bleiben verschlüsselt auf dem Server."
      >
        <Link href="/einstellungen" className="text-[13px] text-akzent hover:underline">
          Zurück zu den Einstellungen
        </Link>
      </Seitenkopf>

      {!darfAendern && (
        <Hinweis ton="warnung" className="mb-5">
          Sie können Integrationen ansehen, aber nicht ändern. Dafür braucht es
          Inhaber- oder Administratorrechte.
        </Hinweis>
      )}

      {(dienstschluesselFehlt || verschluesselungFehlt) && (
        <Hinweis ton="warnung" className="mb-5" titel="Einrichtung unvollständig">
          {verschluesselungFehlt && "Der Verschlüsselungsschlüssel fehlt — Zugangsdaten können nicht gespeichert werden. "}
          {dienstschluesselFehlt && "Der Dienstschlüssel fehlt — Abgleiche werden eingeplant, aber erst ausgeführt, sobald der Arbeiter eingerichtet ist. "}
          Siehe docs/ANLEITUNG.md, Abschnitte 4 und 6.
        </Hinweis>
      )}

      <div className="space-y-5">
        <Karte>
          <KarteKopf>
            <KarteTitel>OpenImmo-Datei übernehmen</KarteTitel>
            <KarteBeschreibung>
              XML oder ZIP mit Bildern, wie es jede Maklersoftware exportiert. Vor
              der Übernahme sehen Sie, was in der Datei steckt und was es schon gibt.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            {darfAendern ? (
              <OpenImmoImport mandantId={sitzung.mandantId} />
            ) : (
              <p className="text-[13px] text-gedaempft">Nur die Verwaltung übernimmt Dateien.</p>
            )}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf>
            <KarteTitel>Verbundene Systeme</KarteTitel>
            <KarteBeschreibung>
              Zustand, letzter Abgleich und die letzten Läufe mit Fehlerliste. Ein
              fehlerhafter Datensatz stoppt keinen Lauf; er steht in der Liste.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <IntegrationenUebersicht
              integrationen={(integrationen ?? []) as unknown as IntegrationZeile[]}
              laeufe={(laeufe ?? []) as unknown as LaufZeile[]}
              laufend={[...laufend]}
              beschreibungen={beschreibungen}
              darfAendern={darfAendern}
            />
          </KarteInhalt>
        </Karte>

        {darfAendern && (
          <Karte>
            <KarteKopf>
              <KarteTitel>System verbinden</KarteTitel>
              <KarteBeschreibung>
                Zugangsdaten stellt Ihr Anbieter aus; sie werden vor dem Speichern
                geprüft und danach nie wieder angezeigt.
              </KarteBeschreibung>
            </KarteKopf>
            <KarteInhalt>
              <NeueIntegration beschreibungen={beschreibungen} />
            </KarteInhalt>
          </Karte>
        )}
      </div>
    </>
  );
}
