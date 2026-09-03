"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { euro } from "@/lib/format";
import { fehlendeAngaben, gesamtmiete, kautionVorschlag, leerePerson, PARTEITYPEN, STATUS, type MietPerson, type MietvertragDaten, type MietvertragStatus, type Partei, type Parteityp } from "@/lib/vermietung/mietvertrag";
import { mietvertragLoeschen, mietvertragSpeichern, mietvertragStatus, mietvertragZurUnterschrift, type VermietungErgebnis } from "@/server/vermietung-aktionen";

/**
 * Wohnraummietvertrag (docs/FUNKTIONSABGLEICH.md M1): Vermieter, Mieter,
 * Mietobjekt, Miete und Kaution, Kuendigungsausschluss, Neubau-Klausel,
 * Bankverbindung. Alle Werte sind editierbar, solange der Vertrag Entwurf ist;
 * der erzeugte Text wird als Vertrag unterschrieben.
 */
export function MietvertragFormular({ id, start, status, vertragId, darfAendern, darfFreigeben, darfLoeschen }: { id: string; start: MietvertragDaten; status: MietvertragStatus; vertragId: string | null; darfAendern: boolean; darfFreigeben: boolean; darfLoeschen: boolean }) {
  const [d, setD] = useState<MietvertragDaten>(start);
  const [speichern, speichernAktion, speichert] = useActionState<VermietungErgebnis, FormData>(mietvertragSpeichern, {});
  const [unterschrift, unterschriftAktion, bereitet] = useActionState<VermietungErgebnis, FormData>(mietvertragZurUnterschrift, {});
  const [statusErg, statusAktion, wechselt] = useActionState<VermietungErgebnis, FormData>(mietvertragStatus, {});
  const gesperrt = status !== "entwurf" || !darfAendern;
  const fehlt = fehlendeAngaben(d);
  const kautionMax = kautionVorschlag(d.grundmiete);

  const setzen = <K extends keyof MietvertragDaten>(k: K, v: MietvertragDaten[K]) => setD((alt) => ({ ...alt, [k]: v }));
  const objekt = (p: Partial<MietvertragDaten["objekt"]>) => setD((alt) => ({ ...alt, objekt: { ...alt.objekt, ...p } }));
  const bank = (p: Partial<MietvertragDaten["bank"]>) => setD((alt) => ({ ...alt, bank: { ...alt.bank, ...p } }));

  return (
    <div className="space-y-5">
      <form action={speichernAktion} className="space-y-5">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="daten" value={JSON.stringify(d)} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Feld id="mv-bez" beschriftung="Bezeichnung" hinweis="Wird beim Erzeugen des Vertragstexts aus Mieter und Objekt gebildet, wenn leer">
            <Eingabe value={d.bezeichnung} readOnly={gesperrt} onChange={(e) => setzen("bezeichnung", e.target.value)} />
          </Feld>
          <Feld id="mv-ordner" beschriftung="Ordner / Ablage">
            <Eingabe value={d.ordner} readOnly={gesperrt} placeholder="z. B. Musterstraße 1, WE 3" onChange={(e) => setzen("ordner", e.target.value)} />
          </Feld>
        </div>

        <ParteiBlock kennung="vm" titel="Vermieter" beschreibung="Eigentümer laut Objektakte werden vorbelegt." partei={d.vermieter} gesperrt={gesperrt} aendern={(p) => setzen("vermieter", p)} />
        <ParteiBlock kennung="mi" titel="Mieter" beschreibung="Bei Eheleuten oder mehreren Personen haften alle gesamtschuldnerisch." partei={d.mieter} gesperrt={gesperrt} aendern={(p) => setzen("mieter", p)} />

        <Karte>
          <KarteKopf><KarteTitel>Mietobjekt</KarteTitel></KarteKopf>
          <KarteInhalt className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><Feld id="mo-strasse" beschriftung="Straße, Hausnummer" pflicht><Eingabe value={d.objekt.strasse} readOnly={gesperrt} onChange={(e) => objekt({ strasse: e.target.value })} /></Feld></div>
            <Feld id="mo-plz" beschriftung="PLZ" pflicht><Eingabe value={d.objekt.plz} readOnly={gesperrt} onChange={(e) => objekt({ plz: e.target.value })} /></Feld>
            <Feld id="mo-ort" beschriftung="Ort" pflicht><Eingabe value={d.objekt.ort} readOnly={gesperrt} onChange={(e) => objekt({ ort: e.target.value })} /></Feld>
            <Feld id="mo-lage" beschriftung="Lage im Haus" pflicht><Eingabe value={d.objekt.lage} readOnly={gesperrt} placeholder="2. OG links" onChange={(e) => objekt({ lage: e.target.value })} /></Feld>
            <div className="sm:col-span-2"><Feld id="mo-raeume" beschriftung="Räume" pflicht><Eingabe value={d.objekt.raeume} readOnly={gesperrt} placeholder="3 Zimmer, Küche, Bad, Flur" onChange={(e) => objekt({ raeume: e.target.value })} /></Feld></div>
            <Feld id="mo-flaeche" beschriftung="Wohnfläche (m²)" pflicht><Eingabe value={d.objekt.wohnflaeche} readOnly={gesperrt} inputMode="decimal" onChange={(e) => objekt({ wohnflaeche: e.target.value })} /></Feld>
            <div className="sm:col-span-2"><Feld id="mo-neben" beschriftung="Mitvermietete Nebenräume"><Eingabe value={d.objekt.nebenraeume} readOnly={gesperrt} placeholder="Kellerabteil Nr. 4, Stellplatz 7" onChange={(e) => objekt({ nebenraeume: e.target.value })} /></Feld></div>
            <div className="sm:col-span-2"><Feld id="mo-zustand" beschriftung="Zustand bei Übergabe"><Eingabe value={d.objekt.zustand} readOnly={gesperrt} placeholder="renoviert, Erstbezug nach Sanierung" onChange={(e) => objekt({ zustand: e.target.value })} /></Feld></div>
            <div className="sm:col-span-4"><Feld id="mo-ausstattung" beschriftung="Ausstattung"><Textfeld value={d.objekt.ausstattung} readOnly={gesperrt} rows={2} placeholder="Einbauküche, Parkett, Fußbodenheizung …" onChange={(e) => objekt({ ausstattung: e.target.value })} /></Feld></div>
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf><KarteTitel>Mietzeit, Miete und Kaution</KarteTitel><KarteBeschreibung>Die Kaution darf drei Grundmieten nicht übersteigen (§ 551 BGB); Vorschlag: {euro(kautionMax)}.</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="grid gap-3 sm:grid-cols-4">
            <Feld id="mz-beginn" beschriftung="Mietbeginn" pflicht><Eingabe type="date" value={d.mietbeginn} readOnly={gesperrt} onChange={(e) => setzen("mietbeginn", e.target.value)} /></Feld>
            <Feld id="mz-bis" beschriftung="Befristet bis" hinweis="Leer = unbefristet"><Eingabe type="date" value={d.befristet_bis} readOnly={gesperrt} onChange={(e) => setzen("befristet_bis", e.target.value)} /></Feld>
            <Feld id="mz-ka" beschriftung="Kündigungsausschluss (Monate)" hinweis="0 = keiner, höchstens 48"><Eingabe type="number" min={0} max={48} value={d.kuendigungsausschluss_monate} readOnly={gesperrt} onChange={(e) => setzen("kuendigungsausschluss_monate", Math.max(0, Math.min(48, Number(e.target.value) || 0)))} /></Feld>
            <Feld id="mz-neubau" beschriftung="Neubau-Klausel (§ 7)">
              <Auswahl value={d.neubau_klausel ? "ja" : "nein"} disabled={gesperrt} onChange={(e) => setzen("neubau_klausel", e.target.value === "ja")}><option value="nein">nein</option><option value="ja">ja — Fertigstellungsvorbehalt</option></Auswahl>
            </Feld>
            <Zahl kennung="mz-grund" beschriftung="Grundmiete (€)" wert={d.grundmiete} gesperrt={gesperrt} pflicht aendern={(v) => setzen("grundmiete", v)} />
            <Zahl kennung="mz-bkk" beschriftung="Betriebskosten kalt (€)" wert={d.bk_kalt} gesperrt={gesperrt} aendern={(v) => setzen("bk_kalt", v)} />
            <Zahl kennung="mz-bkw" beschriftung="Heizung / Warmwasser (€)" wert={d.bk_warm} gesperrt={gesperrt} aendern={(v) => setzen("bk_warm", v)} />
            <Zahl kennung="mz-stp" beschriftung="Stellplatz (€)" wert={d.stellplatz} gesperrt={gesperrt} aendern={(v) => setzen("stellplatz", v)} />
            <Zahl kennung="mz-kaution" beschriftung="Kaution (€)" wert={d.kaution} gesperrt={gesperrt} aendern={(v) => setzen("kaution", v)} />
            <div className="sm:col-span-3 flex items-end gap-3 text-[13px] text-gedaempft">
              <span>Gesamtmiete monatlich: <strong className="text-text">{euro(gesamtmiete(d))}</strong></span>
              {!gesperrt && d.kaution !== kautionMax && <button type="button" className="text-akzent hover:underline" onClick={() => setzen("kaution", kautionMax)}>Kaution auf {euro(kautionMax)} setzen</button>}
            </div>
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf><KarteTitel>Bankverbindung des Vermieters</KarteTitel></KarteKopf>
          <KarteInhalt className="grid gap-3 sm:grid-cols-4">
            <Feld id="bk-inh" beschriftung="Kontoinhaber"><Eingabe value={d.bank.kontoinhaber} readOnly={gesperrt} onChange={(e) => bank({ kontoinhaber: e.target.value })} /></Feld>
            <Feld id="bk-iban" beschriftung="IBAN"><Eingabe value={d.bank.iban} readOnly={gesperrt} onChange={(e) => bank({ iban: e.target.value.toUpperCase() })} /></Feld>
            <Feld id="bk-bic" beschriftung="BIC"><Eingabe value={d.bank.bic} readOnly={gesperrt} onChange={(e) => bank({ bic: e.target.value.toUpperCase() })} /></Feld>
            <Feld id="bk-inst" beschriftung="Kreditinstitut"><Eingabe value={d.bank.institut} readOnly={gesperrt} onChange={(e) => bank({ institut: e.target.value })} /></Feld>
          </KarteInhalt>
        </Karte>

        <Feld id="mv-bv" beschriftung="Besondere Vereinbarungen" hinweis="Wird als eigener Paragraf angefügt">
          <Textfeld value={d.besondere_vereinbarungen} readOnly={gesperrt} rows={4} onChange={(e) => setzen("besondere_vereinbarungen", e.target.value)} />
        </Feld>

        {fehlt.length > 0 && <Hinweis ton="warnung" titel="Noch offen">{fehlt.join(" · ")}</Hinweis>}
        {speichern.fehler && <Hinweis ton="fehler">{speichern.fehler}</Hinweis>}
        {speichern.erfolg && <Hinweis ton="erfolg">{speichern.erfolg}</Hinweis>}
        {!gesperrt && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" laedt={speichert}>Speichern</Button>
            <span className="text-[12px] text-gedaempft">Speichern Sie zuerst, dann erzeugen Sie den Vertragstext zur Unterschrift.</span>
          </div>
        )}
      </form>

      <Karte>
        <KarteKopf>
          <KarteTitel>Vertragstext und Unterschrift</KarteTitel>
          <KarteBeschreibung>Der Text ist ein Muster ohne Rechtsberatung und wird beim Erzeugen als Vertrag angelegt. Dort holen Sie die Unterschriften über den Signaturlink ein (einfache elektronische Signatur, Textform § 126b BGB).</KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Marke ton={status === "unterzeichnet" ? "erfolg" : status === "zur_unterschrift" ? "warnung" : "neutral"}>{STATUS[status]}</Marke>
            <a href={`/api/dokumente/mietvertrag/${id}?format=pdf`} className="text-[13px] text-akzent hover:underline">PDF</a>
            <a href={`/api/dokumente/mietvertrag/${id}?format=docx`} className="text-[13px] text-akzent hover:underline">Word</a>
            {vertragId && <Link href={`/vertraege/${vertragId}`} className="text-[13px] text-akzent hover:underline">Zum Vertrag (Unterschriften)</Link>}
          </div>
          {unterschrift.fehler && <Hinweis ton="fehler">{unterschrift.fehler}</Hinweis>}
          {statusErg.fehler && <Hinweis ton="fehler">{statusErg.fehler}</Hinweis>}
          {statusErg.erfolg && <Hinweis ton="erfolg">{statusErg.erfolg}</Hinweis>}
          <div className="flex flex-wrap gap-2">
            {status === "entwurf" && darfFreigeben && (
              <form action={unterschriftAktion}>
                <input type="hidden" name="id" value={id} />
                <Button type="submit" variante="sekundaer" laedt={bereitet} disabled={fehlt.length > 0}>Vertragstext erzeugen und zur Unterschrift</Button>
              </form>
            )}
            {status === "zur_unterschrift" && darfAendern && (
              <form action={statusAktion}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="unterzeichnet" /><Button type="submit" variante="sekundaer" groesse="klein" laedt={wechselt}>Als unterzeichnet markieren (Objekt → vermietet)</Button></form>
            )}
            {status === "unterzeichnet" && darfAendern && (
              <form action={statusAktion}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="beendet" /><Button type="submit" variante="leise" groesse="klein" laedt={wechselt}>Mietverhältnis beenden</Button></form>
            )}
            {status === "entwurf" && darfLoeschen && (
              <form action={mietvertragLoeschen}><input type="hidden" name="id" value={id} /><Button type="submit" variante="gefahr" groesse="klein">Entwurf löschen</Button></form>
            )}
          </div>
        </KarteInhalt>
      </Karte>
    </div>
  );
}

function Zahl({ kennung, beschriftung, wert, gesperrt, pflicht, aendern }: { kennung: string; beschriftung: string; wert: number; gesperrt: boolean; pflicht?: boolean; aendern: (v: number) => void }) {
  return (
    <Feld id={kennung} beschriftung={beschriftung} pflicht={pflicht ?? false}>
      <Eingabe type="number" min={0} step="0.01" value={wert} readOnly={gesperrt} onChange={(e) => aendern(Math.max(0, Number(e.target.value) || 0))} />
    </Feld>
  );
}

function ParteiBlock({ kennung, titel, beschreibung, partei, gesperrt, aendern }: { kennung: string; titel: string; beschreibung: string; partei: Partei; gesperrt: boolean; aendern: (p: Partei) => void }) {
  const person = (i: number, p: Partial<MietPerson>) => aendern({ ...partei, personen: partei.personen.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const mehrere = partei.typ !== "einzelperson" && partei.typ !== "firma";
  return (
    <Karte>
      <KarteKopf><KarteTitel>{titel}</KarteTitel><KarteBeschreibung>{beschreibung}</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Feld id={`${kennung}-typ`} beschriftung="Art">
            <Auswahl value={partei.typ} disabled={gesperrt} onChange={(e) => {
              const typ = e.target.value as Parteityp;
              aendern({ ...partei, typ, personen: typ === "eheleute" && partei.personen.length < 2 ? [...partei.personen, leerePerson()] : partei.personen });
            }}>
              {Object.entries(PARTEITYPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Auswahl>
          </Feld>
          {partei.typ === "firma" && (
            <>
              <Feld id={`${kennung}-firma`} beschriftung="Firma (mit Rechtsform)" pflicht><Eingabe value={partei.firma} readOnly={gesperrt} onChange={(e) => aendern({ ...partei, firma: e.target.value })} /></Feld>
              <Feld id={`${kennung}-vertreter`} beschriftung="Vertreten durch"><Eingabe value={partei.vertreter} readOnly={gesperrt} onChange={(e) => aendern({ ...partei, vertreter: e.target.value })} /></Feld>
            </>
          )}
        </div>
        {partei.personen.map((p, i) => (
          <div key={i} className="grid gap-3 rounded-[var(--radius)] border border-linie p-3 sm:grid-cols-6">
            <Feld id={`${kennung}-${i}-anrede`} beschriftung="Anrede"><Auswahl value={p.anrede} disabled={gesperrt} onChange={(e) => person(i, { anrede: e.target.value })}><option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option></Auswahl></Feld>
            <div className="sm:col-span-2"><Feld id={`${kennung}-${i}-name`} beschriftung={partei.typ === "firma" ? "Ansprechpartner" : "Vor- und Nachname"} pflicht={partei.typ !== "firma"}><Eingabe value={p.name} readOnly={gesperrt} onChange={(e) => person(i, { name: e.target.value })} /></Feld></div>
            <Feld id={`${kennung}-${i}-geb`} beschriftung="Geburtsdatum"><Eingabe type="date" value={p.geburtsdatum} readOnly={gesperrt} onChange={(e) => person(i, { geburtsdatum: e.target.value })} /></Feld>
            <div className="sm:col-span-2"><Feld id={`${kennung}-${i}-email`} beschriftung="E-Mail" hinweis="Für den Signaturlink"><Eingabe type="email" value={p.email} readOnly={gesperrt} onChange={(e) => person(i, { email: e.target.value })} /></Feld></div>
            <div className="sm:col-span-3"><Feld id={`${kennung}-${i}-strasse`} beschriftung="Straße, Hausnummer"><Eingabe value={p.strasse} readOnly={gesperrt} onChange={(e) => person(i, { strasse: e.target.value })} /></Feld></div>
            <Feld id={`${kennung}-${i}-plz`} beschriftung="PLZ"><Eingabe value={p.plz} readOnly={gesperrt} onChange={(e) => person(i, { plz: e.target.value })} /></Feld>
            <div className="sm:col-span-2 flex items-end gap-2">
              <div className="flex-1"><Feld id={`${kennung}-${i}-ort`} beschriftung="Ort"><Eingabe value={p.ort} readOnly={gesperrt} onChange={(e) => person(i, { ort: e.target.value })} /></Feld></div>
              {!gesperrt && partei.personen.length > 1 && <Button type="button" variante="leise" groesse="klein" onClick={() => aendern({ ...partei, personen: partei.personen.filter((_, j) => j !== i) })}>Entfernen</Button>}
            </div>
          </div>
        ))}
        {!gesperrt && (mehrere || partei.personen.length === 0) && partei.personen.length < 10 && (
          <Button type="button" variante="leise" groesse="klein" onClick={() => aendern({ ...partei, personen: [...partei.personen, leerePerson()] })}>Weitere Person</Button>
        )}
      </KarteInhalt>
    </Karte>
  );
}
