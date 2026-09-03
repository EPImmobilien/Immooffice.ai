import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Button } from "@/components/ui/Button";
import { Auswahl, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { TYPEN, type Typ } from "@/lib/verkauf/uebergabe";
import { uebergabeAnlegen } from "@/server/verkauf-aktionen";

export const metadata: Metadata = { title: "Übergabeprotokolle" };

interface Zeile { id: string; bezeichnung: string; kontext: "verkauf" | "vermietung"; typ: Typ; status: "entwurf" | "abgeschlossen"; datum: string | null; erstellt_am: string; objekt: { objektnummer: string; bezeichnung: string } | null }

/** Uebergabeprotokolle fuer Verkauf (Uebergabe/Rueckgabe) und Vermietung (Einzug/Auszug). */
export default async function UebergabenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "lesen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: liste }, { data: objekte }, { data: vertraege }] = await Promise.all([
    supabase.from("uebergabeprotokolle").select("id, bezeichnung, kontext, typ, status, datum, erstellt_am, objekt:objekte(objektnummer, bezeichnung)").order("erstellt_am", { ascending: false }).limit(300),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("vertraege").select("id, titel, art").in("art", ["maklervertrag", "objektnachweis", "mietvertrag"]).order("erstellt_am", { ascending: false }).limit(300),
  ]);
  const zeilen = (liste ?? []) as unknown as Zeile[];
  async function anlegen(formular: FormData) {
    "use server";
    await uebergabeAnlegen({}, formular);
  }

  return (
    <>
      <Seitenkopf titel="Übergabeprotokolle" beschreibung="Schlüssel, Zählerstände, Räume mit Zustand, Unterschriften auf dem Bildschirm — als PDF und Word." />
      {darfAnlegen && (
        <Karte className="mb-5">
          <KarteKopf>
            <KarteTitel>Neues Protokoll</KarteTitel>
            <KarteBeschreibung>Objekt und Vertrag belegen Adresse und Beteiligte vor. Der Assistent führt in sieben Schritten bis zum Abschluss.</KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <form action={anlegen} className="grid gap-3 sm:grid-cols-4">
              <Feld id="neu-kontext" beschriftung="Bereich">
                <Auswahl name="kontext" defaultValue="verkauf"><option value="verkauf">Verkauf</option><option value="vermietung">Vermietung</option></Auswahl>
              </Feld>
              <Feld id="neu-typ" beschriftung="Art">
                <Auswahl name="typ" defaultValue="uebergabe">{(Object.keys(TYPEN) as Typ[]).map((t) => <option key={t} value={t}>{TYPEN[t]}</option>)}</Auswahl>
              </Feld>
              <Feld id="neu-objekt" beschriftung="Objekt">
                <Auswahl name="objekt_id" defaultValue=""><option value="">— ohne —</option>{(objekte ?? []).map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}</Auswahl>
              </Feld>
              <Feld id="neu-vertrag" beschriftung="Vertrag (Beteiligte vorbelegen)">
                <Auswahl name="vertrag_id" defaultValue=""><option value="">— ohne —</option>{(vertraege ?? []).map((v) => <option key={v.id} value={v.id}>{v.titel}</option>)}</Auswahl>
              </Feld>
              <div className="sm:col-span-4"><Button type="submit">Protokoll anlegen</Button></div>
            </form>
            <p className="mt-2 text-[12px] text-gedaempft">Verkauf kennt Übergabe und Rückgabe, Vermietung Einzug und Auszug — Bereich und Art müssen zusammenpassen.</p>
          </KarteInhalt>
        </Karte>
      )}
      {zeilen.length === 0 ? (
        <Hinweis>Noch kein Übergabeprotokoll.</Hinweis>
      ) : (
        <div className="space-y-2">
          {zeilen.map((z) => (
            <Link key={z.id} href={`/uebergaben/${z.id}`} className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4 transition-colors hover:border-akzent/50">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text">{z.bezeichnung}</p>
                <Marke ton={z.status === "abgeschlossen" ? "erfolg" : "neutral"}>{z.status === "abgeschlossen" ? "Abgeschlossen" : "Entwurf"}</Marke>
                <Marke>{TYPEN[z.typ]}</Marke>
              </div>
              <p className="mt-0.5 text-[13px] text-gedaempft">{[z.objekt ? `${z.objekt.objektnummer} ${z.objekt.bezeichnung}` : null, z.datum ? datum(z.datum) : null, `angelegt ${datum(z.erstellt_am)}`].filter(Boolean).join(" · ")}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
