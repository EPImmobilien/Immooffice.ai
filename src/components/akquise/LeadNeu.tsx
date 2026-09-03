"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { OBJEKTARTEN, ZEITRAEUME, ZUSTAENDE, type Kampagne, type Pipeline, type Quelle } from "@/lib/akquise/stammdaten";
import { leadAnlegen, leadsImportieren, type AkquiseErgebnis } from "@/server/akquise-aktionen";

const WEGE = [["manuell", "Manuell"], ["kontakt", "Aus Kontakt"], ["objekt", "Aus Objekt"], ["csv", "CSV-Import"]] as const;

export interface KontaktWahl { id: string; name: string }
export interface ObjektWahl { id: string; objektnummer: string; bezeichnung: string }
export interface BenutzerWahl { id: string; name: string }

/** Lead anlegen: manuell, aus Kontakt, aus Objekt oder per CSV (Referenz „Neuer Lead"). */
export function LeadNeu({ pipelines, quellen, kampagnen, kontakte, objekte, benutzer, aktuellerBenutzer }: { pipelines: Pipeline[]; quellen: Quelle[]; kampagnen: Kampagne[]; kontakte: KontaktWahl[]; objekte: ObjektWahl[]; benutzer: BenutzerWahl[]; aktuellerBenutzer: string }) {
  const [weg, setWeg] = useState<(typeof WEGE)[number][0]>("manuell");
  const [erg, aktion, laeuft] = useActionState<AkquiseErgebnis, FormData>(leadAnlegen, {});
  const [imp, importAktion, importiert] = useActionState<AkquiseErgebnis, FormData>(leadsImportieren, {});

  return (
    <Karte>
      <KarteKopf>
        <KarteTitel>Lead anlegen</KarteTitel>
        <KarteBeschreibung>Ein Lead ist eine Immobilie, die verkauft werden könnte — mit Eigentümer, Quelle und Pipeline-Stufe. Objekt und Kontakt belegen die Felder vor.</KarteBeschreibung>
      </KarteKopf>
      <KarteInhalt className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {WEGE.map(([k, b]) => (
            <button key={k} type="button" onClick={() => setWeg(k)} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${weg === k ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{b}</button>
          ))}
        </div>

        {weg === "csv" ? (
          <form action={importAktion} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Feld id="csv-datei" beschriftung="CSV-Datei" hinweis="Kopfzeile mit Straße, PLZ, Ort, Objektart, Wohnfläche, Nachname, E-Mail, Telefon — Trennzeichen ; oder ,">
              <input id="csv-datei" type="file" name="datei" accept=".csv,text/csv" className="block text-[13px]" required />
            </Feld>
            <Feld id="csv-quelle" beschriftung="Quelle"><Auswahl name="quelle_id" defaultValue=""><option value="">— ohne —</option>{quellen.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</Auswahl></Feld>
            <Button type="submit" variante="sekundaer" laedt={importiert}>Importieren</Button>
            {imp.fehler && <Hinweis ton="fehler" className="sm:col-span-3">{imp.fehler}</Hinweis>}
            {imp.erfolg && <Hinweis ton="erfolg" className="sm:col-span-3">{imp.erfolg}{imp.hinweis ? ` — ${imp.hinweis}` : ""}</Hinweis>}
          </form>
        ) : (
          <form action={aktion} className="grid gap-3 sm:grid-cols-6">
            {weg === "kontakt" && (
              <div className="sm:col-span-3"><Feld id="ln-kontakt" beschriftung="Eigentümer aus den Kontakten" pflicht><Auswahl name="kontakt_id" defaultValue="" required><option value="">— wählen —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Auswahl></Feld></div>
            )}
            {weg === "objekt" && (
              <div className="sm:col-span-3"><Feld id="ln-objekt" beschriftung="Objekt aus dem Bestand" pflicht hinweis="Anschrift, Flächen und Eigentümer werden übernommen"><Auswahl name="objekt_id" defaultValue="" required><option value="">— wählen —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}</Auswahl></Feld></div>
            )}
            {weg === "manuell" && (
              <>
                <Feld id="ln-anrede" beschriftung="Anrede"><Auswahl name="anrede" defaultValue=""><option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option></Auswahl></Feld>
                <Feld id="ln-vorname" beschriftung="Vorname"><Eingabe name="vorname" /></Feld>
                <Feld id="ln-nachname" beschriftung="Nachname Eigentümer"><Eingabe name="nachname" /></Feld>
                <Feld id="ln-email" beschriftung="E-Mail"><Eingabe name="email" type="email" /></Feld>
                <Feld id="ln-telefon" beschriftung="Telefon"><Eingabe name="telefon" /></Feld>
                <Feld id="ln-tippgeber" beschriftung="Tippgeber"><Auswahl name="tippgeber_kontakt_id" defaultValue=""><option value="">—</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Auswahl></Feld>
              </>
            )}
            <div className="sm:col-span-2"><Feld id="ln-strasse" beschriftung="Straße"><Eingabe name="strasse" /></Feld></div>
            <Feld id="ln-hausnummer" beschriftung="Nr."><Eingabe name="hausnummer" /></Feld>
            <Feld id="ln-plz" beschriftung="PLZ"><Eingabe name="plz" /></Feld>
            <div className="sm:col-span-2"><Feld id="ln-ort" beschriftung="Ort"><Eingabe name="ort" /></Feld></div>
            <Feld id="ln-objektart" beschriftung="Objektart"><Auswahl name="objektart" defaultValue=""><option value="">—</option>{OBJEKTARTEN.map((o) => <option key={o} value={o}>{o}</option>)}</Auswahl></Feld>
            <Feld id="ln-wohnflaeche" beschriftung="Wohnfläche (m²)"><Eingabe name="wohnflaeche" inputMode="decimal" /></Feld>
            <Feld id="ln-grundstueck" beschriftung="Grundstück (m²)"><Eingabe name="grundstueck" inputMode="decimal" /></Feld>
            <Feld id="ln-baujahr" beschriftung="Baujahr"><Eingabe name="baujahr" inputMode="numeric" /></Feld>
            <Feld id="ln-zustand" beschriftung="Zustand"><Auswahl name="zustand" defaultValue=""><option value="">—</option>{Object.entries(ZUSTAENDE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
            <Feld id="ln-zeitraum" beschriftung="Verkaufszeitraum"><Auswahl name="verkaufszeitraum" defaultValue=""><option value="">—</option>{ZEITRAEUME.map((z) => <option key={z} value={z}>{z}</option>)}</Auswahl></Feld>
            <div className="sm:col-span-2"><Feld id="ln-quelle" beschriftung="Quelle"><Auswahl name="quelle_id" defaultValue=""><option value="">— ohne —</option>{quellen.filter((q) => q.aktiv).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</Auswahl></Feld></div>
            <div className="sm:col-span-2"><Feld id="ln-kampagne" beschriftung="Kampagne"><Auswahl name="kampagne_id" defaultValue=""><option value="">— ohne —</option>{kampagnen.filter((k) => k.aktiv).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Auswahl></Feld></div>
            <Feld id="ln-pipeline" beschriftung="Pipeline" hinweis="Leer = Vorgabe der Quelle"><Auswahl name="pipeline_id" defaultValue=""><option value="">— Standard —</option>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Auswahl></Feld>
            <Feld id="ln-zustaendig" beschriftung="Zuständig"><Auswahl name="zustaendig_id" defaultValue={aktuellerBenutzer}>{benutzer.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Auswahl></Feld>
            <div className="sm:col-span-4"><Feld id="ln-titel" beschriftung="Titel" hinweis="Leer = aus Objektart und Anschrift"><Eingabe name="titel" /></Feld></div>
            <Feld id="ln-nachfassen" beschriftung="Nachfassen"><Auswahl name="nachfassen" defaultValue="1"><option value="1">ja, erinnern</option><option value="0">nein</option></Auswahl></Feld>
            <Feld id="ln-nachfassen-am" beschriftung="Nachfassen am" hinweis="Leer = Vorgabe"><Eingabe name="nachfassen_am" type="date" /></Feld>
            <div className="sm:col-span-6"><Feld id="ln-notiz" beschriftung="Notiz"><Textfeld name="notiz" rows={2} /></Feld></div>
            {erg.fehler && <Hinweis ton="fehler" className="sm:col-span-6">{erg.fehler}</Hinweis>}
            <div className="sm:col-span-6"><Button type="submit" laedt={laeuft}>Lead anlegen</Button></div>
          </form>
        )}
      </KarteInhalt>
    </Karte>
  );
}
