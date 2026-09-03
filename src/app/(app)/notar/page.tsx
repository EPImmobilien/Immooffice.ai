import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { STATUS, type LaufzettelStatus } from "@/lib/verkauf/laufzettel";
import { laufzettelAnlegen } from "@/server/verkauf-aktionen";

export const metadata: Metadata = { title: "Notar-Laufzettel" };

interface Zeile { id: string; bezeichnung: string; status: LaufzettelStatus; erstellt_am: string; versendet_am: string | null; objekt: { objektnummer: string; bezeichnung: string } | null }
const TON: Record<LaufzettelStatus, "neutral" | "info" | "warnung" | "erfolg"> = { entwurf: "neutral", bereit: "info", versendet: "warnung", abgeschlossen: "erfolg" };

/** Kaufabwicklung: Notar-Laufzettel je Verkauf (docs/FUNKTIONSABGLEICH.md V2). */
export default async function NotarSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "lesen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: liste }, { data: objekte }, { data: vertraege }, { data: nachweise }] = await Promise.all([
    supabase.from("notar_laufzettel").select("id, bezeichnung, status, erstellt_am, versendet_am, objekt:objekte(objektnummer, bezeichnung)").order("erstellt_am", { ascending: false }).limit(300),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("vertraege").select("id, titel").eq("art", "maklervertrag").order("erstellt_am", { ascending: false }).limit(300),
    supabase.from("vertraege").select("id, titel").eq("art", "objektnachweis").order("erstellt_am", { ascending: false }).limit(300),
  ]);
  const zeilen = (liste ?? []) as unknown as Zeile[];
  async function anlegen(formular: FormData) {
    "use server";
    await laufzettelAnlegen({}, formular);
  }

  return (
    <>
      <Seitenkopf titel="Notar-Laufzettel" beschreibung="Alles, was das Notariat für den Kaufvertragsentwurf braucht — in acht Schritten, mit Anhängen, Begleitschreiben, PDF und Word." />
      {darfAnlegen && (
        <Karte className="mb-5">
          <KarteKopf>
            <KarteTitel>Neuer Laufzettel</KarteTitel>
            <KarteBeschreibung>Maklervertrag belegt Verkäufer und Preis vor, Objektnachweis die Käufer. Beides lässt sich später ändern.</KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <form action={anlegen} className="grid gap-3 sm:grid-cols-4">
              <Feld id="lz-neu-bez" beschriftung="Bezeichnung"><Eingabe name="bezeichnung" placeholder="Laufzettel Lindenallee 12" /></Feld>
              <Feld id="lz-neu-objekt" beschriftung="Objekt">
                <Auswahl name="objekt_id" defaultValue=""><option value="">— ohne —</option>{(objekte ?? []).map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}</Auswahl>
              </Feld>
              <Feld id="lz-neu-vertrag" beschriftung="Maklervertrag (Verkäufer)">
                <Auswahl name="vertrag_id" defaultValue=""><option value="">— ohne —</option>{(vertraege ?? []).map((v) => <option key={v.id} value={v.id}>{v.titel}</option>)}</Auswahl>
              </Feld>
              <Feld id="lz-neu-nachweis" beschriftung="Objektnachweis (Käufer)">
                <Auswahl name="objektnachweis_id" defaultValue=""><option value="">— ohne —</option>{(nachweise ?? []).map((v) => <option key={v.id} value={v.id}>{v.titel}</option>)}</Auswahl>
              </Feld>
              <div className="sm:col-span-4"><Button type="submit">Laufzettel anlegen</Button></div>
            </form>
          </KarteInhalt>
        </Karte>
      )}
      {zeilen.length === 0 ? (
        <Hinweis>Noch kein Laufzettel.</Hinweis>
      ) : (
        <div className="space-y-2">
          {zeilen.map((z) => (
            <Link key={z.id} href={`/notar/${z.id}`} className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4 transition-colors hover:border-akzent/50">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text">{z.bezeichnung}</p>
                <Marke ton={TON[z.status]}>{STATUS[z.status]}</Marke>
              </div>
              <p className="mt-0.5 text-[13px] text-gedaempft">{[z.objekt ? `${z.objekt.objektnummer} ${z.objekt.bezeichnung}` : null, z.versendet_am ? `versendet ${datum(z.versendet_am)}` : null, `angelegt ${datum(z.erstellt_am)}`].filter(Boolean).join(" · ")}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
