"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { ABSENDER_TYPEN, MWST_SAETZE, nummerVorschau, type Absender } from "@/lib/rechnungen";
import { absenderLoeschen, absenderSpeichern, type RechnungErgebnis } from "@/server/rechnungen-aktionen";

/**
 * Rechnungsabsender (Referenz: „Stammdaten Rechnungen“): Firmen- und
 * persoenliche Absender mit Anschrift, Steuerangaben, Bankverbindung und
 * eigenem Nummernkreis. Die Startnummer ist nur editierbar, solange ueber
 * diesen Absender noch keine Rechnung gestellt wurde.
 */
export function AbsenderVerwaltung({ absender, info, benutzer, darfAendern, darfLoeschen }: { absender: Absender[]; info: Record<string, { gestellt: number; editierbar: boolean; naechste: string }>; benutzer: Array<{ id: string; name: string }>; darfAendern: boolean; darfLoeschen: boolean }) {
  const [offen, setOffen] = useState<string | "neu" | null>(absender.length === 0 ? "neu" : null);
  const leer: Absender = { id: "", typ: "firma", benutzer_id: null, name: "", zusatz: null, strasse: "", hausnummer: null, plz: "", ort: "", land: "Deutschland", email: null, telefon: null, web: null, steuernummer: null, ust_id: null, kleinunternehmer: false, bank_name: null, iban: null, bic: null, praefix: "RE", mit_jahr: true, naechste_nummer: 1, zahlungsziel_tage: 14, standard_mwst: 19, einleitung: "Sehr geehrte Damen und Herren,\n\nhiermit stellen wir Ihnen folgende Leistungen in Rechnung:", schluss: null, aktiv: true };
  const bearbeitet = offen === "neu" ? leer : absender.find((a) => a.id === offen) ?? null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {absender.map((a) => {
          const i = info[a.id];
          return (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{a.name} <Marke>{ABSENDER_TYPEN[a.typ]}</Marke> {!a.aktiv && <Marke ton="warnung">inaktiv</Marke>} {a.kleinunternehmer && <Marke ton="info">§ 19 UStG</Marke>}</p>
                <p className="text-[12px] text-gedaempft">{[a.strasse, a.hausnummer].filter(Boolean).join(" ")}, {a.plz} {a.ort} · Nächste Nummer {i?.naechste ?? nummerVorschau(a)} · {i?.gestellt ?? 0} gestellt{a.iban ? ` · IBAN ${a.iban}` : ""}</p>
              </div>
              {darfAendern && <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setOffen(offen === a.id ? null : a.id)}>{offen === a.id ? "Schließen" : "Bearbeiten"}</Button>}
              {darfLoeschen && (i?.gestellt ?? 0) === 0 && <form action={absenderLoeschen}><input type="hidden" name="id" value={a.id} /><Button type="submit" variante="leise" groesse="klein">Löschen</Button></form>}
            </div>
          );
        })}
        {absender.length === 0 && <Hinweis>Noch kein Rechnungsabsender. Der erste wird beim Anlegen einer Rechnung aus den Firmendaten erzeugt — oder Sie legen ihn hier an.</Hinweis>}
      </div>
      {darfAendern && offen === null && <Button type="button" onClick={() => setOffen("neu")}>Absender anlegen</Button>}
      {darfAendern && bearbeitet && <AbsenderFormular key={bearbeitet.id || "neu"} start={bearbeitet} info={bearbeitet.id ? info[bearbeitet.id] : undefined} benutzer={benutzer} schliessen={() => setOffen(null)} />}
    </div>
  );
}

function AbsenderFormular({ start, info, benutzer, schliessen }: { start: Absender; info: { gestellt: number; editierbar: boolean; naechste: string } | undefined; benutzer: Array<{ id: string; name: string }>; schliessen: () => void }) {
  const [zustand, aktion, laeuft] = useActionState<RechnungErgebnis, FormData>(absenderSpeichern, {});
  const [typ, setTyp] = useState(start.typ);
  const [praefix, setPraefix] = useState(start.praefix);
  const [mitJahr, setMitJahr] = useState(start.mit_jahr);
  const [nummer, setNummer] = useState(String(start.naechste_nummer));
  const gesperrt = info ? !info.editierbar : false;
  const vorschau = nummerVorschau({ praefix: praefix || "RE", mit_jahr: mitJahr, naechste_nummer: Number(nummer) || 1 });
  return (
    <Karte>
      <KarteKopf><KarteTitel>{start.id ? "Absender bearbeiten" : "Absender anlegen"}</KarteTitel><KarteBeschreibung>Pflichtangaben nach § 14 UStG: vollständige Anschrift, Steuernummer oder USt-IdNr., fortlaufende Rechnungsnummer.</KarteBeschreibung></KarteKopf>
      <KarteInhalt>
        <form action={aktion} className="grid gap-3 sm:grid-cols-4">
          {start.id && <input type="hidden" name="id" value={start.id} />}
          {zustand.fehler && <div className="sm:col-span-4"><Hinweis ton="fehler">{zustand.fehler}</Hinweis></div>}
          {zustand.erfolg && <div className="sm:col-span-4"><Hinweis ton="erfolg">{zustand.erfolg}</Hinweis></div>}
          <Feld id="ab-typ" beschriftung="Art">
            <Auswahl name="typ" value={typ} onChange={(e) => setTyp(e.target.value as Absender["typ"])}>{(Object.keys(ABSENDER_TYPEN) as Absender["typ"][]).map((t) => <option key={t} value={t}>{ABSENDER_TYPEN[t]}</option>)}</Auswahl>
          </Feld>
          {typ === "persoenlich" && (
            <Feld id="ab-benutzer" beschriftung="Gehört zu" hinweis="Persönliche Rechnungen, z. B. freie Handelsvertreter">
              <Auswahl name="benutzer_id" defaultValue={start.benutzer_id ?? ""}>{benutzer.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Auswahl>
            </Feld>
          )}
          <div className={typ === "persoenlich" ? "sm:col-span-2" : "sm:col-span-3"}><Feld id="ab-name" beschriftung="Name / Firma" pflicht><Eingabe name="name" required defaultValue={start.name} /></Feld></div>
          <div className="sm:col-span-4"><Feld id="ab-zusatz" beschriftung="Zusatz (Rechtsform, Inhaber)"><Eingabe name="zusatz" defaultValue={start.zusatz ?? ""} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="ab-strasse" beschriftung="Straße" pflicht><Eingabe name="strasse" required defaultValue={start.strasse} /></Feld></div>
          <Feld id="ab-hnr" beschriftung="Hausnummer"><Eingabe name="hausnummer" defaultValue={start.hausnummer ?? ""} /></Feld>
          <Feld id="ab-land" beschriftung="Land"><Eingabe name="land" defaultValue={start.land} /></Feld>
          <Feld id="ab-plz" beschriftung="PLZ" pflicht><Eingabe name="plz" required defaultValue={start.plz} /></Feld>
          <div className="sm:col-span-3"><Feld id="ab-ort" beschriftung="Ort" pflicht><Eingabe name="ort" required defaultValue={start.ort} /></Feld></div>
          <Feld id="ab-email" beschriftung="E-Mail"><Eingabe name="email" type="email" defaultValue={start.email ?? ""} /></Feld>
          <Feld id="ab-telefon" beschriftung="Telefon"><Eingabe name="telefon" defaultValue={start.telefon ?? ""} /></Feld>
          <div className="sm:col-span-2"><Feld id="ab-web" beschriftung="Web"><Eingabe name="web" defaultValue={start.web ?? ""} /></Feld></div>
          <Feld id="ab-stnr" beschriftung="Steuernummer"><Eingabe name="steuernummer" defaultValue={start.steuernummer ?? ""} /></Feld>
          <Feld id="ab-ustid" beschriftung="USt-IdNr."><Eingabe name="ust_id" defaultValue={start.ust_id ?? ""} placeholder="DE123456789" /></Feld>
          <Feld id="ab-mwst" beschriftung="Standard-Steuersatz"><Auswahl name="standard_mwst" defaultValue={String(start.standard_mwst)}>{MWST_SAETZE.map((m) => <option key={m} value={m}>{m} %</option>)}</Auswahl></Feld>
          <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-[13px] text-text"><input type="checkbox" name="kleinunternehmer" value="1" defaultChecked={start.kleinunternehmer} className="h-4 w-4 accent-akzent" />Kleinunternehmer (§ 19 UStG)</label></div>
          <div className="sm:col-span-2"><Feld id="ab-bank" beschriftung="Bank"><Eingabe name="bank_name" defaultValue={start.bank_name ?? ""} /></Feld></div>
          <Feld id="ab-iban" beschriftung="IBAN"><Eingabe name="iban" defaultValue={start.iban ?? ""} /></Feld>
          <Feld id="ab-bic" beschriftung="BIC"><Eingabe name="bic" defaultValue={start.bic ?? ""} /></Feld>
          <div className="sm:col-span-4 mt-2 border-t border-linie pt-3"><p className="text-[13px] font-medium text-text">Nummernkreis {gesperrt && <Marke ton="warnung">gesperrt — {info?.gestellt} Rechnung(en) gestellt</Marke>}</p></div>
          <Feld id="ab-praefix" beschriftung="Präfix"><Eingabe name="praefix" value={praefix} readOnly={gesperrt} maxLength={8} onChange={(e) => setPraefix(e.target.value.toUpperCase())} /></Feld>
          <Feld id="ab-jahr" beschriftung="Jahr in der Nummer"><Auswahl name="mit_jahr" value={mitJahr ? "1" : "0"} disabled={gesperrt} onChange={(e) => setMitJahr(e.target.value === "1")}><option value="1">Ja (RE-2026-001)</option><option value="0">Nein (RE-001)</option></Auswahl></Feld>
          <Feld id="ab-nummer" beschriftung="Nächste Nummer" hinweis={`Vorschau: ${vorschau}`}><Eingabe name="naechste_nummer" inputMode="numeric" value={nummer} readOnly={gesperrt} onChange={(e) => setNummer(e.target.value)} /></Feld>
          <Feld id="ab-ziel" beschriftung="Zahlungsziel (Tage)"><Eingabe name="zahlungsziel_tage" inputMode="numeric" defaultValue={String(start.zahlungsziel_tage)} /></Feld>
          <div className="sm:col-span-2"><Feld id="ab-einleitung" beschriftung="Standard-Einleitung"><Textfeld name="einleitung" rows={3} defaultValue={start.einleitung} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="ab-schluss" beschriftung="Standard-Schlusstext" hinweis="Leer = Zahlungshinweis mit Bankverbindung"><Textfeld name="schluss" rows={3} defaultValue={start.schluss ?? ""} /></Feld></div>
          <Feld id="ab-aktiv" beschriftung="Status"><Auswahl name="aktiv" defaultValue={start.aktiv ? "1" : "0"}><option value="1">Aktiv</option><option value="0">Inaktiv</option></Auswahl></Feld>
          <div className="sm:col-span-4 flex gap-2">
            <Button type="submit" disabled={laeuft}>{laeuft ? "Speichert …" : "Speichern"}</Button>
            <Button type="button" variante="leise" onClick={schliessen}>Schließen</Button>
          </div>
        </form>
      </KarteInhalt>
    </Karte>
  );
}
