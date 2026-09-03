"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { StufeWechsel } from "@/components/akquise/StufeWechsel";
import { Button, buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { preisRechnen, provisionsErwartung, WERTINDIKATION_HINWEIS, type Wertindikation } from "@/lib/akquise/preisfinder";
import { AKTIVITAET_TYPEN, LEAD_STATUS, leadAdresse, OBJEKTARTEN, PROVISIONSARTEN, ZEITRAEUME, ZUSTAENDE, type Aktivitaet, type Einstellungen, type Kampagne, type LeadZeile, type Provisionsart, type Quelle, type Stufe, type Vorlage } from "@/lib/akquise/stammdaten";
import { datum, euro, zeitpunkt } from "@/lib/format";
import { aktivitaetAnlegen, aktivitaetErledigen, leadKontaktAnlegen, leadLoeschen, leadMailEntwerfen, leadSpeichern, leadWertermittlung, leadZuObjekt, preisfinderSpeichern, type AkquiseErgebnis } from "@/server/akquise-aktionen";

const REITER = [["info", "Info"], ["preis", "Preis-Finder"], ["aktivitaeten", "Aktivitäten"], ["dossier", "Dossier"], ["historie", "Historie"]] as const;
type Reiter = (typeof REITER)[number][0];

export interface DossierDaten {
  lead: LeadZeile;
  stufen: Stufe[];
  quellen: Quelle[];
  kampagnen: Kampagne[];
  kontakte: { id: string; name: string }[];
  benutzer: { id: string; name: string }[];
  kontakt: { id: string; name: string; email: string | null; telefon: string | null } | null;
  tippgeber: { id: string; name: string } | null;
  objekt: { id: string; objektnummer: string; bezeichnung: string; status: string } | null;
  wertermittlung: { id: string; bezeichnung: string } | null;
  aufnahme: { id: string; bezeichnung: string } | null;
  aktivitaeten: Aktivitaet[];
  historie: Array<{ id: string; feld: string; alt: string | null; neu: string | null; erstellt_am: string; benutzer: { name: string } | null }>;
  laeufe: Array<{ id: string; geplant_am: string; status: string; automation: { name: string | null; kanal: string } | null }>;
  vorlagen: Vorlage[];
  indikation: Wertindikation;
  einstellungen: Einstellungen;
  postfachVorhanden: boolean;
  darfAendern: boolean;
  darfLoeschen: boolean;
  darfObjekt: boolean;
  darfWertermittlung: boolean;
}

/** Lead-Dossier (Referenz „Info · MPE · Dossier · Dokumente"): alle Reiter eines Leads. */
export function LeadDossier(d: DossierDaten) {
  const [reiter, setReiter] = useState<Reiter>("info");
  const l = d.lead;
  const stufe = d.stufen.find((s) => s.id === l.stufe_id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Marke ton={l.status === "gewonnen" ? "erfolg" : l.status === "verloren" ? "fehler" : "info"}>{LEAD_STATUS[l.status]}{l.verlustgrund ? ` · ${l.verlustgrund}` : ""}</Marke>
        {stufe && <Marke>{stufe.name}{!stufe.ist_gewonnen && !stufe.ist_verloren ? ` · ${stufe.wahrscheinlichkeit} %` : ""}</Marke>}
        {l.provision_erwartet ? <Marke ton="akzent">Provision {euro(l.provision_erwartet)}</Marke> : null}
        {d.darfAendern && <div className="ml-auto"><StufeWechsel leadId={l.id} stufeId={l.stufe_id} stufen={d.stufen} verlustgruende={d.einstellungen.verlustgruende} /></div>}
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-linie pb-2">
        {REITER.map(([k, b]) => (
          <button key={k} type="button" onClick={() => setReiter(k)} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${reiter === k ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{b}{k === "aktivitaeten" && d.aktivitaeten.some((a) => !a.erledigt_am) ? ` (${d.aktivitaeten.filter((a) => !a.erledigt_am).length})` : ""}</button>
        ))}
      </div>
      {reiter === "info" && <Info {...d} />}
      {reiter === "preis" && <PreisFinder {...d} />}
      {reiter === "aktivitaeten" && <Aktivitaeten {...d} />}
      {reiter === "dossier" && <Dossier {...d} />}
      {reiter === "historie" && <Historie {...d} />}
    </div>
  );
}

function Info(d: DossierDaten) {
  const l = d.lead;
  const [erg, aktion, laeuft] = useActionState<AkquiseErgebnis, FormData>(leadSpeichern, {});
  const gesperrt = !d.darfAendern;
  return (
    <form action={aktion} className="grid gap-3 sm:grid-cols-6">
      <input type="hidden" name="id" value={l.id} />
      <div className="sm:col-span-4"><Feld id="li-titel" beschriftung="Titel" pflicht><Eingabe name="titel" defaultValue={l.titel} readOnly={gesperrt} required /></Feld></div>
      <Feld id="li-objektart" beschriftung="Objektart"><Auswahl name="objektart" defaultValue={l.objektart ?? ""} disabled={gesperrt}><option value="">—</option>{OBJEKTARTEN.map((o) => <option key={o} value={o}>{o}</option>)}{l.objektart && !OBJEKTARTEN.includes(l.objektart as (typeof OBJEKTARTEN)[number]) && <option value={l.objektart}>{l.objektart}</option>}</Auswahl></Feld>
      <Feld id="li-zeitraum" beschriftung="Verkaufszeitraum"><Auswahl name="verkaufszeitraum" defaultValue={l.verkaufszeitraum ?? ""} disabled={gesperrt}><option value="">—</option>{ZEITRAEUME.map((z) => <option key={z} value={z}>{z}</option>)}</Auswahl></Feld>
      <div className="sm:col-span-2"><Feld id="li-strasse" beschriftung="Straße"><Eingabe name="strasse" defaultValue={l.strasse ?? ""} readOnly={gesperrt} /></Feld></div>
      <Feld id="li-hausnummer" beschriftung="Nr."><Eingabe name="hausnummer" defaultValue={l.hausnummer ?? ""} readOnly={gesperrt} /></Feld>
      <Feld id="li-plz" beschriftung="PLZ"><Eingabe name="plz" defaultValue={l.plz ?? ""} readOnly={gesperrt} /></Feld>
      <div className="sm:col-span-2"><Feld id="li-ort" beschriftung="Ort"><Eingabe name="ort" defaultValue={l.ort ?? ""} readOnly={gesperrt} /></Feld></div>
      <Feld id="li-wohnflaeche" beschriftung="Wohnfläche (m²)"><Eingabe name="wohnflaeche" defaultValue={l.wohnflaeche ?? ""} readOnly={gesperrt} inputMode="decimal" /></Feld>
      <Feld id="li-grundstueck" beschriftung="Grundstück (m²)"><Eingabe name="grundstueck" defaultValue={l.grundstueck ?? ""} readOnly={gesperrt} inputMode="decimal" /></Feld>
      <Feld id="li-baujahr" beschriftung="Baujahr"><Eingabe name="baujahr" defaultValue={l.baujahr ?? ""} readOnly={gesperrt} inputMode="numeric" /></Feld>
      <Feld id="li-zustand" beschriftung="Zustand"><Auswahl name="zustand" defaultValue={l.zustand ?? ""} disabled={gesperrt}><option value="">—</option>{Object.entries(ZUSTAENDE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
      <div className="sm:col-span-2"><Feld id="li-kontakt" beschriftung="Eigentümer"><Auswahl name="kontakt_id" defaultValue={l.kontakt_id ?? ""} disabled={gesperrt}><option value="">— ohne —</option>{d.kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Auswahl></Feld></div>
      <div className="sm:col-span-2"><Feld id="li-tippgeber" beschriftung="Tippgeber"><Auswahl name="tippgeber_kontakt_id" defaultValue={l.tippgeber_kontakt_id ?? ""} disabled={gesperrt}><option value="">—</option>{d.kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Auswahl></Feld></div>
      <div className="sm:col-span-2"><Feld id="li-quelle" beschriftung="Quelle"><Auswahl name="quelle_id" defaultValue={l.quelle_id ?? ""} disabled={gesperrt}><option value="">—</option>{d.quellen.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</Auswahl></Feld></div>
      <div className="sm:col-span-2"><Feld id="li-kampagne" beschriftung="Kampagne"><Auswahl name="kampagne_id" defaultValue={l.kampagne_id ?? ""} disabled={gesperrt}><option value="">—</option>{d.kampagnen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Auswahl></Feld></div>
      <div className="sm:col-span-2"><Feld id="li-zustaendig" beschriftung="Zuständig"><Auswahl name="zustaendig_id" defaultValue={l.zustaendig_id ?? ""} disabled={gesperrt}><option value="">—</option>{d.benutzer.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Auswahl></Feld></div>
      <Feld id="li-nachfassen" beschriftung="Nachfassen"><Auswahl name="nachfassen" defaultValue={l.nachfassen ? "1" : "0"} disabled={gesperrt}><option value="1">ja</option><option value="0">nein</option></Auswahl></Feld>
      <Feld id="li-nachfassen-am" beschriftung="Nachfassen am"><Eingabe name="nachfassen_am" type="date" defaultValue={l.nachfassen_am ?? ""} readOnly={gesperrt} /></Feld>
      <div className="sm:col-span-6"><Feld id="li-notiz" beschriftung="Notiz"><Textfeld name="notiz" rows={4} defaultValue={l.notiz ?? ""} readOnly={gesperrt} /></Feld></div>
      {erg.fehler && <Hinweis ton="fehler" className="sm:col-span-6">{erg.fehler}</Hinweis>}
      {erg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-6">{erg.erfolg}</Hinweis>}
      {!gesperrt && <div className="sm:col-span-6"><Button type="submit" laedt={laeuft}>Speichern</Button></div>}
    </form>
  );
}

function PreisFinder(d: DossierDaten) {
  const l = d.lead;
  const e = d.einstellungen;
  const [erg, aktion, laeuft] = useActionState<AkquiseErgebnis, FormData>(preisfinderSpeichern, {});
  const [wert, setWert] = useState<string>(l.wert_indikation ? String(l.wert_indikation) : d.indikation.wert ? String(d.indikation.wert) : "");
  const [angebot, setAngebot] = useState<string>(l.angebotspreis ? String(l.angebotspreis) : "");
  const [art, setArt] = useState<Provisionsart>("teilung");
  const [satzVk, setSatzVk] = useState(String(e.provision_satz));
  const [satzK, setSatzK] = useState(String(e.provision_satz));
  const [abschlag, setAbschlag] = useState("10");
  const rahmen = preisRechnen(Number(wert.replace(",", ".")) || null, e);
  const angebotZahl = Number(angebot.replace(",", ".")) || rahmen?.startpreis || null;
  const erwartung = provisionsErwartung(angebotZahl, art, Number(satzVk.replace(",", ".")) || 0, Number(satzK.replace(",", ".")) || 0, Number(abschlag.replace(",", ".")) || 0);
  const ind = d.indikation;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Karte>
        <KarteKopf><KarteTitel>Wertindikation aus eigenen Vergleichswerten</KarteTitel><KarteBeschreibung>Median der €/m² verkaufter Objekte aus Ihrem Bestand, eingegrenzt nach Objektkategorie und Lage. Jeder Schritt ist sichtbar; der Wert bleibt Ihr Ansatz.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3 text-[13px]">
          {ind.fehlend.length > 0 && <Hinweis ton="warnung">Fehlt: {ind.fehlend.join(", ")}.</Hinweis>}
          <ul className="space-y-1">{ind.schritte.map((s) => <li key={s.bezeichnung}><span className="text-gedaempft">{s.bezeichnung}:</span> <span className="text-text">{s.wert}</span></li>)}</ul>
          {ind.vergleiche.length > 0 && (
            <div className="overflow-x-auto"><table className="w-full text-[12px]"><thead className="text-left text-gedaempft"><tr><th className="py-1 pr-2">Objekt</th><th className="py-1 pr-2">Ort</th><th className="py-1 pr-2 text-right">m²</th><th className="py-1 pr-2 text-right">Kaufpreis</th><th className="py-1 text-right">€/m²</th></tr></thead>
              <tbody className="divide-y divide-linie">{ind.vergleiche.slice(0, 12).map((v, i) => <tr key={i}><td className="py-1 pr-2 text-text">{v.bezeichnung}</td><td className="py-1 pr-2 text-gedaempft">{[v.plz, v.ort].filter(Boolean).join(" ")}</td><td className="py-1 pr-2 text-right">{v.wohnflaeche?.toLocaleString("de-DE")}</td><td className="py-1 pr-2 text-right">{euro(v.kaufpreis)}</td><td className="py-1 text-right">{v.eurQm.toLocaleString("de-DE")}</td></tr>)}</tbody></table></div>
          )}
          <p className="text-[12px] text-gedaempft">{WERTINDIKATION_HINWEIS}</p>
          {d.wertermittlung ? <Link href={`/wertermittlung/${d.wertermittlung.id}`} className="text-akzent hover:underline">Offenes Rechenblatt: {d.wertermittlung.bezeichnung}</Link> : d.darfWertermittlung && (
            <form action={leadWertermittlung}><input type="hidden" name="id" value={l.id} /><Button type="submit" variante="leise" groesse="klein">Wertermittlung (Vergleich, Ertrag, Sachwert) anlegen</Button></form>
          )}
        </KarteInhalt>
      </Karte>
      <Karte>
        <KarteKopf><KarteTitel>Preisrahmen und Provisionserwartung</KarteTitel><KarteBeschreibung>Spanne ± {e.spanne_prozent} %, Startpreis × {e.startpreis_faktor}, Provisionssatz {e.provision_satz} % — Vorgaben aus den Akquise-Einstellungen, hier je Lead überschreibbar.</KarteBeschreibung></KarteKopf>
        <KarteInhalt>
          <form action={aktion} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={l.id} />
            <Feld id="pf-wert" beschriftung="Punktwert (€)" hinweis={ind.wert ? `Vorschlag ${euro(ind.wert)}` : "Kein Vorschlag — bitte eintragen"}><Eingabe name="wert_indikation" value={wert} inputMode="decimal" onChange={(ev) => setWert(ev.target.value)} readOnly={!d.darfAendern} /></Feld>
            <Feld id="pf-angebot" beschriftung="Angebotspreis (€)" hinweis={rahmen ? `Vorschlag Startpreis ${euro(rahmen.startpreis)}` : ""}><Eingabe name="angebotspreis" value={angebot} placeholder={rahmen ? String(rahmen.startpreis) : ""} inputMode="decimal" onChange={(ev) => setAngebot(ev.target.value)} readOnly={!d.darfAendern} /></Feld>
            {rahmen && (
              <div className="sm:col-span-2 grid grid-cols-3 gap-2 rounded-[var(--radius)] border border-linie bg-flaeche-gedaempft p-3 text-[13px]">
                <div><p className="text-gedaempft">Spanne</p><p className="text-text">{euro(rahmen.min)} – {euro(rahmen.max)}</p></div>
                <div><p className="text-gedaempft">Startpreis</p><p className="text-text">{euro(rahmen.startpreis)}</p></div>
                <div><p className="text-gedaempft">Provision ({rahmen.satz} %)</p><p className="text-text">{euro(rahmen.provision)}</p></div>
              </div>
            )}
            <Feld id="pf-art" beschriftung="Provisionsart"><Auswahl name="provisionsart" value={art} onChange={(ev) => setArt(ev.target.value as Provisionsart)} disabled={!d.darfAendern}>{Object.entries(PROVISIONSARTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
            <Feld id="pf-abschlag" beschriftung="Verhandlungsabschlag (%)"><Eingabe name="abschlag" value={abschlag} inputMode="decimal" onChange={(ev) => setAbschlag(ev.target.value)} readOnly={!d.darfAendern} /></Feld>
            <Feld id="pf-satz-vk" beschriftung="Satz Verkäufer (%)"><Eingabe name="satz_verkaeufer" value={satzVk} inputMode="decimal" onChange={(ev) => setSatzVk(ev.target.value)} readOnly={!d.darfAendern} /></Feld>
            <Feld id="pf-satz-k" beschriftung="Satz Käufer (%)"><Eingabe name="satz_kaeufer" value={satzK} inputMode="decimal" onChange={(ev) => setSatzK(ev.target.value)} readOnly={!d.darfAendern} /></Feld>
            {erwartung && (
              <div className="sm:col-span-2 rounded-[var(--radius)] border border-linie bg-flaeche-gedaempft p-3 text-[13px]">
                <p className="text-text">Basis {euro(erwartung.basis)} (Angebot − {erwartung.nachlass} %) × {erwartung.satz} % = <strong>{euro(erwartung.brutto)}</strong> brutto, {euro(erwartung.netto)} netto.</p>
                {erwartung.verdacht && <p className="mt-1 text-fehler">Gesamtsatz über 10 % — vermutlich ist die Courtage doppelt erfasst.</p>}
              </div>
            )}
            {erg.fehler && <Hinweis ton="fehler" className="sm:col-span-2">{erg.fehler}</Hinweis>}
            {erg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-2">{erg.erfolg}</Hinweis>}
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              {d.darfAendern && <Button type="submit" laedt={laeuft}>Preis-Finder speichern</Button>}
              <a href={`/api/dokumente/wertindikation/${l.id}?format=pdf`} className={buttonKlassen({ variante: "sekundaer" })}>Wertindikation als PDF</a>
              <a href={`/api/dokumente/wertindikation/${l.id}?format=docx`} className="text-[13px] text-akzent hover:underline">Word</a>
            </div>
          </form>
        </KarteInhalt>
      </Karte>
    </div>
  );
}

function Aktivitaeten(d: DossierDaten) {
  const l = d.lead;
  const [erg, aktion, laeuft] = useActionState<AkquiseErgebnis, FormData>(aktivitaetAnlegen, {});
  const [entwurf, entwurfAktion, entwirft] = useActionState<AkquiseErgebnis, FormData>(leadMailEntwerfen, {});
  const [typ, setTyp] = useState("anruf");
  const mailVorlagen = d.vorlagen.filter((v) => v.kanal === "mail" && v.aktiv);
  return (
    <div className="space-y-5" id="aktivitaeten">
      {d.darfAendern && (
        <Karte>
          <KarteKopf><KarteTitel>Aktivität planen oder vermerken</KarteTitel><KarteBeschreibung>Aufgaben landen bei den Aufgaben des Zuständigen, Termine im Kalender; Anrufe und Notizen werden sofort als erledigt vermerkt.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>
            <form action={aktion} className="grid gap-3 sm:grid-cols-6">
              <input type="hidden" name="id" value={l.id} />
              <Feld id="ak-typ" beschriftung="Art"><Auswahl name="typ" value={typ} onChange={(ev) => setTyp(ev.target.value)}>{Object.entries(AKTIVITAET_TYPEN).filter(([k]) => k !== "ki").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <div className="sm:col-span-3"><Feld id="ak-titel" beschriftung="Titel" pflicht><Eingabe name="titel" required placeholder={typ === "anruf" ? "Telefonat mit Eigentümer" : typ === "termin" ? "Einwertungstermin vor Ort" : "…"} /></Feld></div>
              <Feld id="ak-faellig" beschriftung={typ === "termin" ? "Beginn" : "Fällig"}><Eingabe name="faellig_am" type="datetime-local" /></Feld>
              <Feld id="ak-nachfassen" beschriftung="Nachfassen neu setzen"><Eingabe name="nachfassen_am" type="date" /></Feld>
              <div className="sm:col-span-5"><Feld id="ak-text" beschriftung="Notiz / Text"><Textfeld name="text" rows={2} /></Feld></div>
              <div className="flex items-end"><Button type="submit" laedt={laeuft}>Speichern</Button></div>
              {erg.fehler && <Hinweis ton="fehler" className="sm:col-span-6">{erg.fehler}</Hinweis>}
              {erg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-6">{erg.erfolg}</Hinweis>}
            </form>
          </KarteInhalt>
        </Karte>
      )}

      <Karte>
        <KarteKopf><KarteTitel>E-Mail aus Vorlage</KarteTitel><KarteBeschreibung>Text mit den Angaben des Leads füllen, dann über das Postfach oder das E-Mail-Programm senden.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3">
          <form action={entwurfAktion} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={l.id} />
            <Feld id="ak-vorlage" beschriftung="Vorlage"><Auswahl name="vorlage_id" defaultValue={mailVorlagen[0]?.id ?? ""}>{mailVorlagen.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Auswahl></Feld>
            <Button type="submit" variante="sekundaer" groesse="klein" laedt={entwirft} disabled={mailVorlagen.length === 0}>Text erzeugen</Button>
            {entwurf.fehler && <span className="text-[12px] text-fehler">{entwurf.fehler}</span>}
          </form>
          {entwurf.text && (
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-text">Betreff: {entwurf.betreff}</p>
              <pre className="whitespace-pre-wrap rounded-[var(--radius)] border border-linie bg-flaeche p-3 text-[13px] text-text">{entwurf.text}</pre>
              <div className="flex flex-wrap gap-2">
                <a href={`mailto:${encodeURIComponent(d.kontakt?.email ?? "")}?subject=${encodeURIComponent(entwurf.betreff ?? "")}&body=${encodeURIComponent(entwurf.text)}`} className={buttonKlassen({ variante: "sekundaer", groesse: "klein" })}>Im E-Mail-Programm öffnen</a>
                {d.postfachVorhanden && <Link href={`/postfach?neu=1&an=${encodeURIComponent(d.kontakt?.email ?? "")}&betreff=${encodeURIComponent(entwurf.betreff ?? "")}&text=${encodeURIComponent(entwurf.text)}`} className={buttonKlassen({ variante: "leise", groesse: "klein" })}>Über Postfach senden</Link>}
                <form action={aktion}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="typ" value="mail" /><input type="hidden" name="titel" value={entwurf.betreff ?? "E-Mail"} /><input type="hidden" name="text" value={entwurf.text} /><input type="hidden" name="erledigt" value="1" /><Button type="submit" variante="leise" groesse="klein">Als gesendet vermerken</Button></form>
              </div>
            </div>
          )}
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf><KarteTitel>Verlauf der Aktivitäten</KarteTitel></KarteKopf>
        <KarteInhalt>
          {d.aktivitaeten.length === 0 ? <p className="text-[13px] text-gedaempft">Noch keine Aktivitäten.</p> : (
            <ul className="divide-y divide-linie">
              {d.aktivitaeten.map((a) => (
                <li key={a.id} className="py-2 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Marke ton={a.erledigt_am ? "neutral" : "warnung"}>{AKTIVITAET_TYPEN[a.typ]}</Marke>
                    <span className={a.erledigt_am ? "text-gedaempft line-through" : "text-text"}>{a.titel}</span>
                    {a.automation_id && <Marke ton="info">Automation</Marke>}
                    <span className="text-[11px] text-gedaempft">{a.faellig_am ? `fällig ${zeitpunkt(a.faellig_am)}` : zeitpunkt(a.erstellt_am)}</span>
                    {d.darfAendern && <form action={aktivitaetErledigen} className="ml-auto"><input type="hidden" name="aktivitaet_id" value={a.id} /><Button type="submit" variante="leise" groesse="klein">{a.erledigt_am ? "Wieder öffnen" : "Erledigt"}</Button></form>}
                  </div>
                  {a.text && <details className="mt-1"><summary className="cursor-pointer text-[12px] text-akzent">{a.betreff ?? "Text"}</summary><pre className="mt-1 whitespace-pre-wrap rounded-[var(--radius)] bg-flaeche-gedaempft p-2 text-[12px] text-text">{a.text}</pre></details>}
                </li>
              ))}
            </ul>
          )}
        </KarteInhalt>
      </Karte>
      {d.laeufe.length > 0 && (
        <p className="text-[12px] text-gedaempft">Geplante Automationen: {d.laeufe.filter((x) => x.status === "geplant").map((x) => `${x.automation?.name ?? x.automation?.kanal ?? "Lauf"} am ${zeitpunkt(x.geplant_am)}`).join(", ") || "keine offen"}.</p>
      )}
    </div>
  );
}

function Dossier(d: DossierDaten) {
  const l = d.lead;
  const [objekt, objektAktion, legtAn] = useActionState<AkquiseErgebnis, FormData>(leadZuObjekt, {});
  const [kontakt, kontaktAktion, legtKontakt] = useActionState<AkquiseErgebnis, FormData>(leadKontaktAnlegen, {});
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Karte>
        <KarteKopf><KarteTitel>Beteiligte und Verknüpfungen</KarteTitel><KarteBeschreibung>Das Objekt ist das Drehkreuz: Unterlagen, Bilder, Exposé und Interessenten-Matching laufen dort.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3 text-[13px]">
          <p><span className="text-gedaempft">Anschrift:</span> <span className="text-text">{leadAdresse(l)}</span></p>
          <p><span className="text-gedaempft">Eigentümer:</span> {d.kontakt ? <Link href={`/kontakte/${d.kontakt.id}`} className="text-akzent hover:underline">{d.kontakt.name}</Link> : <span className="text-gedaempft">noch kein Kontakt</span>}{d.kontakt?.telefon ? ` · ${d.kontakt.telefon}` : ""}{d.kontakt?.email ? ` · ${d.kontakt.email}` : ""}</p>
          {d.tippgeber && <p><span className="text-gedaempft">Tippgeber:</span> <Link href={`/kontakte/${d.tippgeber.id}`} className="text-akzent hover:underline">{d.tippgeber.name}</Link></p>}
          <p><span className="text-gedaempft">Objekt:</span> {d.objekt ? <Link href={`/objekte/${d.objekt.id}`} className="text-akzent hover:underline">{d.objekt.objektnummer} · {d.objekt.bezeichnung} ({d.objekt.status})</Link> : <span className="text-gedaempft">noch kein Objekt</span>}</p>
          {d.aufnahme && <p><span className="text-gedaempft">Objektaufnahme:</span> <Link href={`/aufnahmen/${d.aufnahme.id}`} className="text-akzent hover:underline">{d.aufnahme.bezeichnung}</Link></p>}
          {d.wertermittlung && <p><span className="text-gedaempft">Wertermittlung:</span> <Link href={`/wertermittlung/${d.wertermittlung.id}`} className="text-akzent hover:underline">{d.wertermittlung.bezeichnung}</Link></p>}
          <div className="flex flex-wrap gap-2 pt-2">
            {!d.objekt && d.darfObjekt && <form action={objektAktion}><input type="hidden" name="id" value={l.id} /><Button type="submit" variante="sekundaer" groesse="klein" laedt={legtAn}>Objekt im Status „Akquise“ anlegen</Button></form>}
            {d.objekt && <Link href={`/objekte/${d.objekt.id}#dokumente`} className={buttonKlassen({ variante: "leise", groesse: "klein" })}>Dokumente (Objektablage)</Link>}
            {d.objekt && <Link href={`/objekte/${d.objekt.id}#treffer`} className={buttonKlassen({ variante: "leise", groesse: "klein" })}>Passende Interessenten</Link>}
            {d.objekt && <Link href={`/vertraege/vorlage/maklervertrag?objekt=${d.objekt.id}`} className={buttonKlassen({ variante: "leise", groesse: "klein" })}>Maklervertrag aus Vorlage</Link>}
          </div>
          {objekt.fehler && <Hinweis ton="fehler">{objekt.fehler}</Hinweis>}
          {objekt.erfolg && <Hinweis ton="erfolg">{objekt.erfolg} {objekt.id && <Link href={`/objekte/${objekt.id}`} className="underline">Zum Objekt</Link>}</Hinweis>}
        </KarteInhalt>
      </Karte>
      <div className="space-y-5">
        {!d.kontakt && d.darfAendern && (
          <Karte>
            <KarteKopf><KarteTitel>Eigentümer als Kontakt anlegen</KarteTitel></KarteKopf>
            <KarteInhalt>
              <form action={kontaktAktion} className="grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="id" value={l.id} />
                <Feld id="lk-anrede" beschriftung="Anrede"><Auswahl name="anrede" defaultValue=""><option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option></Auswahl></Feld>
                <Feld id="lk-vorname" beschriftung="Vorname"><Eingabe name="vorname" /></Feld>
                <Feld id="lk-nachname" beschriftung="Nachname"><Eingabe name="nachname" /></Feld>
                <Feld id="lk-email" beschriftung="E-Mail"><Eingabe name="email" type="email" /></Feld>
                <Feld id="lk-telefon" beschriftung="Telefon"><Eingabe name="telefon" /></Feld>
                <div className="flex items-end"><Button type="submit" variante="sekundaer" groesse="klein" laedt={legtKontakt}>Anlegen</Button></div>
                {kontakt.fehler && <Hinweis ton="fehler" className="sm:col-span-2">{kontakt.fehler}</Hinweis>}
                {kontakt.erfolg && <Hinweis ton="erfolg" className="sm:col-span-2">{kontakt.erfolg}</Hinweis>}
              </form>
            </KarteInhalt>
          </Karte>
        )}
        <Karte>
          <KarteKopf><KarteTitel>Dokumente</KarteTitel></KarteKopf>
          <KarteInhalt className="flex flex-wrap gap-2 text-[13px]">
            <a href={`/api/dokumente/wertindikation/${l.id}?format=pdf`} className={buttonKlassen({ variante: "sekundaer", groesse: "klein" })}>Wertindikation (PDF)</a>
            <a href={`/api/dokumente/wertindikation/${l.id}?format=docx`} className={buttonKlassen({ variante: "leise", groesse: "klein" })}>Wertindikation (Word)</a>
            {d.darfLoeschen && l.status !== "gewonnen" && <form action={leadLoeschen} className="ml-auto"><input type="hidden" name="id" value={l.id} /><Button type="submit" variante="gefahr" groesse="klein">Lead löschen</Button></form>}
          </KarteInhalt>
        </Karte>
      </div>
    </div>
  );
}

function Historie(d: DossierDaten) {
  return (
    <Karte>
      <KarteKopf><KarteTitel>Historie</KarteTitel><KarteBeschreibung>Anlage, Stufenwechsel, Status, Zuständigkeit, Preis-Finder — automatisch protokolliert.</KarteBeschreibung></KarteKopf>
      <KarteInhalt>
        {d.historie.length === 0 ? <p className="text-[13px] text-gedaempft">Keine Einträge.</p> : (
          <ul className="divide-y divide-linie text-[13px]">
            {d.historie.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-2 py-2">
                <span className="w-32 shrink-0 text-[11px] text-gedaempft">{zeitpunkt(h.erstellt_am)}</span>
                <Marke>{h.feld}</Marke>
                <span className="text-text">{h.alt ? `${h.alt} → ` : ""}{h.neu ?? ""}</span>
                {h.benutzer?.name && <span className="text-[11px] text-gedaempft">· {h.benutzer.name}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-gedaempft">Angelegt {datum(d.lead.erstellt_am)}{d.lead.gewonnen_am ? ` · gewonnen ${datum(d.lead.gewonnen_am)}` : ""}{d.lead.verloren_am ? ` · verloren ${datum(d.lead.verloren_am)}` : ""}</p>
      </KarteInhalt>
    </Karte>
  );
}
