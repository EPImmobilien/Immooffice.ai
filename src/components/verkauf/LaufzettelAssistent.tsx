"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { zeitpunkt } from "@/lib/format";
import { ANHANG_KATEGORIEN, fehlendeAngaben, leerePartei, SCHRITTE, STATUS, type Anhang, type Laufzettel, type LaufzettelStatus, type Partei } from "@/lib/verkauf/laufzettel";
import {
  laufzettelAnhangHochladen,
  laufzettelAnhangLoeschen,
  laufzettelAnschreiben,
  laufzettelLoeschen,
  laufzettelSpeichern,
  laufzettelStatus,
  type VerkaufErgebnis,
} from "@/server/verkauf-aktionen";

interface Props {
  id: string;
  bezeichnung: string;
  start: Laufzettel;
  anhaenge: Anhang[];
  status: LaufzettelStatus;
  darfAendern: boolean;
  darfFreigeben: boolean;
  kiVerfuegbar: boolean;
}

function Ja({ wert, onChange, text, disabled }: { wert: boolean; onChange: (b: boolean) => void; text: string; disabled: boolean }) {
  return <label className="flex items-center gap-2 text-[13px] text-text"><input type="checkbox" disabled={disabled} checked={wert} onChange={(e) => onChange(e.target.checked)} /> {text}</label>;
}

/** Notar-Laufzettel in acht Schritten (docs/FUNKTIONSABGLEICH.md V2). */
export function LaufzettelAssistent({ id, bezeichnung: startBezeichnung, start, anhaenge, status, darfAendern, darfFreigeben, kiVerfuegbar }: Props) {
  const [l, setL] = useState<Laufzettel>(start);
  const [bezeichnung, setBezeichnung] = useState(startBezeichnung);
  const [schritt, setSchritt] = useState(1);
  const [speichern, speichernAktion, speichert] = useActionState<VerkaufErgebnis, FormData>(laufzettelSpeichern, {});
  const [stat, statusAktion, aendert] = useActionState<VerkaufErgebnis, FormData>(laufzettelStatus, {});
  const [anhang, anhangAktion, laedtHoch] = useActionState<VerkaufErgebnis, FormData>(laufzettelAnhangHochladen, {});
  const [weg, wegAktion] = useActionState<VerkaufErgebnis, FormData>(laufzettelAnhangLoeschen, {});
  const [brief, briefAktion, schreibt] = useActionState<VerkaufErgebnis, FormData>(laufzettelAnschreiben, {});
  const gesperrt = status === "abgeschlossen" || !darfAendern;
  const fehlt = fehlendeAngaben(l);
  const i = l.immobilie; const k = l.kaufpreis; const s = l.sonstiges; const b = l.beauftragung;
  const setI = (a: Partial<typeof i>) => setL((alt) => ({ ...alt, immobilie: { ...alt.immobilie, ...a } }));
  const setK = (a: Partial<typeof k>) => setL((alt) => ({ ...alt, kaufpreis: { ...alt.kaufpreis, ...a } }));
  const setS = (a: Partial<typeof s>) => setL((alt) => ({ ...alt, sonstiges: { ...alt.sonstiges, ...a } }));
  const setB = (a: Partial<typeof b>) => setL((alt) => ({ ...alt, beauftragung: { ...alt.beauftragung, ...a } }));

  function parteien(liste: "verkaeufer" | "kaeufer", titel: string) {
    const setP = (n: number, a: Partial<Partei>) => setL((alt) => ({ ...alt, [liste]: alt[liste].map((p, j) => (j === n ? { ...p, ...a } : p)) }));
    return (
      <div className="space-y-3">
        {l[liste].map((p, n) => (
          <div key={n} className="space-y-3 rounded-[var(--radius)] border border-linie p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-text">{titel} {l[liste].length > 1 ? n + 1 : ""}</p>
              <div className="flex items-center gap-3">
                <Auswahl disabled={gesperrt} value={p.art} onChange={(e) => setP(n, { art: e.target.value as "privat" | "gesellschaft" })} className="w-auto">
                  <option value="privat">Privatperson</option><option value="gesellschaft">Gesellschaft</option>
                </Auswahl>
                {!gesperrt && l[liste].length > 1 && <Button type="button" variante="leise" groesse="klein" onClick={() => setL((alt) => ({ ...alt, [liste]: alt[liste].filter((_, j) => j !== n) }))}>Entfernen</Button>}
              </div>
            </div>
            {p.art === "gesellschaft" ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2"><Feld id={`${liste}-${n}-gn`} beschriftung="Gesellschaft" pflicht><Eingabe disabled={gesperrt} value={p.gesellschaft_name} onChange={(e) => setP(n, { gesellschaft_name: e.target.value })} /></Feld></div>
                <Feld id={`${liste}-${n}-rf`} beschriftung="Rechtsform"><Eingabe disabled={gesperrt} value={p.gesellschaft_rechtsform} onChange={(e) => setP(n, { gesellschaft_rechtsform: e.target.value })} /></Feld>
                <Feld id={`${liste}-${n}-reg`} beschriftung="Register"><Eingabe disabled={gesperrt} placeholder="HRB …" value={p.gesellschaft_register} onChange={(e) => setP(n, { gesellschaft_register: e.target.value })} /></Feld>
                <Feld id={`${liste}-${n}-sitz`} beschriftung="Sitz"><Eingabe disabled={gesperrt} value={p.gesellschaft_sitz} onChange={(e) => setP(n, { gesellschaft_sitz: e.target.value })} /></Feld>
                <div className="sm:col-span-3"><Feld id={`${liste}-${n}-vert`} beschriftung="Vertreten durch"><Eingabe disabled={gesperrt} value={p.vertreter} onChange={(e) => setP(n, { vertreter: e.target.value })} /></Feld></div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-6">
                <Feld id={`${liste}-${n}-anr`} beschriftung="Anrede"><Eingabe disabled={gesperrt} value={p.anrede} onChange={(e) => setP(n, { anrede: e.target.value })} /></Feld>
                <div className="sm:col-span-2"><Feld id={`${liste}-${n}-vn`} beschriftung="Vorname"><Eingabe disabled={gesperrt} value={p.vorname} onChange={(e) => setP(n, { vorname: e.target.value })} /></Feld></div>
                <div className="sm:col-span-3"><Feld id={`${liste}-${n}-nn`} beschriftung="Nachname" pflicht><Eingabe disabled={gesperrt} value={p.nachname} onChange={(e) => setP(n, { nachname: e.target.value })} /></Feld></div>
                <Feld id={`${liste}-${n}-gd`} beschriftung="Geburtsdatum"><Eingabe type="date" disabled={gesperrt} value={p.geburtsdatum} onChange={(e) => setP(n, { geburtsdatum: e.target.value })} /></Feld>
                <div className="sm:col-span-2"><Feld id={`${liste}-${n}-gname`} beschriftung="Geburtsname"><Eingabe disabled={gesperrt} value={p.geburtsname} onChange={(e) => setP(n, { geburtsname: e.target.value })} /></Feld></div>
                <div className="sm:col-span-3"><Feld id={`${liste}-${n}-stid`} beschriftung="Steuer-ID"><Eingabe disabled={gesperrt} value={p.steuer_id} onChange={(e) => setP(n, { steuer_id: e.target.value })} /></Feld></div>
                <div className="sm:col-span-2"><Feld id={`${liste}-${n}-fs`} beschriftung="Familienstand"><Eingabe disabled={gesperrt} value={p.familienstand} onChange={(e) => setP(n, { familienstand: e.target.value })} /></Feld></div>
                <div className="sm:col-span-4 flex flex-wrap items-end gap-4 pb-2">
                  <Ja disabled={gesperrt} wert={p.ehepartner_beteiligt} onChange={(v) => setP(n, { ehepartner_beteiligt: v })} text={liste === "verkaeufer" ? "Ehepartner verkauft mit" : "Ehepartner kauft mit"} />
                  <Ja disabled={gesperrt} wert={p.ehevertrag} onChange={(v) => setP(n, { ehevertrag: v })} text="Ehevertrag vorhanden" />
                  <Ja disabled={gesperrt} wert={p.ehe_auslandsbezug} onChange={(v) => setP(n, { ehe_auslandsbezug: v })} text="Ehe mit Auslandsbezug" />
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-3"><Feld id={`${liste}-${n}-str`} beschriftung="Straße, Nr."><Eingabe disabled={gesperrt} value={p.strasse} onChange={(e) => setP(n, { strasse: e.target.value })} /></Feld></div>
              <Feld id={`${liste}-${n}-plz`} beschriftung="PLZ"><Eingabe disabled={gesperrt} value={p.plz} onChange={(e) => setP(n, { plz: e.target.value })} /></Feld>
              <div className="sm:col-span-2"><Feld id={`${liste}-${n}-ort`} beschriftung="Ort"><Eingabe disabled={gesperrt} value={p.ort} onChange={(e) => setP(n, { ort: e.target.value })} /></Feld></div>
              <div className="sm:col-span-3"><Feld id={`${liste}-${n}-tel`} beschriftung="Telefon"><Eingabe disabled={gesperrt} value={p.telefon} onChange={(e) => setP(n, { telefon: e.target.value })} /></Feld></div>
              <div className="sm:col-span-3"><Feld id={`${liste}-${n}-mail`} beschriftung="E-Mail"><Eingabe type="email" disabled={gesperrt} value={p.email} onChange={(e) => setP(n, { email: e.target.value })} /></Feld></div>
            </div>
            <details>
              <summary className="cursor-pointer text-[12px] text-gedaempft">Weitere Angaben (Dolmetscher, Einschränkungen, PEP, Treuhand, Unternehmer)</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Feld id={`${liste}-${n}-ke`} beschriftung="Körperlich eingeschränkt (was?)"><Eingabe disabled={gesperrt} value={p.koerperlich_eingeschraenkt} onChange={(e) => setP(n, { koerperlich_eingeschraenkt: e.target.value })} /></Feld>
                <Feld id={`${liste}-${n}-dol`} beschriftung="Dolmetscher (Sprache)"><Eingabe disabled={gesperrt} value={p.dolmetscher_sprache} onChange={(e) => setP(n, { dolmetscher_sprache: e.target.value })} /></Feld>
                <Ja disabled={gesperrt} wert={p.politisch_exponiert} onChange={(v) => setP(n, { politisch_exponiert: v })} text="Politisch exponierte Person" />
                <Ja disabled={gesperrt} wert={p.handelt_fremde_rechnung} onChange={(v) => setP(n, { handelt_fremde_rechnung: v })} text="Handelt für fremde Rechnung" />
                <Ja disabled={gesperrt} wert={p.handelt_als_unternehmer} onChange={(v) => setP(n, { handelt_als_unternehmer: v })} text="Handelt als Unternehmer" />
                <div className="sm:col-span-2"><Feld id={`${liste}-${n}-bem`} beschriftung="Freitext"><Textfeld rows={2} disabled={gesperrt} value={p.bemerkung} onChange={(e) => setP(n, { bemerkung: e.target.value })} /></Feld></div>
              </div>
            </details>
          </div>
        ))}
        {!gesperrt && <Button type="button" variante="sekundaer" groesse="klein" onClick={() => setL((alt) => ({ ...alt, [liste]: [...alt[liste], leerePartei()] }))}>Weitere Person</Button>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <nav aria-label="Schritte" className="flex flex-wrap gap-1.5">
        {SCHRITTE.map((x) => (
          <button key={x.nr} type="button" onClick={() => setSchritt(x.nr)} className={`rounded-[var(--radius)] border px-3 py-1.5 text-[12px] ${schritt === x.nr ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft hover:text-text"}`}>
            {x.nr}. {x.titel}
          </button>
        ))}
      </nav>

      {schritt === 1 && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2"><Feld id="lz-bez" beschriftung="Bezeichnung des Laufzettels"><Eingabe disabled={gesperrt} value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="lz-anschrift" beschriftung="Anschrift" pflicht><Eingabe disabled={gesperrt} value={i.anschrift} onChange={(e) => setI({ anschrift: e.target.value })} /></Feld></div>
          <Feld id="lz-plz" beschriftung="PLZ"><Eingabe disabled={gesperrt} value={i.plz} onChange={(e) => setI({ plz: e.target.value })} /></Feld>
          <Feld id="lz-ort" beschriftung="Ort"><Eingabe disabled={gesperrt} value={i.ort} onChange={(e) => setI({ ort: e.target.value })} /></Feld>
          <Feld id="lz-gba" beschriftung="Grundbuchamt"><Eingabe disabled={gesperrt} value={i.grundbuch_amt} onChange={(e) => setI({ grundbuch_amt: e.target.value })} /></Feld>
          <Feld id="lz-gbb" beschriftung="Grundbuchblatt"><Eingabe disabled={gesperrt} value={i.grundbuch_blatt} onChange={(e) => setI({ grundbuch_blatt: e.target.value })} /></Feld>
          <Feld id="lz-gem" beschriftung="Gemarkung"><Eingabe disabled={gesperrt} value={i.gemarkung} onChange={(e) => setI({ gemarkung: e.target.value })} /></Feld>
          <Feld id="lz-flur" beschriftung="Flur"><Eingabe disabled={gesperrt} value={i.flur} onChange={(e) => setI({ flur: e.target.value })} /></Feld>
          <Feld id="lz-flst" beschriftung="Flurstück"><Eingabe disabled={gesperrt} value={i.flurstueck} onChange={(e) => setI({ flurstueck: e.target.value })} /></Feld>
          <Feld id="lz-qm" beschriftung="Größe (m²)"><Eingabe disabled={gesperrt} value={i.groesse_qm} onChange={(e) => setI({ groesse_qm: e.target.value })} /></Feld>
          <Feld id="lz-bebaut" beschriftung="Grundstück">
            <Auswahl disabled={gesperrt} value={i.bebaut} onChange={(e) => setI({ bebaut: e.target.value as "bebaut" | "unbebaut" })}><option value="bebaut">bebaut</option><option value="unbebaut">unbebaut</option></Auswahl>
          </Feld>
          <div className="sm:col-span-4 flex flex-wrap gap-4"><Ja disabled={gesperrt} wert={i.wohnungseigentum} onChange={(v) => setI({ wohnungseigentum: v })} text="Wohnungseigentum" /><Ja disabled={gesperrt} wert={i.vermietet} onChange={(v) => setI({ vermietet: v })} text="Vermietet" /><Ja disabled={gesperrt} wert={i.denkmalschutz} onChange={(v) => setI({ denkmalschutz: v })} text="Denkmalschutz" /><Ja disabled={gesperrt} wert={i.bodendenkmal} onChange={(v) => setI({ bodendenkmal: v })} text="Bodendenkmal" /><Ja disabled={gesperrt} wert={i.fertiggestellt_5_jahre} onChange={(v) => setI({ fertiggestellt_5_jahre: v })} text="Fertiggestellt/saniert vor weniger als 5 Jahren" /><Ja disabled={gesperrt} wert={i.energieausweis_liegt_vor} onChange={(v) => setI({ energieausweis_liegt_vor: v })} text="Energieausweis liegt vor" /></div>
          {i.wohnungseigentum && (<>
            <Feld id="lz-se" beschriftung="Sondereigentum Nr."><Eingabe disabled={gesperrt} value={i.sondereigentum_nr} onChange={(e) => setI({ sondereigentum_nr: e.target.value })} /></Feld>
            <Feld id="lz-mea" beschriftung="Miteigentumsanteil"><Eingabe disabled={gesperrt} placeholder="z. B. 123/10.000" value={i.miteigentumsanteil} onChange={(e) => setI({ miteigentumsanteil: e.target.value })} /></Feld>
            <div className="sm:col-span-2"><Feld id="lz-snr" beschriftung="Sondernutzungsrechte (Keller, Stellplatz, Garten …)"><Eingabe disabled={gesperrt} value={i.sondernutzungsrechte} onChange={(e) => setI({ sondernutzungsrechte: e.target.value })} /></Feld></div>
            <div className="sm:col-span-2"><Feld id="lz-vw" beschriftung="Verwalter"><Eingabe disabled={gesperrt} value={i.verwalter_name} onChange={(e) => setI({ verwalter_name: e.target.value })} /></Feld></div>
            <div className="sm:col-span-2"><Feld id="lz-vwa" beschriftung="Anschrift Verwalter"><Eingabe disabled={gesperrt} value={i.verwalter_anschrift} onChange={(e) => setI({ verwalter_anschrift: e.target.value })} /></Feld></div>
          </>)}
          {i.vermietet && (<>
            <div className="sm:col-span-2"><Feld id="lz-mieter" beschriftung="Mieter"><Eingabe disabled={gesperrt} value={i.mieter_name} onChange={(e) => setI({ mieter_name: e.target.value })} /></Feld></div>
            <div className="sm:col-span-2 flex items-end pb-2"><Ja disabled={gesperrt} wert={i.mieter_vorkaufsrecht} onChange={(v) => setI({ mieter_vorkaufsrecht: v })} text="Vorkaufsrecht des Mieters (§ 577 BGB) prüfen" /></div>
          </>)}
          <div className="sm:col-span-3"><Feld id="lz-bv" beschriftung="Bauliche Veränderungen / Genehmigungen"><Eingabe disabled={gesperrt} value={i.bauliche_veraenderungen} onChange={(e) => setI({ bauliche_veraenderungen: e.target.value })} /></Feld></div>
          <Feld id="lz-lb" beschriftung="Letzte Besichtigung"><Eingabe type="date" disabled={gesperrt} value={i.letzte_besichtigung} onChange={(e) => setI({ letzte_besichtigung: e.target.value })} /></Feld>
        </div>
      )}

      {schritt === 2 && parteien("verkaeufer", "Verkäufer")}
      {schritt === 3 && parteien("kaeufer", "Käufer")}

      {schritt === 4 && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Feld id="kp-gesamt" beschriftung="Gesamtkaufpreis (€)" pflicht><Eingabe disabled={gesperrt} inputMode="decimal" value={k.gesamt} onChange={(e) => setK({ gesamt: e.target.value })} /></Feld>
          <Feld id="kp-bew" beschriftung="Davon bewegliche Sachen (€)"><Eingabe disabled={gesperrt} value={k.davon_bewegliche} onChange={(e) => setK({ davon_bewegliche: e.target.value })} /></Feld>
          <div className="sm:col-span-2"><Feld id="kp-bewart" beschriftung="Art der beweglichen Sachen"><Eingabe disabled={gesperrt} placeholder="Einbauküche, Möbel …" value={k.bewegliche_art} onChange={(e) => setK({ bewegliche_art: e.target.value })} /></Feld></div>
          <Feld id="kp-grund" beschriftung="Aufteilung Grund (€)"><Eingabe disabled={gesperrt} value={k.aufteilung_grund} onChange={(e) => setK({ aufteilung_grund: e.target.value })} /></Feld>
          <Feld id="kp-geb" beschriftung="Aufteilung Gebäude (€)"><Eingabe disabled={gesperrt} value={k.aufteilung_gebaeude} onChange={(e) => setK({ aufteilung_gebaeude: e.target.value })} /></Feld>
          <div className="sm:col-span-2"><Feld id="kp-quoten" beschriftung="Erwerbsquoten der Käufer" hinweis="z. B. je zur Hälfte"><Eingabe disabled={gesperrt} value={k.erwerb_quoten} onChange={(e) => setK({ erwerb_quoten: e.target.value })} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="kp-zeit" beschriftung="Zahlungszeitpunkt"><Eingabe disabled={gesperrt} placeholder="nach Fälligkeitsmitteilung des Notars" value={k.zahlungszeitpunkt} onChange={(e) => setK({ zahlungszeitpunkt: e.target.value })} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="kp-gel" beschriftung="Bereits geleistete Zahlungen (€)"><Eingabe disabled={gesperrt} value={k.bereits_geleistet} onChange={(e) => setK({ bereits_geleistet: e.target.value })} /></Feld></div>
          <Feld id="kp-fin" beschriftung="Finanzierung">
            <Auswahl disabled={gesperrt} value={k.finanzierung} onChange={(e) => setK({ finanzierung: e.target.value as "eigenmittel" | "bank" | "gemischt" })}><option value="eigenmittel">Eigenmittel</option><option value="bank">Bank</option><option value="gemischt">gemischt</option></Auswahl>
          </Feld>
          {k.finanzierung !== "eigenmittel" && (<>
            <Feld id="kp-bank" beschriftung="Bank" pflicht><Eingabe disabled={gesperrt} value={k.bank_name} onChange={(e) => setK({ bank_name: e.target.value })} /></Feld>
            <div className="sm:col-span-2"><Feld id="kp-banka" beschriftung="Anschrift der Bank"><Eingabe disabled={gesperrt} value={k.bank_anschrift} onChange={(e) => setK({ bank_anschrift: e.target.value })} /></Feld></div>
            <div className="sm:col-span-4"><Feld id="kp-gs" beschriftung="Grundschuldregelung / Finanzierungsvollmacht"><Eingabe disabled={gesperrt} value={k.grundschuld_regelung} onChange={(e) => setK({ grundschuld_regelung: e.target.value })} /></Feld></div>
          </>)}
          <Feld id="kp-lasten" beschriftung="Eingetragene Lasten (Abt. III)">
            <Auswahl disabled={gesperrt} value={k.lasten_belassen} onChange={(e) => setK({ lasten_belassen: e.target.value as "loeschen" | "belassen" | "nicht_sicher" })}><option value="loeschen">löschen</option><option value="belassen">belassen</option><option value="nicht_sicher">noch nicht sicher</option></Auswahl>
          </Feld>
          <Feld id="kp-raeum" beschriftung="Räumung / Übergabe">
            <Auswahl disabled={gesperrt} value={k.raeumung} onChange={(e) => setK({ raeumung: e.target.value as "schnellstmoeglich" | "datum" | "vermietet" })}><option value="schnellstmoeglich">schnellstmöglich nach Zahlung</option><option value="datum">nach Datum</option><option value="vermietet">vermietet, Mietverhältnis geht über</option></Auswahl>
          </Feld>
          {k.raeumung === "datum" && <Feld id="kp-rbis" beschriftung="Räumung bis"><Eingabe type="date" disabled={gesperrt} value={k.raeumung_bis} onChange={(e) => setK({ raeumung_bis: e.target.value })} /></Feld>}
          <Feld id="kp-verm" beschriftung="Vermessungskosten trägt">
            <Auswahl disabled={gesperrt} value={k.vermessungskosten_traeger} onChange={(e) => setK({ vermessungskosten_traeger: e.target.value as "kaeufer" | "verkaeufer" | "je_haelfte" })}><option value="kaeufer">Käufer</option><option value="verkaeufer">Verkäufer</option><option value="je_haelfte">je zur Hälfte</option></Auswahl>
          </Feld>
        </div>
      )}

      {schritt === 5 && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2"><Feld id="so-kanzlei" beschriftung="Notariat / Kanzlei" pflicht><Eingabe disabled={gesperrt} value={s.notar_kanzlei} onChange={(e) => setS({ notar_kanzlei: e.target.value })} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="so-notar" beschriftung="Notar/Notarin"><Eingabe disabled={gesperrt} value={s.notar_name} onChange={(e) => setS({ notar_name: e.target.value })} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="so-na" beschriftung="Anschrift"><Eingabe disabled={gesperrt} value={s.notar_anschrift} onChange={(e) => setS({ notar_anschrift: e.target.value })} /></Feld></div>
          <div className="sm:col-span-2"><Feld id="so-ne" beschriftung="E-Mail des Notariats"><Eingabe type="email" disabled={gesperrt} value={s.notar_email} onChange={(e) => setS({ notar_email: e.target.value })} /></Feld></div>
          <Feld id="so-pk" beschriftung="Maklerprovision Käufer"><Eingabe disabled={gesperrt} placeholder="z. B. 1,785 %" value={s.makler_provision_kaeufer} onChange={(e) => setS({ makler_provision_kaeufer: e.target.value })} /></Feld>
          <Feld id="so-pv" beschriftung="Maklerprovision Verkäufer"><Eingabe disabled={gesperrt} value={s.makler_provision_verkaeufer} onChange={(e) => setS({ makler_provision_verkaeufer: e.target.value })} /></Feld>
          <div className="sm:col-span-2 flex items-end pb-2"><Ja disabled={gesperrt} wert={s.kaeufer_verkaeufer_verwandt} onChange={(v) => setS({ kaeufer_verkaeufer_verwandt: v })} text="Käufer und Verkäufer sind verwandt" /></div>
          {s.kaeufer_verkaeufer_verwandt && <div className="sm:col-span-4"><Feld id="so-verw" beschriftung="Verwandtschaftsverhältnis"><Eingabe disabled={gesperrt} value={s.verwandtschaft} onChange={(e) => setS({ verwandtschaft: e.target.value })} /></Feld></div>}
          <div className="sm:col-span-4"><Feld id="so-rep" beschriftung="Reparaturen, die der Verkäufer noch ausführt"><Textfeld rows={2} disabled={gesperrt} value={s.reparaturen_durch_verkaeufer} onChange={(e) => setS({ reparaturen_durch_verkaeufer: e.target.value })} /></Feld></div>
          <div className="sm:col-span-4"><Feld id="so-bes" beschriftung="Besonderheiten / Wünsche an den Vertrag"><Textfeld rows={3} disabled={gesperrt} value={s.besonderheiten} onChange={(e) => setS({ besonderheiten: e.target.value })} /></Feld></div>
        </div>
      )}

      {schritt === 6 && (
        <div className="space-y-4">
          {anhaenge.length === 0 ? <p className="text-[13px] text-gedaempft">Noch keine Anhänge.</p> : (
            <ul className="divide-y divide-linie">
              {anhaenge.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] text-text"><Marke>{ANHANG_KATEGORIEN[a.kategorie] ?? a.kategorie}</Marke> <span className="ml-1">{a.name}</span></p>
                    <p className="text-[12px] text-gedaempft">{zeitpunkt(a.hochgeladen_am)}{a.ki_auswertung ? " · ausgewertet" : ""}</p>
                    {a.ki_auswertung && <pre className="mt-1 whitespace-pre-wrap rounded-[var(--radius)] bg-grund p-2 text-[12px] text-text">{a.ki_auswertung}</pre>}
                  </div>
                  {!gesperrt && (
                    <form action={wegAktion}><input type="hidden" name="id" value={id} /><input type="hidden" name="anhang_id" value={a.id} /><Button type="submit" variante="leise" groesse="klein">Entfernen</Button></form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {weg.fehler && <Hinweis ton="fehler">{weg.fehler}</Hinweis>}
          {!gesperrt && (
            <form action={anhangAktion} className="grid gap-3 rounded-[var(--radius)] border border-dashed border-linie p-3 sm:grid-cols-3">
              <input type="hidden" name="id" value={id} />
              <Feld id="an-kat" beschriftung="Kategorie">
                <Auswahl name="kategorie" defaultValue="grundbuchauszug">{Object.entries(ANHANG_KATEGORIEN).map(([kk, v]) => <option key={kk} value={kk}>{v}</option>)}</Auswahl>
              </Feld>
              <Feld id="an-datei" beschriftung="Datei (PDF oder Bild, bis 25 MB)"><input type="file" name="datei" accept="application/pdf,image/*" className="block text-[13px]" /></Feld>
              <div className="flex flex-col justify-end gap-2">
                {kiVerfuegbar && <label className="flex items-center gap-2 text-[13px] text-text"><input type="checkbox" name="mit_ki" value="1" defaultChecked /> PDF per KI auswerten (5 Credits)</label>}
                <Button type="submit" variante="sekundaer" groesse="klein" laedt={laedtHoch}>Hochladen</Button>
              </div>
              {anhang.fehler && <Hinweis ton="fehler" className="sm:col-span-3">{anhang.fehler}</Hinweis>}
              {anhang.erfolg && <Hinweis ton="erfolg" className="sm:col-span-3">{anhang.erfolg}</Hinweis>}
            </form>
          )}
          <p className="text-[12px] text-gedaempft">Grundbuchauszug, Flurkarte, Teilungserklärung: Die Anforderung bei den Ämtern übernimmt der Makler mit der Vollmacht aus dem Maklervertrag.</p>
        </div>
      )}

      {schritt === 7 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Feld id="be-art" beschriftung="Was soll das Notariat tun?">
            <Auswahl disabled={gesperrt} value={b.art} onChange={(e) => setB({ art: e.target.value as "entwurf" | "vorabinfo" })}><option value="entwurf">Vertragsentwurf vorbereiten (kostenpflichtig)</option><option value="vorabinfo">Nur Vorabinformation, noch kein Entwurf</option></Auswahl>
          </Feld>
          <Feld id="be-weg" beschriftung="Versandweg des Entwurfs">
            <Auswahl disabled={gesperrt} value={b.versandweg} onChange={(e) => setB({ versandweg: e.target.value as "email" | "post" })}><option value="email">E-Mail</option><option value="post">Post</option></Auswahl>
          </Feld>
          <div className="sm:col-span-2 flex flex-wrap gap-4">
            <Ja disabled={gesperrt} wert={b.entwurf_an.verkaeufer} onChange={(v) => setB({ entwurf_an: { ...b.entwurf_an, verkaeufer: v } })} text="Entwurf an Verkäufer" />
            <Ja disabled={gesperrt} wert={b.entwurf_an.kaeufer} onChange={(v) => setB({ entwurf_an: { ...b.entwurf_an, kaeufer: v } })} text="Entwurf an Käufer" />
            <Ja disabled={gesperrt} wert={b.entwurf_an.makler} onChange={(v) => setB({ entwurf_an: { ...b.entwurf_an, makler: v } })} text="Entwurf an Makler" />
            <Ja disabled={gesperrt} wert={b.besprechungstermin_gewuenscht} onChange={(v) => setB({ besprechungstermin_gewuenscht: v })} text="Besprechungstermin gewünscht" />
          </div>
          {b.besprechungstermin_gewuenscht && <Feld id="be-termin" beschriftung="Terminvorschlag"><Eingabe disabled={gesperrt} value={b.besprechungstermin} onChange={(e) => setB({ besprechungstermin: e.target.value })} /></Feld>}
          <Feld id="be-name" beschriftung="Ansprechpartner (Makler)" pflicht><Eingabe disabled={gesperrt} value={b.ausfueller_name} onChange={(e) => setB({ ausfueller_name: e.target.value })} /></Feld>
          <Feld id="be-tel" beschriftung="Telefon"><Eingabe disabled={gesperrt} value={b.ausfueller_telefon} onChange={(e) => setB({ ausfueller_telefon: e.target.value })} /></Feld>
          <Feld id="be-mail" beschriftung="E-Mail"><Eingabe type="email" disabled={gesperrt} value={b.ausfueller_email} onChange={(e) => setB({ ausfueller_email: e.target.value })} /></Feld>
        </div>
      )}

      {schritt === 8 && (
        <div className="space-y-4">
          {fehlt.length > 0 ? <Hinweis ton="warnung" titel="Noch nicht ausgefüllt"><ul className="list-disc pl-5">{fehlt.map((f) => <li key={f}>{f}</li>)}</ul></Hinweis> : <Hinweis ton="erfolg">Alle Pflichtangaben sind vorhanden.</Hinweis>}
          <div className="flex flex-wrap gap-2">
            <a href={`/api/dokumente/laufzettel/${id}?format=pdf`} target="_blank" rel="noreferrer" className={buttonKlassen({ variante: "sekundaer" })}>PDF öffnen</a>
            <a href={`/api/dokumente/laufzettel/${id}?format=docx`} className={buttonKlassen({ variante: "sekundaer" })}>Word herunterladen</a>
            <form action={briefAktion}><input type="hidden" name="id" value={id} /><Button type="submit" variante="sekundaer" laedt={schreibt}>Begleitschreiben an das Notariat</Button></form>
          </div>
          {brief.fehler && <Hinweis ton="fehler">{brief.fehler}</Hinweis>}
          {brief.text && (
            <div className="space-y-2 rounded-[var(--radius)] border border-linie bg-flaeche p-3">
              <p className="text-[13px] font-medium text-text">Betreff: {brief.betreff}</p>
              <pre className="whitespace-pre-wrap text-[13px] text-text">{brief.text}</pre>
              <a href={`mailto:${encodeURIComponent(s.notar_email)}?subject=${encodeURIComponent(brief.betreff ?? "")}&body=${encodeURIComponent(brief.text)}`} className={buttonKlassen({ variante: "sekundaer", groesse: "klein" })}>Im E-Mail-Programm öffnen</a>
              <p className="text-[12px] text-gedaempft">PDF und Word bitte als Anhang beifügen. Der Status wechselt auf „An Notar versendet“, wenn Sie ihn unten setzen.</p>
            </div>
          )}
          {darfFreigeben && status !== "abgeschlossen" && (
            <form action={statusAktion} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={id} />
              <Auswahl name="status" defaultValue={status === "entwurf" ? "bereit" : status === "bereit" ? "versendet" : "abgeschlossen"} className="w-auto">
                {(Object.keys(STATUS) as LaufzettelStatus[]).map((st) => <option key={st} value={st}>{STATUS[st]}</option>)}
              </Auswahl>
              <Button type="submit" laedt={aendert}>Status setzen</Button>
              {stat.fehler && <Marke ton="fehler">{stat.fehler}</Marke>}
              {stat.erfolg && <Marke ton="erfolg">{stat.erfolg}</Marke>}
            </form>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-4">
        <div className="flex gap-2">
          <Button type="button" variante="leise" groesse="klein" disabled={schritt === 1} onClick={() => setSchritt((x) => Math.max(1, x - 1))}>Zurück</Button>
          <Button type="button" variante="leise" groesse="klein" disabled={schritt === SCHRITTE.length} onClick={() => setSchritt((x) => Math.min(SCHRITTE.length, x + 1))}>Weiter</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {speichern.fehler && <Marke ton="fehler">{speichern.fehler}</Marke>}
          {speichern.erfolg && <Marke ton="erfolg">{speichern.erfolg}</Marke>}
          {!gesperrt && (
            <>
              <form action={speichernAktion}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="bezeichnung" value={bezeichnung} />
                <input type="hidden" name="daten" value={JSON.stringify(l)} />
                <Button type="submit" laedt={speichert}>Speichern</Button>
              </form>
              <form action={laufzettelLoeschen} onSubmit={(e) => { if (!window.confirm("Diesen Laufzettel wirklich löschen?")) e.preventDefault(); }}>
                <input type="hidden" name="id" value={id} />
                <Button type="submit" variante="gefahr" groesse="klein">Löschen</Button>
              </form>
            </>
          )}
          <Link href="/notar" className="text-[13px] text-akzent hover:underline">Zur Übersicht</Link>
        </div>
      </div>
    </div>
  );
}
