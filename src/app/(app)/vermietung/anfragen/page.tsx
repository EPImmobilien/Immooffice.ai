import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { AnfragenWerkzeuge } from "@/components/vermietung/AnfragenWerkzeuge";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { ANFRAGE_QUELLEN, ANFRAGE_STATUS, anfrageName, STANDARD_VORLAGEN, type AnfrageQuelle, type AnfrageStatus, type Antwortvorlage } from "@/lib/vermietung/anfragen";
import { anfrageAnlegen } from "@/server/vermietung-aktionen";

export const metadata: Metadata = { title: "Mietanfragen" };

interface Zeile { id: string; anrede: string | null; vorname: string | null; nachname: string; email: string | null; quelle: AnfrageQuelle; status: AnfrageStatus; bewertung: number | null; eingegangen_am: string; besichtigung_am: string | null; objekt: { objektnummer: string; bezeichnung: string } | null }
const TON: Record<AnfrageStatus, "neutral" | "info" | "warnung" | "erfolg" | "fehler"> = { neu: "info", in_pruefung: "neutral", besichtigung_geplant: "warnung", besichtigung_erfolgt: "neutral", unterlagen_angefordert: "warnung", zusage: "erfolg", absage: "fehler", vertrag: "erfolg" };

export default async function AnfragenSeite({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "kontakte", "lesen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "kontakte", "anlegen", sitzung.uebersteuerung);
  const istVerwaltung = hatRecht(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);
  const supabase = await serverClient();
  let abfrage = supabase.from("mietanfragen").select("id, anrede, vorname, nachname, email, quelle, status, bewertung, eingegangen_am, besichtigung_am, objekt:objekte(objektnummer, bezeichnung)").order("eingegangen_am", { ascending: false }).limit(300);
  if (p.status && p.status in ANFRAGE_STATUS) abfrage = abfrage.eq("status", p.status);
  const [{ data: liste }, { data: objekte }, { data: links }, { data: vorlagen }] = await Promise.all([
    abfrage,
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).eq("vermarktungsart", "miete").order("objektnummer").limit(300),
    supabase.from("selbstauskunft_links").select("id, bezeichnung, token, aktiv, objekt_id, objekt:objekte(objektnummer)").order("erstellt_am", { ascending: false }),
    supabase.from("antwortvorlagen").select("schluessel, bezeichnung, betreff, text, mit_termin"),
  ]);
  const zeilen = (liste ?? []) as unknown as Zeile[];
  const basis = (process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");
  async function anlegen(formular: FormData) {
    "use server";
    await anfrageAnlegen({}, formular);
  }

  return (
    <>
      <Seitenkopf titel="Mietanfragen" beschreibung="Anfragen aus Portalen, Web-Exposé und Selbstauskunft — bewerten, beantworten, in den Mietvertrag überführen.">
        <Link href="/vermietung" className="text-[13px] text-akzent hover:underline">Zur Vermietung</Link>
      </Seitenkopf>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/vermietung/anfragen" className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${!p.status ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>Alle</Link>
        {(Object.keys(ANFRAGE_STATUS) as AnfrageStatus[]).map((s) => (
          <Link key={s} href={`/vermietung/anfragen?status=${s}`} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${p.status === s ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{ANFRAGE_STATUS[s]}</Link>
        ))}
      </div>

      {darfAnlegen && (
        <Karte className="mb-5">
          <KarteKopf>
            <KarteTitel>Anfrage erfassen</KarteTitel>
            <KarteBeschreibung>Telefonische oder persönliche Anfragen. E-Mails übernehmen Sie im Postfach mit „Als Mietanfrage übernehmen“.</KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <form action={anlegen} className="grid gap-3 sm:grid-cols-5">
              <Feld id="na-anrede" beschriftung="Anrede"><Auswahl name="anrede" defaultValue=""><option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option><option value="Familie">Familie</option></Auswahl></Feld>
              <Feld id="na-vorname" beschriftung="Vorname"><Eingabe name="vorname" /></Feld>
              <Feld id="na-nachname" beschriftung="Nachname" pflicht><Eingabe name="nachname" required /></Feld>
              <Feld id="na-email" beschriftung="E-Mail"><Eingabe name="email" type="email" /></Feld>
              <Feld id="na-telefon" beschriftung="Telefon"><Eingabe name="telefon" /></Feld>
              <div className="sm:col-span-3"><Feld id="na-objekt" beschriftung="Mietobjekt"><Auswahl name="objekt_id" defaultValue=""><option value="">— ohne —</option>{(objekte ?? []).map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}</Auswahl></Feld></div>
              <Feld id="na-einzug" beschriftung="Einzug ab"><Eingabe name="einzug_ab" type="date" /></Feld>
              <div className="flex items-end"><Button type="submit">Anlegen</Button></div>
            </form>
          </KarteInhalt>
        </Karte>
      )}

      {zeilen.length === 0 ? (
        <Hinweis>Keine Anfragen{p.status ? ` mit Status „${ANFRAGE_STATUS[p.status as AnfrageStatus]}“` : ""}.</Hinweis>
      ) : (
        <div className="space-y-2">
          {zeilen.map((z) => (
            <Link key={z.id} href={`/vermietung/anfragen/${z.id}`} className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4 transition-colors hover:border-akzent/50">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text">{anfrageName(z) || z.email || "Ohne Namen"}</p>
                <Marke ton={TON[z.status]}>{ANFRAGE_STATUS[z.status]}</Marke>
                <Marke>{ANFRAGE_QUELLEN[z.quelle]}</Marke>
                {z.bewertung && <Marke ton="akzent">{"★".repeat(z.bewertung)}</Marke>}
              </div>
              <p className="mt-0.5 text-[13px] text-gedaempft">{[z.objekt ? `${z.objekt.objektnummer} ${z.objekt.bezeichnung}` : "ohne Objekt", `eingegangen ${datum(z.eingegangen_am)}`, z.besichtigung_am ? `Besichtigung ${datum(z.besichtigung_am)}` : null].filter(Boolean).join(" · ")}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8">
        <AnfragenWerkzeuge
          objekte={(objekte ?? []) as { id: string; objektnummer: string; bezeichnung: string }[]}
          links={((links ?? []) as unknown as Array<{ id: string; bezeichnung: string; token: string; aktiv: boolean; objekt_id: string | null; objekt: { objektnummer: string } | null }>).map((l) => ({ id: l.id, bezeichnung: l.bezeichnung, url: `${basis}/selbstauskunft/${l.token}`, aktiv: l.aktiv, objekt: l.objekt?.objektnummer ?? null }))}
          vorlagen={STANDARD_VORLAGEN.map((v) => ((vorlagen ?? []) as Antwortvorlage[]).find((e) => e.schluessel === v.schluessel) ?? v)}
          darfAnlegen={darfAnlegen}
          istVerwaltung={istVerwaltung}
        />
      </div>
    </>
  );
}
