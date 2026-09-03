"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis, KiKennzeichen } from "@/components/ui/Status";
import { LEERE_PERSON, leererMaklervertrag, PROVISIONSMODELLE, provisionsWarnung, VERKAEUFERTYPEN, type MaklervertragDaten, type Person } from "@/lib/verkauf/vorlagen";
import { maklervertragAnlegen, vertragImportieren, type VerkaufErgebnis } from "@/server/verkauf-aktionen";

export interface ObjektWahl { id: string; objektnummer: string; bezeichnung: string; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null; kaufpreis: number | null; kaltmiete: number | null; objektkategorie: string; vermarktungsart: string }
export interface KontaktWahl { id: string; name: string; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null; email: string | null; anrede: string | null }

const LEER_PERSON: Person = LEERE_PERSON;

/**
 * Maklervertrag aus der Vorlage (docs/FUNKTIONSABGLEICH.md V1): Verkaeufertypen,
 * Provisionsmodelle, Vollmacht. Alle Werte sind editierbar; ein Import per
 * KI belegt das Formular nur vor.
 */
export function MaklervertragFormular({ objekte, kontakte, kiVerfuegbar }: { objekte: ObjektWahl[]; kontakte: KontaktWahl[]; kiVerfuegbar: boolean }) {
  const [d, setD] = useState<MaklervertragDaten>(leererMaklervertrag);
  const [objektId, setObjektId] = useState("");
  const [kontaktId, setKontaktId] = useState("");
  const [originalPfad, setOriginalPfad] = useState("");
  const [geschlossenAm, setGeschlossenAm] = useState("");
  const [anlegen, anlegenAktion, legtAn] = useActionState<VerkaufErgebnis, FormData>(maklervertragAnlegen, {});
  const [imp, importAktion, importiert] = useActionState<VerkaufErgebnis, FormData>(vertragImportieren, {});
  const [importUebernommen, setImportUebernommen] = useState<string | null>(null);
  const warnung = provisionsWarnung(d);

  const setzen = <K extends keyof MaklervertragDaten>(k: K, v: MaklervertragDaten[K]) => setD((alt) => ({ ...alt, [k]: v }));
  const person = (i: number, p: Partial<Person>) => setD((alt) => ({ ...alt, personen: alt.personen.map((x, j) => (j === i ? { ...x, ...p } : x)) }));

  function objektWaehlen(id: string) {
    setObjektId(id);
    const o = objekte.find((x) => x.id === id);
    if (!o) return;
    setD((alt) => ({
      ...alt,
      vertragsart: o.vermarktungsart === "miete" ? "vermietung" : "verkauf",
      objekt: { ...alt.objekt, bezeichnung: o.bezeichnung, strasse: [o.strasse, o.hausnummer].filter(Boolean).join(" "), plz: o.plz ?? "", ort: o.ort ?? "", wohnung_oder_efh: o.objektkategorie === "wohnung" || o.objektkategorie === "haus" },
      angebotspreis: o.vermarktungsart === "miete" ? o.kaltmiete : o.kaufpreis,
    }));
  }
  function kontaktWaehlen(id: string) {
    setKontaktId(id);
    const k = kontakte.find((x) => x.id === id);
    if (!k) return;
    person(0, { anrede: k.anrede ?? "", name: k.name, strasse: [k.strasse, k.hausnummer].filter(Boolean).join(" "), plz: k.plz ?? "", ort: k.ort ?? "", email: k.email ?? "" });
  }
  // Importergebnis einmalig uebernehmen (Schluessel = originalPfad oder Zeitpunkt)
  const importSchluessel = imp.formular ? JSON.stringify(imp.formular).slice(0, 60) + (imp.originalPfad ?? "") : null;
  if (imp.formular && importSchluessel && importUebernommen !== importSchluessel) {
    setImportUebernommen(importSchluessel);
    setD(imp.formular);
    if (imp.originalPfad) setOriginalPfad(imp.originalPfad);
    if (imp.werte?.["geschlossen_am"]) setGeschlossenAm(imp.werte["geschlossen_am"]);
  }

  const mehrere = d.verkaeufer_typ !== "einzelperson" && d.verkaeufer_typ !== "firma";
  const personenBezeichnung = d.verkaeufer_typ === "erbengemeinschaft" ? "Erben" : d.verkaeufer_typ === "eheleute" ? "Eheleute" : "Eigentümer";

  return (
    <div className="space-y-6">
      <details className="rounded-[var(--radius)] border border-dashed border-linie p-4">
        <summary className="cursor-pointer text-[13px] font-medium text-text">Bestehenden Vertrag aus PDF einlesen {kiVerfuegbar ? "(KI, 5 Credits)" : "(ohne KI: einfache Mustererkennung)"}</summary>
        <form action={importAktion} className="mt-3 space-y-3">
          <Feld id="import-datei" beschriftung="PDF-Datei" hinweis="Der Text wird ausgelesen und in das Formular übernommen. Das Original wird beim Vertrag abgelegt.">
            <input type="file" name="datei" accept="application/pdf" className="block text-[13px]" />
          </Feld>
          {imp.fehler && <Hinweis ton="fehler">{imp.fehler}</Hinweis>}
          {imp.erfolg && (
            <Hinweis ton={imp.kiVerwendet ? "info" : "warnung"}>
              {imp.erfolg}{imp.hinweis ? ` ${imp.hinweis}` : ""} {imp.kiVerwendet && <><KiKennzeichen art="erzeugt" /> <span className="text-[12px]">{imp.quelle}</span></>}
            </Hinweis>
          )}
          <Button type="submit" variante="sekundaer" groesse="klein" laedt={importiert}>Einlesen</Button>
        </form>
      </details>

      <form action={anlegenAktion} className="space-y-5">
        <input type="hidden" name="daten" value={JSON.stringify(d)} />
        <input type="hidden" name="objekt_id" value={objektId} />
        <input type="hidden" name="kontakt_id" value={kontaktId} />
        <input type="hidden" name="original_pfad" value={originalPfad} />
        <input type="hidden" name="geschlossen_am" value={geschlossenAm} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Feld id="mv-objekt" beschriftung="Objekt aus dem Bestand" hinweis="Belegt Objektangaben und Preis vor">
            <Auswahl value={objektId} onChange={(e) => objektWaehlen(e.target.value)}>
              <option value="">— ohne Verknüpfung —</option>
              {objekte.map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}
            </Auswahl>
          </Feld>
          <Feld id="mv-kontakt" beschriftung="Auftraggeber aus den Kontakten" hinweis="Belegt die erste Person vor">
            <Auswahl value={kontaktId} onChange={(e) => kontaktWaehlen(e.target.value)}>
              <option value="">— ohne Verknüpfung —</option>
              {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </Auswahl>
          </Feld>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Feld id="mv-art" beschriftung="Vertragsart">
            <Auswahl value={d.vertragsart} onChange={(e) => setzen("vertragsart", e.target.value as "verkauf" | "vermietung")}>
              <option value="verkauf">Verkauf</option>
              <option value="vermietung">Vermietung</option>
            </Auswahl>
          </Feld>
          <Feld id="mv-typ" beschriftung="Auftraggeber">
            <Auswahl value={d.verkaeufer_typ} onChange={(e) => {
              const typ = e.target.value as MaklervertragDaten["verkaeufer_typ"];
              setD((alt) => ({ ...alt, verkaeufer_typ: typ, personen: typ === "eheleute" && alt.personen.length < 2 ? [...alt.personen, { ...LEER_PERSON }] : alt.personen, alleineigentum: typ === "einzelperson" || typ === "firma" }));
            }}>
              {Object.entries(VERKAEUFERTYPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Auswahl>
          </Feld>
          <Feld id="mv-verbraucher" beschriftung="Auftraggeber handelt als">
            <Auswahl value={d.verbraucher ? "ja" : "nein"} onChange={(e) => setzen("verbraucher", e.target.value === "ja")}>
              <option value="ja">Verbraucher (Widerrufsrecht)</option>
              <option value="nein">Unternehmer</option>
            </Auswahl>
          </Feld>
        </div>

        {d.verkaeufer_typ === "firma" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Feld id="mv-firma" beschriftung="Firmenname (mit Rechtsform)" pflicht>
              <Eingabe value={d.firma.name} onChange={(e) => setzen("firma", { ...d.firma, name: e.target.value })} />
            </Feld>
            <Feld id="mv-register" beschriftung="Register">
              <Eingabe value={d.firma.register} placeholder="HRB 12345, Amtsgericht …" onChange={(e) => setzen("firma", { ...d.firma, register: e.target.value })} />
            </Feld>
            <Feld id="mv-vertreter" beschriftung="Vertreten durch">
              <Eingabe value={d.firma.vertreter} onChange={(e) => setzen("firma", { ...d.firma, vertreter: e.target.value })} />
            </Feld>
          </div>
        ) : null}

        <div className="space-y-3">
          <p className="text-[13px] font-medium text-text">{d.verkaeufer_typ === "firma" ? "Anschrift der Gesellschaft" : personenBezeichnung}</p>
          {d.personen.map((p, i) => (
            <div key={i} className="grid gap-3 rounded-[var(--radius)] border border-linie p-3 sm:grid-cols-6">
              <Feld id={`p-anrede-${i}`} beschriftung="Anrede">
                <Eingabe value={p.anrede} onChange={(e) => person(i, { anrede: e.target.value })} />
              </Feld>
              <div className="sm:col-span-2">
                <Feld id={`p-name-${i}`} beschriftung={d.verkaeufer_typ === "firma" ? "Ansprechpartner" : "Vor- und Nachname"} pflicht>
                  <Eingabe value={p.name} onChange={(e) => person(i, { name: e.target.value })} />
                </Feld>
              </div>
              <Feld id={`p-strasse-${i}`} beschriftung="Straße, Nr.">
                <Eingabe value={p.strasse} onChange={(e) => person(i, { strasse: e.target.value })} />
              </Feld>
              <Feld id={`p-plz-${i}`} beschriftung="PLZ">
                <Eingabe value={p.plz} onChange={(e) => person(i, { plz: e.target.value })} />
              </Feld>
              <Feld id={`p-ort-${i}`} beschriftung="Ort">
                <Eingabe value={p.ort} onChange={(e) => person(i, { ort: e.target.value })} />
              </Feld>
              {d.personen.length > 1 && (
                <div className="sm:col-span-6">
                  <Button type="button" variante="leise" groesse="klein" onClick={() => setD((alt) => ({ ...alt, personen: alt.personen.filter((_, j) => j !== i) }))}>Person entfernen</Button>
                </div>
              )}
            </div>
          ))}
          {(mehrere || d.verkaeufer_typ === "einzelperson") && (
            <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setD((alt) => ({ ...alt, personen: [...alt.personen, { ...LEER_PERSON }], verkaeufer_typ: alt.verkaeufer_typ === "einzelperson" ? "mehrere" : alt.verkaeufer_typ }))}>Weitere Person</Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Feld id="mv-obj-bez" beschriftung="Objektbezeichnung">
              <Eingabe value={d.objekt.bezeichnung} onChange={(e) => setzen("objekt", { ...d.objekt, bezeichnung: e.target.value })} />
            </Feld>
          </div>
          <Feld id="mv-obj-str" beschriftung="Straße, Nr.">
            <Eingabe value={d.objekt.strasse} onChange={(e) => setzen("objekt", { ...d.objekt, strasse: e.target.value })} />
          </Feld>
          <Feld id="mv-obj-plz" beschriftung="PLZ / Ort">
            <div className="flex gap-2">
              <Eingabe value={d.objekt.plz} className="w-24" onChange={(e) => setzen("objekt", { ...d.objekt, plz: e.target.value })} />
              <Eingabe value={d.objekt.ort} onChange={(e) => setzen("objekt", { ...d.objekt, ort: e.target.value })} />
            </div>
          </Feld>
          <div className="sm:col-span-2">
            <Feld id="mv-grundbuch" beschriftung="Grundbuch (optional)">
              <Eingabe value={d.objekt.grundbuch} placeholder="Amtsgericht, Blatt, Flurstück" onChange={(e) => setzen("objekt", { ...d.objekt, grundbuch: e.target.value })} />
            </Feld>
          </div>
          <div className="sm:col-span-2 flex items-end pb-2">
            <label className="flex items-center gap-2 text-[13px] text-text">
              <input type="checkbox" checked={d.objekt.wohnung_oder_efh} onChange={(e) => setzen("objekt", { ...d.objekt, wohnung_oder_efh: e.target.checked })} />
              Wohnung oder Einfamilienhaus (§ 656c/d BGB)
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Feld id="mv-preis" beschriftung={d.vertragsart === "verkauf" ? "Angebotspreis (€)" : "Kaltmiete (€/Monat)"}>
            <Eingabe type="number" min={0} step="1" value={d.angebotspreis ?? ""} onChange={(e) => setzen("angebotspreis", e.target.value === "" ? null : Number(e.target.value))} />
          </Feld>
          <Feld id="mv-laufzeit" beschriftung="Laufzeit (Monate)">
            <Eingabe type="number" min={1} max={36} value={d.laufzeit_monate} onChange={(e) => setzen("laufzeit_monate", Number(e.target.value) || 6)} />
          </Feld>
          <Feld id="mv-provision" beschriftung="Provision (%)" hinweis="inkl. USt.">
            <Eingabe type="number" min={0} max={20} step="0.01" value={d.provision_prozent} onChange={(e) => setzen("provision_prozent", Number(e.target.value) || 0)} />
          </Feld>
          <Feld id="mv-modell" beschriftung="Provisionsmodell">
            <Auswahl value={d.provisionsmodell} onChange={(e) => setzen("provisionsmodell", e.target.value as MaklervertragDaten["provisionsmodell"])}>
              {Object.entries(PROVISIONSMODELLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Auswahl>
          </Feld>
        </div>
        {warnung && <Hinweis ton="warnung" titel="§ 656d BGB">{warnung}</Hinweis>}

        <div className="flex flex-wrap gap-4 text-[13px] text-text">
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.alleineigentum} onChange={(e) => setzen("alleineigentum", e.target.checked)} /> Alleineigentum</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.vollmacht_mitgenerieren} onChange={(e) => setzen("vollmacht_mitgenerieren", e.target.checked)} /> Vollmacht mitgenerieren</label>
          {d.vollmacht_mitgenerieren && <label className="flex items-center gap-2"><input type="checkbox" checked={d.untervollmacht} onChange={(e) => setzen("untervollmacht", e.target.checked)} /> Untervollmacht an Dienstleister erlauben</label>}
        </div>

        {anlegen.fehler && <Hinweis ton="fehler">{anlegen.fehler}</Hinweis>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" laedt={legtAn}>Vertrag erzeugen</Button>
          <p className="text-[12px] text-gedaempft">Der Text entsteht aus der Vorlage und bleibt bis zur ersten Unterschrift bearbeitbar. Muster ohne Rechtsberatung — bitte anwaltlich prüfen lassen.</p>
        </div>
      </form>
    </div>
  );
}
