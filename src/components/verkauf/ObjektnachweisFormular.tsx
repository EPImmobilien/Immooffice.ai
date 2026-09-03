"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { LEERE_PERSON, leererObjektnachweis, type ObjektnachweisDaten, type Person } from "@/lib/verkauf/vorlagen";
import { objektnachweisAnlegen, type VerkaufErgebnis } from "@/server/verkauf-aktionen";

import type { KontaktWahl, ObjektWahl } from "./MaklervertragFormular";

const LEER_PERSON: Person = LEERE_PERSON;

/** Objektnachweis mit Provisionsvereinbarung fuer Interessenten (V1). */
export function ObjektnachweisFormular({ objekte, kontakte }: { objekte: ObjektWahl[]; kontakte: KontaktWahl[] }) {
  const [d, setD] = useState<ObjektnachweisDaten>(leererObjektnachweis);
  const [objektId, setObjektId] = useState("");
  const [kontaktId, setKontaktId] = useState("");
  const [zustand, aktion, laeuft] = useActionState<VerkaufErgebnis, FormData>(objektnachweisAnlegen, {});
  const person = (i: number, p: Partial<Person>) => setD((alt) => ({ ...alt, kaeufer: alt.kaeufer.map((x, j) => (j === i ? { ...x, ...p } : x)) }));

  function objektWaehlen(id: string) {
    setObjektId(id);
    const o = objekte.find((x) => x.id === id);
    if (!o) return;
    setD((alt) => ({ ...alt, objekt: { ...alt.objekt, bezeichnung: o.bezeichnung, strasse: [o.strasse, o.hausnummer].filter(Boolean).join(" "), plz: o.plz ?? "", ort: o.ort ?? "", wohnung_oder_efh: o.objektkategorie === "wohnung" || o.objektkategorie === "haus" }, angebotspreis: o.kaufpreis }));
  }
  function kontaktWaehlen(id: string) {
    setKontaktId(id);
    const k = kontakte.find((x) => x.id === id);
    if (!k) return;
    person(0, { anrede: k.anrede ?? "", name: k.name, strasse: [k.strasse, k.hausnummer].filter(Boolean).join(" "), plz: k.plz ?? "", ort: k.ort ?? "", email: k.email ?? "" });
  }

  return (
    <form action={aktion} className="space-y-5">
      <input type="hidden" name="daten" value={JSON.stringify(d)} />
      <input type="hidden" name="objekt_id" value={objektId} />
      <input type="hidden" name="kontakt_id" value={kontaktId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Feld id="on-objekt" beschriftung="Objekt aus dem Bestand">
          <Auswahl value={objektId} onChange={(e) => objektWaehlen(e.target.value)}>
            <option value="">— bitte wählen —</option>
            {objekte.map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}
          </Auswahl>
        </Feld>
        <Feld id="on-kontakt" beschriftung="Interessent aus den Kontakten">
          <Auswahl value={kontaktId} onChange={(e) => kontaktWaehlen(e.target.value)}>
            <option value="">— bitte wählen —</option>
            {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </Auswahl>
        </Feld>
      </div>
      {d.kaeufer.map((p, i) => (
        <div key={i} className="grid gap-3 rounded-[var(--radius)] border border-linie p-3 sm:grid-cols-6">
          <Feld id={`k-anrede-${i}`} beschriftung="Anrede"><Eingabe value={p.anrede} onChange={(e) => person(i, { anrede: e.target.value })} /></Feld>
          <div className="sm:col-span-2"><Feld id={`k-name-${i}`} beschriftung="Vor- und Nachname" pflicht><Eingabe value={p.name} onChange={(e) => person(i, { name: e.target.value })} /></Feld></div>
          <Feld id={`k-strasse-${i}`} beschriftung="Straße, Nr."><Eingabe value={p.strasse} onChange={(e) => person(i, { strasse: e.target.value })} /></Feld>
          <Feld id={`k-plz-${i}`} beschriftung="PLZ"><Eingabe value={p.plz} onChange={(e) => person(i, { plz: e.target.value })} /></Feld>
          <Feld id={`k-ort-${i}`} beschriftung="Ort"><Eingabe value={p.ort} onChange={(e) => person(i, { ort: e.target.value })} /></Feld>
        </div>
      ))}
      <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setD((alt) => ({ ...alt, kaeufer: [...alt.kaeufer, { ...LEER_PERSON }] }))}>Weiterer Interessent</Button>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><Feld id="on-bez" beschriftung="Objektbezeichnung"><Eingabe value={d.objekt.bezeichnung} onChange={(e) => setD({ ...d, objekt: { ...d.objekt, bezeichnung: e.target.value } })} /></Feld></div>
        <Feld id="on-str" beschriftung="Straße, Nr."><Eingabe value={d.objekt.strasse} onChange={(e) => setD({ ...d, objekt: { ...d.objekt, strasse: e.target.value } })} /></Feld>
        <Feld id="on-plz" beschriftung="PLZ / Ort">
          <div className="flex gap-2">
            <Eingabe value={d.objekt.plz} className="w-24" onChange={(e) => setD({ ...d, objekt: { ...d.objekt, plz: e.target.value } })} />
            <Eingabe value={d.objekt.ort} onChange={(e) => setD({ ...d, objekt: { ...d.objekt, ort: e.target.value } })} />
          </div>
        </Feld>
        <Feld id="on-preis" beschriftung="Angebotspreis (€)"><Eingabe type="number" min={0} value={d.angebotspreis ?? ""} onChange={(e) => setD({ ...d, angebotspreis: e.target.value === "" ? null : Number(e.target.value) })} /></Feld>
        <Feld id="on-prov" beschriftung="Provision (%)" hinweis="inkl. USt., gleiche Höhe wie beim Verkäufer (§ 656c)"><Eingabe type="number" min={0} max={20} step="0.01" value={d.provision_prozent} onChange={(e) => setD({ ...d, provision_prozent: Number(e.target.value) || 0 })} /></Feld>
        <Feld id="on-bes" beschriftung="Besichtigt am"><Eingabe type="date" value={d.besichtigt_am} onChange={(e) => setD({ ...d, besichtigt_am: e.target.value })} /></Feld>
        <Feld id="on-verbraucher" beschriftung="Interessent handelt als">
          <Auswahl value={d.verbraucher ? "ja" : "nein"} onChange={(e) => setD({ ...d, verbraucher: e.target.value === "ja" })}>
            <option value="ja">Verbraucher</option>
            <option value="nein">Unternehmer</option>
          </Auswahl>
        </Feld>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-text"><input type="checkbox" checked={d.ausweis_geprueft} onChange={(e) => setD({ ...d, ausweis_geprueft: e.target.checked })} /> Ausweis geprüft (Geldwäschegesetz)</label>
      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
      <Button type="submit" laedt={laeuft}>Objektnachweis erzeugen</Button>
    </form>
  );
}
