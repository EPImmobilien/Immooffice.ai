"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { KundeEinladen } from "@/components/portal/KundeEinladen";
import { ProjektFormular, type ProjektWerte } from "@/components/portal/ProjektFormular";
import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { dateigroesse } from "@/lib/dokumente";
import { datum, euro, zeitpunkt } from "@/lib/format";
import {
  AKTIVITAET_ART,
  ANFRAGE_ART,
  ANFRAGE_STATUS,
  DATEI_KATEGORIEN,
  EINHEIT_STATUS,
  FORTSCHRITT,
  KUNDEN_ART,
  SICHTBARKEIT,
  naechsterEinheitStatus,
  type Einheit,
  type EinheitStatus,
  type PortalKunde,
} from "@/lib/portal/typen";
import {
  anfrageBearbeiten,
  dateiLink,
  einheitLoeschen,
  einheitSpeichern,
  einheitStatusSetzen,
  gewerkLoeschen,
  gewerkSpeichern,
  kundeAendern,
  kundeLinkErneuern,
  kundeNachrichtSenden,
  merklisteSetzen,
  ordnerLoeschen,
  ordnerSpeichern,
  projektDateiAendern,
  projektDateiHochladen,
  projektLoeschen,
  projektVeroeffentlichen,
  updateLoeschen,
  updateSpeichern,
  type PortalErgebnis,
} from "@/server/portal-aktionen";

const REITER = [
  ["uebersicht", "Übersicht"],
  ["einheiten", "Einheiten"],
  ["dateien", "Dateien"],
  ["updates", "Baufortschritt"],
  ["zugaenge", "Zugänge"],
  ["anfragen", "Anfragen"],
  ["merkliste", "Merkliste"],
  ["gewerke", "Gewerke"],
  ["nachrichten", "Nachrichten"],
  ["aktivitaeten", "Aktivitäten"],
] as const;
type Reiter = (typeof REITER)[number][0];

export interface ProjektDaten {
  projekt: ProjektWerte & { id: string; name: string; vermarktungsart: "kauf" | "miete"; status: string; token: string | null; oeffentlich: boolean; erstellt_am: string };
  einheiten: Einheit[];
  ordner: Array<{ id: string; name: string; sichtbarkeit: string; sortierung: number }>;
  dateien: Array<{ id: string; name: string; kategorie: string; pfad: string; bytes: number | null; sichtbarkeit: string; ordner_id: string | null; einheit_id: string | null; erstellt_am: string }>;
  updates: Array<{ id: string; titel: string; text: string | null; bilder: string[]; sichtbarkeit: string; erstellt_am: string }>;
  gewerke: Array<{ id: string; gewerk: string; firma: string | null; name: string | null; telefon: string | null; email: string | null; ort: string | null; info: string | null; fuer_kunden: boolean; sortierung: number }>;
  zugaenge: PortalKunde[];
  anfragen: Array<{ id: string; kunde_id: string; einheit_id: string | null; art: string; nachricht: string | null; status: string; erstellt_am: string; bearbeitet_am: string | null }>;
  merkliste: Array<{ id: string; kunde_id: string; einheit_id: string; erstellt_am: string }>;
  nachrichten: Array<{ id: string; kunde_id: string; richtung: string; text: string; gelesen_am: string | null; erstellt_am: string }>;
  aktivitaeten: Array<{ id: string; kunde_id: string; art: string; detail: string | null; gesehen_am: string | null; erstellt_am: string }>;
  mitarbeiter: Array<{ id: string; name: string }>;
  objekte: Array<{ id: string; bezeichnung: string }>;
  projektLink: string | null;
  eigeneId: string;
  darfAendern: boolean;
  darfLoeschen: boolean;
}

function Meldung({ z }: { z: PortalErgebnis }) {
  return (
    <>
      {z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}
      {z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}
    </>
  );
}

function statusTon(s: string): "erfolg" | "warnung" | "neutral" {
  return s === "verfuegbar" ? "erfolg" : s === "reserviert" ? "warnung" : "neutral";
}

/** Projektakte mit allen Reitern (Referenz: Neubauprojekte → Projekt). */
export function ProjektDetail(d: ProjektDaten) {
  const [reiter, setReiter] = useState<Reiter>("uebersicht");
  const offen = d.anfragen.filter((a) => a.status === "offen").length;
  const ungelesen = d.nachrichten.filter((n) => n.richtung === "kunde" && !n.gelesen_am).length;
  const neu = d.aktivitaeten.filter((a) => !a.gesehen_am).length;
  const zaehler: Partial<Record<Reiter, number>> = { einheiten: d.einheiten.length, dateien: d.dateien.length, zugaenge: d.zugaenge.length, anfragen: offen, nachrichten: ungelesen, aktivitaeten: neu, merkliste: d.merkliste.length };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {REITER.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={reiter === k} onClick={() => setReiter(k)} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${reiter === k ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft hover:text-text"}`}>
            {l}{zaehler[k] ? <span className="ml-1 rounded-full bg-primaer px-1.5 text-[10px] text-white">{zaehler[k]}</span> : null}
          </button>
        ))}
      </div>
      {reiter === "uebersicht" && <Uebersicht {...d} />}
      {reiter === "einheiten" && <Einheiten {...d} />}
      {reiter === "dateien" && <Dateien {...d} />}
      {reiter === "updates" && <Updates {...d} />}
      {reiter === "zugaenge" && <Zugaenge {...d} />}
      {reiter === "anfragen" && <Anfragen {...d} />}
      {reiter === "merkliste" && <Merkliste {...d} />}
      {reiter === "gewerke" && <Gewerke {...d} />}
      {reiter === "nachrichten" && <Nachrichten {...d} />}
      {reiter === "aktivitaeten" && <Aktivitaeten {...d} />}
    </div>
  );
}

function Uebersicht(d: ProjektDaten) {
  const [z, aktion, laeuft] = useActionState<PortalErgebnis, FormData>(projektVeroeffentlichen, {});
  const [kopiert, setKopiert] = useState(false);
  const link = z.link ?? d.projektLink;
  const je = (s: EinheitStatus) => d.einheiten.filter((e) => e.status === s).length;
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Karte><KarteKopf><KarteTitel>Projektdaten</KarteTitel></KarteKopf><KarteInhalt><ProjektFormular werte={d.projekt} mitarbeiter={d.mitarbeiter} darfAendern={d.darfAendern} /></KarteInhalt></Karte>
      <div className="space-y-4">
        <Karte>
          <KarteKopf><KarteTitel>Stand</KarteTitel></KarteKopf>
          <KarteInhalt className="grid grid-cols-2 gap-2 text-[13px]">
            {(Object.keys(EINHEIT_STATUS) as EinheitStatus[]).filter((s) => d.projekt.vermarktungsart === "miete" ? s !== "verkauft" : s !== "vermietet").map((s) => (
              <div key={s} className="rounded-[var(--radius)] border border-linie p-2"><p className="text-[11px] uppercase tracking-wide text-gedaempft">{EINHEIT_STATUS[s]}</p><p className="font-titel text-lg font-semibold">{je(s)}</p></div>
            ))}
            <div className="rounded-[var(--radius)] border border-linie p-2"><p className="text-[11px] uppercase tracking-wide text-gedaempft">Zugänge</p><p className="font-titel text-lg font-semibold">{d.zugaenge.length}</p></div>
            <div className="rounded-[var(--radius)] border border-linie p-2"><p className="text-[11px] uppercase tracking-wide text-gedaempft">Offene Anfragen</p><p className="font-titel text-lg font-semibold">{d.anfragen.filter((a) => a.status === "offen").length}</p></div>
          </KarteInhalt>
        </Karte>
        <Karte>
          <KarteKopf><KarteTitel>Öffentliche Projektseite</KarteTitel><KarteBeschreibung>Zeigt Einheiten, öffentliche Dateien und Baufortschritte; Interessenten können anfragen und erhalten ihren Kundenbereich.</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="space-y-2 text-[13px]">
            <p>Status: <Marke ton={d.projekt.oeffentlich ? "erfolg" : "neutral"}>{d.projekt.oeffentlich ? "öffentlich" : "nicht öffentlich"}</Marke>{d.projekt.status === "vorbereitung" && d.projekt.oeffentlich && <span className="ml-2 text-gedaempft">(erst sichtbar, wenn das Projekt „Im Vertrieb“ ist)</span>}</p>
            {link && (
              <div className="flex gap-2">
                <Eingabe readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Projektlink" />
                <Button type="button" variante="sekundaer" groesse="klein" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setKopiert(true)); }}>{kopiert ? "Kopiert" : "Kopieren"}</Button>
              </div>
            )}
            {d.darfAendern && (
              <form action={aktion} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={d.projekt.id} />
                <Button type="submit" name="oeffentlich" value={d.projekt.oeffentlich ? "0" : "1"} groesse="klein" disabled={laeuft}>{d.projekt.oeffentlich ? "Seite abschalten" : "Seite veröffentlichen"}</Button>
                <Button type="submit" name="neuer_link" value="1" groesse="klein" variante="sekundaer" disabled={laeuft} formNoValidate onClick={(e) => { if (!confirm("Neuen Link erzeugen? Der bisherige wird ungültig.")) e.preventDefault(); }}>Neuen Link erzeugen</Button>
                <input type="hidden" name="oeffentlich" value={d.projekt.oeffentlich ? "1" : "0"} />
              </form>
            )}
            <Meldung z={z} />
          </KarteInhalt>
        </Karte>
        {d.darfLoeschen && (
          <form action={projektLoeschen} onSubmit={(e) => { if (!confirm("Projekt archivieren? Es verschwindet aus der Liste; Zugänge verlieren den Zugriff.")) e.preventDefault(); }}>
            <input type="hidden" name="id" value={d.projekt.id} />
            <Button type="submit" variante="sekundaer" groesse="klein">Projekt archivieren</Button>
          </form>
        )}
      </div>
    </div>
  );
}

function EinheitFormular({ projektId, objekte, werte, onFertig }: { projektId: string; objekte: Array<{ id: string; bezeichnung: string }>; werte?: Einheit | undefined; onFertig?: () => void }) {
  const [z, aktion, laeuft] = useActionState<PortalErgebnis, FormData>(einheitSpeichern, {});
  const w = werte;
  return (
    <form action={aktion} className="space-y-3 rounded-[var(--radius)] border border-linie bg-hintergrund p-3">
      <input type="hidden" name="projekt_id" value={projektId} />
      {w && <input type="hidden" name="id" value={w.id} />}
      <div className="grid gap-3 md:grid-cols-4">
        <Feld id={`e-we-${w?.id ?? "neu"}`} beschriftung="WE-Nr." pflicht><Eingabe id={`e-we-${w?.id ?? "neu"}`} name="we_nr" defaultValue={w?.we_nr ?? ""} required maxLength={40} placeholder="WE 01" /></Feld>
        <Feld id={`e-g-${w?.id ?? "neu"}`} beschriftung="Geschoss"><Eingabe id={`e-g-${w?.id ?? "neu"}`} name="geschoss" defaultValue={w?.geschoss ?? ""} maxLength={40} placeholder="EG, 1. OG, DG" /></Feld>
        <Feld id={`e-gi-${w?.id ?? "neu"}`} beschriftung="Geschoss-Nr. (Sortierung)"><Eingabe id={`e-gi-${w?.id ?? "neu"}`} name="geschoss_index" type="number" defaultValue={w?.geschoss_index ?? 0} /></Feld>
        <Feld id={`e-z-${w?.id ?? "neu"}`} beschriftung="Zimmer"><Eingabe id={`e-z-${w?.id ?? "neu"}`} name="zimmer" type="number" step="0.5" defaultValue={w?.zimmer ?? ""} /></Feld>
        <Feld id={`e-wf-${w?.id ?? "neu"}`} beschriftung="Wohnfläche m²"><Eingabe id={`e-wf-${w?.id ?? "neu"}`} name="wohnflaeche" type="number" step="0.01" defaultValue={w?.wohnflaeche ?? ""} /></Feld>
        <Feld id={`e-a-${w?.id ?? "neu"}`} beschriftung="Ausrichtung"><Eingabe id={`e-a-${w?.id ?? "neu"}`} name="ausrichtung" defaultValue={w?.ausrichtung ?? ""} maxLength={40} placeholder="Süd-West" /></Feld>
        <Feld id={`e-kp-${w?.id ?? "neu"}`} beschriftung="Kaufpreis €"><Eingabe id={`e-kp-${w?.id ?? "neu"}`} name="kaufpreis" inputMode="decimal" defaultValue={w?.kaufpreis ?? ""} /></Feld>
        <Feld id={`e-m-${w?.id ?? "neu"}`} beschriftung="Miete € / Monat"><Eingabe id={`e-m-${w?.id ?? "neu"}`} name="miete" inputMode="decimal" defaultValue={w?.miete ?? ""} /></Feld>
        <Feld id={`e-hg-${w?.id ?? "neu"}`} beschriftung="Hausgeld € / Monat"><Eingabe id={`e-hg-${w?.id ?? "neu"}`} name="hausgeld" inputMode="decimal" defaultValue={w?.hausgeld ?? ""} /></Feld>
        <Feld id={`e-s-${w?.id ?? "neu"}`} beschriftung="Status"><Auswahl id={`e-s-${w?.id ?? "neu"}`} name="status" defaultValue={w?.status ?? "verfuegbar"}>{Object.entries(EINHEIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
        <Feld id={`e-o-${w?.id ?? "neu"}`} beschriftung="Verknüpftes Objekt" hinweis="Exposé, Portale und Verträge laufen am Objekt"><Auswahl id={`e-o-${w?.id ?? "neu"}`} name="objekt_id" defaultValue={w?.objekt_id ?? ""}><option value="">— keines —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>
        <Feld id={`e-n-${w?.id ?? "neu"}`} beschriftung="Notiz (intern)"><Eingabe id={`e-n-${w?.id ?? "neu"}`} name="notiz" defaultValue={w?.notiz ?? ""} maxLength={2000} /></Feld>
      </div>
      <Meldung z={z} />
      <div className="flex gap-2">
        <Button type="submit" groesse="klein" disabled={laeuft}>{laeuft ? "Speichert …" : w ? "Einheit speichern" : "Einheit anlegen"}</Button>
        {onFertig && <Button type="button" groesse="klein" variante="sekundaer" onClick={onFertig}>Schließen</Button>}
      </div>
    </form>
  );
}

function Einheiten(d: ProjektDaten) {
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  return (
    <Karte>
      <KarteKopf><KarteTitel>Einheiten</KarteTitel><KarteBeschreibung>Wohnungen und Häuser des Projekts. Ein Klick auf den Status schaltet weiter (verfügbar → reserviert → {d.projekt.vermarktungsart === "miete" ? "vermietet" : "verkauft"}).</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-3">
        {d.einheiten.length === 0 && <p className="text-[13px] text-gedaempft">Noch keine Einheiten.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gedaempft"><th className="py-1 pr-2">WE</th><th className="py-1 pr-2">Geschoss</th><th className="py-1 pr-2">Zimmer</th><th className="py-1 pr-2">Fläche</th><th className="py-1 pr-2">{d.projekt.vermarktungsart === "miete" ? "Miete" : "Kaufpreis"}</th><th className="py-1 pr-2">Status</th><th className="py-1 pr-2">Objekt</th><th className="py-1" /></tr></thead>
            <tbody>
              {d.einheiten.map((e) => (
                <tr key={e.id} className="border-t border-linie align-top">
                  <td className="py-1.5 pr-2 font-medium">{e.we_nr}</td>
                  <td className="py-1.5 pr-2">{e.geschoss ?? "—"}</td>
                  <td className="py-1.5 pr-2">{e.zimmer ?? "—"}</td>
                  <td className="py-1.5 pr-2">{e.wohnflaeche != null ? `${e.wohnflaeche.toLocaleString("de-DE")} m²` : "—"}</td>
                  <td className="py-1.5 pr-2">{d.projekt.vermarktungsart === "miete" ? (e.miete != null ? `${euro(e.miete)} / Monat` : "—") : e.kaufpreis != null ? euro(e.kaufpreis) : "—"}</td>
                  <td className="py-1.5 pr-2">
                    {d.darfAendern ? (
                      <form action={einheitStatusSetzen}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="projekt_id" value={d.projekt.id} /><input type="hidden" name="status" value={naechsterEinheitStatus(e.status, d.projekt.vermarktungsart)} /><button type="submit" title="Status weiterschalten"><Marke ton={statusTon(e.status)}>{EINHEIT_STATUS[e.status]}</Marke></button></form>
                    ) : <Marke ton={statusTon(e.status)}>{EINHEIT_STATUS[e.status]}</Marke>}
                  </td>
                  <td className="py-1.5 pr-2">{e.objekt_id ? <Link href={`/objekte/${e.objekt_id}`} className="text-akzent hover:underline">{d.objekte.find((o) => o.id === e.objekt_id)?.bezeichnung ?? "Objekt"}</Link> : "—"}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {d.darfAendern && <button type="button" className="text-akzent hover:underline" onClick={() => setBearbeite(bearbeite === e.id ? null : e.id)}>Bearbeiten</button>}
                    {d.darfAendern && (
                      <form action={einheitLoeschen} className="ml-2 inline" onSubmit={(ev) => { if (!confirm(`Einheit ${e.we_nr} löschen? Dateien, Merklisten und Anfragen zur Einheit werden mitgelöscht.`)) ev.preventDefault(); }}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="projekt_id" value={d.projekt.id} /><button type="submit" className="text-gedaempft hover:text-fehler">Löschen</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bearbeite && d.einheiten.find((e) => e.id === bearbeite) && <EinheitFormular projektId={d.projekt.id} objekte={d.objekte} werte={d.einheiten.find((e) => e.id === bearbeite)} onFertig={() => setBearbeite(null)} />}
        {d.darfAendern && (neu ? <EinheitFormular projektId={d.projekt.id} objekte={d.objekte} onFertig={() => setNeu(false)} /> : <Button type="button" groesse="klein" onClick={() => setNeu(true)}>+ Einheit</Button>)}
      </KarteInhalt>
    </Karte>
  );
}

function DateiZeile({ datei, projektId, darfAendern, ordner, einheiten }: { datei: ProjektDaten["dateien"][number]; projektId: string; darfAendern: boolean; ordner: ProjektDaten["ordner"]; einheiten: Einheit[] }) {
  const [laedt, setLaedt] = useState(false);
  const oeffnen = async () => {
    setLaedt(true);
    const url = await dateiLink(datei.pfad);
    setLaedt(false);
    if (url) window.open(url, "_blank", "noopener");
  };
  return (
    <tr className="border-t border-linie align-top">
      <td className="py-1.5 pr-2"><button type="button" className="text-left text-akzent hover:underline" onClick={() => void oeffnen()} disabled={laedt}>{datei.name}</button><p className="text-[11px] text-gedaempft">{DATEI_KATEGORIEN[datei.kategorie as keyof typeof DATEI_KATEGORIEN] ?? datei.kategorie} · {dateigroesse(datei.bytes)} · {datum(datei.erstellt_am)}</p></td>
      <td className="py-1.5 pr-2">
        {darfAendern ? (
          <form action={projektDateiAendern}><input type="hidden" name="id" value={datei.id} /><input type="hidden" name="projekt_id" value={projektId} /><Auswahl name="sichtbarkeit" defaultValue={datei.sichtbarkeit} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Sichtbarkeit" className="w-auto">{Object.entries(SICHTBARKEIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></form>
        ) : SICHTBARKEIT[datei.sichtbarkeit as keyof typeof SICHTBARKEIT]}
      </td>
      <td className="py-1.5 pr-2 text-gedaempft">{ordner.find((o) => o.id === datei.ordner_id)?.name ?? "—"}</td>
      <td className="py-1.5 pr-2 text-gedaempft">{einheiten.find((e) => e.id === datei.einheit_id)?.we_nr ?? "alle"}</td>
      <td className="py-1.5 text-right">
        {darfAendern && <form action={projektDateiAendern} onSubmit={(ev) => { if (!confirm(`„${datei.name}“ löschen?`)) ev.preventDefault(); }}><input type="hidden" name="id" value={datei.id} /><input type="hidden" name="projekt_id" value={projektId} /><input type="hidden" name="loeschen" value="1" /><button type="submit" className="text-gedaempft hover:text-fehler">Löschen</button></form>}
      </td>
    </tr>
  );
}

function Dateien(d: ProjektDaten) {
  const [z, hochladen, laeuft] = useActionState<PortalErgebnis, FormData>(projektDateiHochladen, {});
  const [zo, ordnerAnlegen, laeuftO] = useActionState<PortalErgebnis, FormData>(ordnerSpeichern, {});
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Karte>
        <KarteKopf><KarteTitel>Dateien</KarteTitel><KarteBeschreibung>Exposés, Grundrisse, Baubeschreibung, Vertragsunterlagen. „Nur Käufer“ sehen nur Zugänge mit Rolle Käufer; „öffentlich“ erscheint auf der Projektseite.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3">
          {d.dateien.length === 0 && <p className="text-[13px] text-gedaempft">Noch keine Dateien.</p>}
          {d.dateien.length > 0 && (
            <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-gedaempft"><th className="py-1 pr-2">Datei</th><th className="py-1 pr-2">Sichtbar für</th><th className="py-1 pr-2">Ordner</th><th className="py-1 pr-2">Einheit</th><th /></tr></thead><tbody>
              {d.dateien.map((f) => <DateiZeile key={f.id} datei={f} projektId={d.projekt.id} darfAendern={d.darfAendern} ordner={d.ordner} einheiten={d.einheiten} />)}
            </tbody></table></div>
          )}
          {d.darfAendern && (
            <form action={hochladen} className="grid gap-3 rounded-[var(--radius)] border border-linie bg-hintergrund p-3 md:grid-cols-2">
              <input type="hidden" name="projekt_id" value={d.projekt.id} />
              <Feld id="pd-datei" beschriftung="Datei" pflicht><input id="pd-datei" name="datei" type="file" required className="text-[13px]" /></Feld>
              <Feld id="pd-kat" beschriftung="Kategorie"><Auswahl id="pd-kat" name="kategorie" defaultValue="sonstiges">{Object.entries(DATEI_KATEGORIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="pd-sicht" beschriftung="Sichtbar für"><Auswahl id="pd-sicht" name="sichtbarkeit" defaultValue="interessent">{Object.entries(SICHTBARKEIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="pd-ordner" beschriftung="Ordner"><Auswahl id="pd-ordner" name="ordner_id" defaultValue=""><option value="">— keiner —</option>{d.ordner.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Auswahl></Feld>
              <Feld id="pd-einheit" beschriftung="Nur für Einheit"><Auswahl id="pd-einheit" name="einheit_id" defaultValue=""><option value="">— alle —</option>{d.einheiten.map((e) => <option key={e.id} value={e.id}>{e.we_nr}</option>)}</Auswahl></Feld>
              <div className="flex items-end"><Button type="submit" groesse="klein" disabled={laeuft}>{laeuft ? "Lädt hoch …" : "Hochladen"}</Button></div>
              <div className="md:col-span-2"><Meldung z={z} /></div>
            </form>
          )}
        </KarteInhalt>
      </Karte>
      <Karte>
        <KarteKopf><KarteTitel>Ordner</KarteTitel><KarteBeschreibung>Gliederung für die Kundensicht; die Sichtbarkeit des Ordners gilt zusätzlich.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-2 text-[13px]">
          {d.ordner.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-[var(--radius)] border border-linie px-2 py-1">
              <span>{o.name} <span className="text-[11px] text-gedaempft">· {SICHTBARKEIT[o.sichtbarkeit as keyof typeof SICHTBARKEIT]}</span></span>
              {d.darfAendern && <form action={ordnerLoeschen}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="projekt_id" value={d.projekt.id} /><button type="submit" className="text-gedaempft hover:text-fehler">Löschen</button></form>}
            </div>
          ))}
          {d.darfAendern && (
            <form action={ordnerAnlegen} className="space-y-2 pt-2">
              <input type="hidden" name="projekt_id" value={d.projekt.id} />
              <Feld id="po-name" beschriftung="Neuer Ordner"><Eingabe id="po-name" name="name" maxLength={120} required /></Feld>
              <Feld id="po-sicht" beschriftung="Sichtbar für"><Auswahl id="po-sicht" name="sichtbarkeit" defaultValue="interessent">{Object.entries(SICHTBARKEIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Meldung z={zo} />
              <Button type="submit" groesse="klein" variante="sekundaer" disabled={laeuftO}>Ordner anlegen</Button>
            </form>
          )}
        </KarteInhalt>
      </Karte>
    </div>
  );
}

function UpdateBilder({ pfade }: { pfade: string[] }) {
  const [urls, setUrls] = useState<string[] | null>(null);
  if (pfade.length === 0) return null;
  if (!urls) return <button type="button" className="text-[12px] text-akzent hover:underline" onClick={() => { void Promise.all(pfade.map((p) => dateiLink(p))).then((u) => setUrls(u.filter((x): x is string => Boolean(x)))); }}>{pfade.length} Bild(er) anzeigen</button>;
  return <div className="flex flex-wrap gap-2">{urls.map((u) => (
    // eslint-disable-next-line @next/next/no-img-element -- signierte Adresse aus dem eigenen Bucket
    <img key={u} src={u} alt="Baufortschritt" className="h-24 rounded-[var(--radius)] border border-linie object-cover" />
  ))}</div>;
}

function Updates(d: ProjektDaten) {
  const [z, aktion, laeuft] = useActionState<PortalErgebnis, FormData>(updateSpeichern, {});
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Karte>
        <KarteKopf><KarteTitel>Baufortschritt</KarteTitel><KarteBeschreibung>Meldungen mit Fotos — Kunden sehen sie im Kundenbereich, „öffentlich“ auch auf der Projektseite.</KarteBeschreibung></KarteKopf>
        <KarteInhalt className="space-y-3">
          {d.updates.length === 0 && <p className="text-[13px] text-gedaempft">Noch keine Meldung.</p>}
          {d.updates.map((u) => (
            <div key={u.id} className="rounded-[var(--radius)] border border-linie p-3 text-[13px]">
              <div className="flex items-start justify-between gap-2"><div><p className="font-medium">{u.titel}</p><p className="text-[11px] text-gedaempft">{zeitpunkt(u.erstellt_am)} · {SICHTBARKEIT[u.sichtbarkeit as keyof typeof SICHTBARKEIT]}</p></div>
                {d.darfAendern && <form action={updateLoeschen} onSubmit={(ev) => { if (!confirm("Meldung löschen?")) ev.preventDefault(); }}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="projekt_id" value={d.projekt.id} /><button type="submit" className="text-gedaempft hover:text-fehler">Löschen</button></form>}
              </div>
              {u.text && <p className="mt-1 whitespace-pre-wrap">{u.text}</p>}
              <div className="mt-2"><UpdateBilder pfade={u.bilder} /></div>
            </div>
          ))}
        </KarteInhalt>
      </Karte>
      {d.darfAendern && (
        <Karte>
          <KarteKopf><KarteTitel>Neue Meldung</KarteTitel></KarteKopf>
          <KarteInhalt>
            <form action={aktion} className="space-y-3">
              <input type="hidden" name="projekt_id" value={d.projekt.id} />
              <Feld id="pu-titel" beschriftung="Titel" pflicht><Eingabe id="pu-titel" name="titel" required maxLength={200} placeholder="z. B. Rohbau fertiggestellt" /></Feld>
              <Feld id="pu-text" beschriftung="Text"><Textfeld id="pu-text" name="text" rows={4} maxLength={8000} /></Feld>
              <Feld id="pu-bilder" beschriftung="Fotos (JPG, PNG, WebP; bis 10)"><input id="pu-bilder" name="bilder" type="file" accept="image/jpeg,image/png,image/webp" multiple className="text-[13px]" /></Feld>
              <Feld id="pu-sicht" beschriftung="Sichtbar für"><Auswahl id="pu-sicht" name="sichtbarkeit" defaultValue="interessent">{Object.entries(SICHTBARKEIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Meldung z={z} />
              <Button type="submit" disabled={laeuft}>{laeuft ? "Veröffentlicht …" : "Meldung veröffentlichen"}</Button>
            </form>
          </KarteInhalt>
        </Karte>
      )}
    </div>
  );
}

function ZugangZeile({ k, d }: { k: PortalKunde; d: ProjektDaten }) {
  const [z, aendern] = useActionState<PortalErgebnis, FormData>(kundeAendern, {});
  const [zl, linkNeu, laeuftL] = useActionState<PortalErgebnis, FormData>(kundeLinkErneuern, {});
  const [offen, setOffen] = useState(false);
  const einheit = d.einheiten.find((e) => e.id === k.einheit_id);
  return (
    <div className="rounded-[var(--radius)] border border-linie p-3 text-[13px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium"><Link href={`/kundenbereich/${k.id}`} className="hover:underline">{k.anzeigename}</Link> <Marke ton={k.art === "kaeufer" ? "akzent" : "neutral"}>{KUNDEN_ART[k.art]}</Marke> {!k.aktiv && <Marke ton="fehler">gesperrt</Marke>}</p>
          <p className="text-[11px] text-gedaempft">{k.email}{k.telefon ? ` · ${k.telefon}` : ""}{einheit ? ` · ${einheit.we_nr}` : ""} · eingeladen {datum(k.eingeladen_am)}{k.angenommen_am ? ` · angenommen ${datum(k.angenommen_am)}` : " · noch nicht geöffnet"}{k.letzter_login_am ? ` · zuletzt ${zeitpunkt(k.letzter_login_am)}` : ""}</p>
          <p className="mt-1 text-[12px]">Stufe {k.fortschritt_stufe}/7 · {FORTSCHRITT[k.fortschritt_stufe - 1]}{k.fortschritt_notiz ? ` — ${k.fortschritt_notiz}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.darfAendern && <Button type="button" groesse="klein" variante="sekundaer" onClick={() => setOffen(!offen)}>{offen ? "Schließen" : "Bearbeiten"}</Button>}
          <Link href={`/kundenbereich/${k.id}`} className="text-[12px] text-akzent hover:underline">Akte</Link>
        </div>
      </div>
      {offen && d.darfAendern && (
        <div className="mt-3 space-y-3 border-t border-linie pt-3">
          <form action={aendern} className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="id" value={k.id} />
            <Feld id={`z-art-${k.id}`} beschriftung="Rolle"><Auswahl id={`z-art-${k.id}`} name="art" defaultValue={k.art}><option value="interessent">Interessent</option><option value="kaeufer">Käufer</option></Auswahl></Feld>
            <Feld id={`z-e-${k.id}`} beschriftung="Wohnung"><Auswahl id={`z-e-${k.id}`} name="einheit_id" defaultValue={k.einheit_id ?? ""}><option value="">— keine —</option>{d.einheiten.map((e) => <option key={e.id} value={e.id}>{e.we_nr}</option>)}</Auswahl></Feld>
            <Feld id={`z-f-${k.id}`} beschriftung="Fortschritt"><Auswahl id={`z-f-${k.id}`} name="fortschritt_stufe" defaultValue={String(k.fortschritt_stufe)}>{FORTSCHRITT.map((s, i) => <option key={s} value={i + 1}>{i + 1}/7 · {s}</option>)}</Auswahl></Feld>
            <Feld id={`z-n-${k.id}`} beschriftung="Nächster Schritt (sieht der Kunde)"><Eingabe id={`z-n-${k.id}`} name="fortschritt_notiz" defaultValue={k.fortschritt_notiz ?? ""} maxLength={500} /></Feld>
            <Feld id={`z-ap-${k.id}`} beschriftung="Ansprechpartner"><Auswahl id={`z-ap-${k.id}`} name="ansprechpartner_id" defaultValue={k.ansprechpartner_id ?? ""}><option value="">— keiner —</option>{d.mitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Auswahl></Feld>
            <Feld id={`z-a-${k.id}`} beschriftung="Zugang"><Auswahl id={`z-a-${k.id}`} name="aktiv" defaultValue={k.aktiv ? "1" : "0"}><option value="1">aktiv</option><option value="0">gesperrt</option></Auswahl></Feld>
            <div className="flex items-end gap-2 md:col-span-2"><Button type="submit" groesse="klein">Speichern</Button><Meldung z={z} /></div>
          </form>
          <form action={linkNeu} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={k.id} />
            <Button type="submit" groesse="klein" variante="sekundaer" disabled={laeuftL} onClick={(e) => { if (!confirm("Neuen Zugangslink erzeugen? Der alte wird ungültig.")) e.preventDefault(); }}>Login-Link neu senden</Button>
            {zl.link && <Eingabe readOnly value={zl.link} onFocus={(e) => e.currentTarget.select()} aria-label="Zugangslink" className="max-w-md" />}
            <Meldung z={zl} />
          </form>
        </div>
      )}
    </div>
  );
}

function Zugaenge(d: ProjektDaten) {
  const [neu, setNeu] = useState(false);
  return (
    <Karte>
      <KarteKopf><KarteTitel>Zugänge</KarteTitel><KarteBeschreibung>Interessenten und Käufer mit persönlichem Kundenbereich: Einheiten, Merkliste, Anfragen, Unterlagen, Baufortschritt, Nachrichten.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-3">
        {d.zugaenge.length === 0 && <p className="text-[13px] text-gedaempft">Noch keine Zugänge — laden Sie Interessenten ein oder veröffentlichen Sie die Projektseite.</p>}
        {d.zugaenge.map((k) => <ZugangZeile key={k.id} k={k} d={d} />)}
        {d.darfAendern && (neu ? (
          <div className="rounded-[var(--radius)] border border-linie bg-hintergrund p-3"><KundeEinladen vorgabe={{ projekt_id: d.projekt.id, art: "interessent" }} objekte={[]} einheiten={d.einheiten} mitarbeiter={d.mitarbeiter} eigeneId={d.eigeneId} /><Button type="button" groesse="klein" variante="sekundaer" className="mt-2" onClick={() => setNeu(false)}>Schließen</Button></div>
        ) : <Button type="button" groesse="klein" onClick={() => setNeu(true)}>+ Zugang einladen</Button>)}
      </KarteInhalt>
    </Karte>
  );
}

function AnfrageZeile({ a, d }: { a: ProjektDaten["anfragen"][number]; d: ProjektDaten }) {
  const [z, aktion, laeuft] = useActionState<PortalErgebnis, FormData>(anfrageBearbeiten, {});
  const k = d.zugaenge.find((x) => x.id === a.kunde_id);
  const e = d.einheiten.find((x) => x.id === a.einheit_id);
  return (
    <div className="rounded-[var(--radius)] border border-linie p-3 text-[13px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{ANFRAGE_ART[a.art as keyof typeof ANFRAGE_ART] ?? a.art}{e ? ` · ${e.we_nr}` : ""} <Marke ton={a.status === "offen" ? "warnung" : a.status === "bestaetigt" ? "erfolg" : "neutral"}>{ANFRAGE_STATUS[a.status as keyof typeof ANFRAGE_STATUS]}</Marke></p>
          <p className="text-[11px] text-gedaempft">{k ? <Link href={`/kundenbereich/${k.id}`} className="hover:underline">{k.anzeigename}</Link> : "Zugang gelöscht"} · {zeitpunkt(a.erstellt_am)}{a.bearbeitet_am ? ` · bearbeitet ${zeitpunkt(a.bearbeitet_am)}` : ""}</p>
          {a.nachricht && <p className="mt-1 whitespace-pre-wrap">{a.nachricht}</p>}
        </div>
        {d.darfAendern && (
          <form action={aktion} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={a.id} />
            {a.status === "offen" && <Eingabe name="antwort" placeholder="Antwort an den Kunden (optional)" maxLength={3000} className="min-w-[260px]" />}
            <div className="flex gap-2">
              {a.status === "offen" && <Button type="submit" name="status" value="bestaetigt" groesse="klein" disabled={laeuft}>{a.art === "reservierung" ? "Reservierung bestätigen" : "Bestätigen"}</Button>}
              {a.status === "offen" && <Button type="submit" name="status" value="abgelehnt" groesse="klein" variante="sekundaer" disabled={laeuft}>Ablehnen</Button>}
              {a.status !== "offen" && <Button type="submit" name="status" value="offen" groesse="klein" variante="sekundaer" disabled={laeuft}>Wieder öffnen</Button>}
            </div>
            <Meldung z={z} />
          </form>
        )}
      </div>
    </div>
  );
}

function Anfragen(d: ProjektDaten) {
  return (
    <Karte>
      <KarteKopf><KarteTitel>Anfragen</KarteTitel><KarteBeschreibung>Reservierungs-, Informations- und Besichtigungsanfragen aus dem Kundenbereich und der Projektseite. Eine bestätigte Reservierung setzt die Einheit auf „reserviert“ und den Kunden auf Stufe 2.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-2">
        {d.anfragen.length === 0 && <p className="text-[13px] text-gedaempft">Keine Anfragen.</p>}
        {d.anfragen.map((a) => <AnfrageZeile key={a.id} a={a} d={d} />)}
      </KarteInhalt>
    </Karte>
  );
}

function Merkliste(d: ProjektDaten) {
  return (
    <Karte>
      <KarteKopf><KarteTitel>Merkliste</KarteTitel><KarteBeschreibung>Was Kunden sich gemerkt haben — auch von Hand pflegbar; der Kunde sieht es sofort.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-3 text-[13px]">
        {d.merkliste.length === 0 && <p className="text-gedaempft">Noch keine Einträge.</p>}
        {d.merkliste.map((m) => {
          const k = d.zugaenge.find((x) => x.id === m.kunde_id);
          const e = d.einheiten.find((x) => x.id === m.einheit_id);
          return (
            <div key={m.id} className="flex items-center justify-between rounded-[var(--radius)] border border-linie px-2 py-1">
              <span>{k?.anzeigename ?? "—"} · <strong>{e?.we_nr ?? "—"}</strong> <span className="text-[11px] text-gedaempft">{datum(m.erstellt_am)}</span></span>
              {d.darfAendern && <form action={merklisteSetzen}><input type="hidden" name="projekt_id" value={d.projekt.id} /><input type="hidden" name="kunde_id" value={m.kunde_id} /><input type="hidden" name="einheit_id" value={m.einheit_id} /><input type="hidden" name="entfernen" value="1" /><button type="submit" className="text-gedaempft hover:text-fehler">Entfernen</button></form>}
            </div>
          );
        })}
        {d.darfAendern && d.zugaenge.length > 0 && d.einheiten.length > 0 && (
          <form action={merklisteSetzen} className="flex flex-wrap items-end gap-2 border-t border-linie pt-3">
            <input type="hidden" name="projekt_id" value={d.projekt.id} />
            <Feld id="ml-kunde" beschriftung="Kunde"><Auswahl id="ml-kunde" name="kunde_id">{d.zugaenge.map((k) => <option key={k.id} value={k.id}>{k.anzeigename}</option>)}</Auswahl></Feld>
            <Feld id="ml-einheit" beschriftung="Einheit"><Auswahl id="ml-einheit" name="einheit_id">{d.einheiten.map((e) => <option key={e.id} value={e.id}>{e.we_nr}</option>)}</Auswahl></Feld>
            <Button type="submit" groesse="klein" variante="sekundaer">Auf die Merkliste</Button>
          </form>
        )}
      </KarteInhalt>
    </Karte>
  );
}

function GewerkFormular({ projektId, werte, onFertig }: { projektId: string; werte?: ProjektDaten["gewerke"][number]; onFertig?: () => void }) {
  const [z, aktion, laeuft] = useActionState<PortalErgebnis, FormData>(gewerkSpeichern, {});
  const w = werte; const s = w?.id ?? "neu";
  return (
    <form action={aktion} className="space-y-3 rounded-[var(--radius)] border border-linie bg-hintergrund p-3">
      <input type="hidden" name="projekt_id" value={projektId} />
      {w && <input type="hidden" name="id" value={w.id} />}
      <div className="grid gap-3 md:grid-cols-3">
        <Feld id={`g-g-${s}`} beschriftung="Gewerk" pflicht><Eingabe id={`g-g-${s}`} name="gewerk" defaultValue={w?.gewerk ?? ""} required maxLength={120} placeholder="Sanitär, Elektro, Bodenbeläge …" /></Feld>
        <Feld id={`g-f-${s}`} beschriftung="Firma"><Eingabe id={`g-f-${s}`} name="firma" defaultValue={w?.firma ?? ""} maxLength={200} /></Feld>
        <Feld id={`g-n-${s}`} beschriftung="Ansprechpartner"><Eingabe id={`g-n-${s}`} name="name" defaultValue={w?.name ?? ""} maxLength={200} /></Feld>
        <Feld id={`g-t-${s}`} beschriftung="Telefon"><Eingabe id={`g-t-${s}`} name="telefon" defaultValue={w?.telefon ?? ""} maxLength={60} /></Feld>
        <Feld id={`g-e-${s}`} beschriftung="E-Mail"><Eingabe id={`g-e-${s}`} name="email" defaultValue={w?.email ?? ""} maxLength={200} /></Feld>
        <Feld id={`g-o-${s}`} beschriftung="Ort / Ausstellung"><Eingabe id={`g-o-${s}`} name="ort" defaultValue={w?.ort ?? ""} maxLength={200} /></Feld>
      </div>
      <Feld id={`g-i-${s}`} beschriftung="Hinweis für Kunden (z. B. Bemusterung, Terminvereinbarung)"><Textfeld id={`g-i-${s}`} name="info" rows={2} defaultValue={w?.info ?? ""} maxLength={2000} /></Feld>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="fuer_kunden" value="1" defaultChecked={w?.fuer_kunden ?? false} /> Für Kunden sichtbar (erscheint unter „Ihre Ansprechpartner“)</label>
      <Meldung z={z} />
      <div className="flex gap-2"><Button type="submit" groesse="klein" disabled={laeuft}>{w ? "Speichern" : "Anlegen"}</Button>{onFertig && <Button type="button" groesse="klein" variante="sekundaer" onClick={onFertig}>Schließen</Button>}</div>
    </form>
  );
}

function Gewerke(d: ProjektDaten) {
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  return (
    <Karte>
      <KarteKopf><KarteTitel>Gewerke und Ansprechpartner</KarteTitel><KarteBeschreibung>Handwerker und Lieferanten des Projekts — für die Bemusterung mit „für Kunden sichtbar“ freigeben.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-2 text-[13px]">
        {d.gewerke.length === 0 && <p className="text-gedaempft">Noch keine Einträge.</p>}
        {d.gewerke.map((g) => (
          <div key={g.id} className="rounded-[var(--radius)] border border-linie p-2">
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-medium">{g.gewerk} {g.firma ? <span className="font-normal text-gedaempft">· {g.firma}</span> : null} <Marke ton={g.fuer_kunden ? "erfolg" : "neutral"}>{g.fuer_kunden ? "im Kundenbereich" : "nur intern"}</Marke></p><p className="text-[11px] text-gedaempft">{[g.name, g.telefon, g.email, g.ort].filter(Boolean).join(" · ")}</p>{g.info && <p className="mt-1 whitespace-pre-wrap text-[12px]">{g.info}</p>}</div>
              {d.darfAendern && <div className="flex gap-2 whitespace-nowrap"><button type="button" className="text-akzent hover:underline" onClick={() => setBearbeite(bearbeite === g.id ? null : g.id)}>Bearbeiten</button><form action={gewerkLoeschen}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="projekt_id" value={d.projekt.id} /><button type="submit" className="text-gedaempft hover:text-fehler">Löschen</button></form></div>}
            </div>
            {bearbeite === g.id && <div className="mt-2"><GewerkFormular projektId={d.projekt.id} werte={g} onFertig={() => setBearbeite(null)} /></div>}
          </div>
        ))}
        {d.darfAendern && (neu ? <GewerkFormular projektId={d.projekt.id} onFertig={() => setNeu(false)} /> : <Button type="button" groesse="klein" onClick={() => setNeu(true)}>+ Gewerk</Button>)}
      </KarteInhalt>
    </Karte>
  );
}

function Nachrichten(d: ProjektDaten) {
  const [kunde, setKunde] = useState<string>(d.zugaenge[0]?.id ?? "");
  const [z, senden, laeuft] = useActionState<PortalErgebnis, FormData>(kundeNachrichtSenden, {});
  const liste = d.nachrichten.filter((n) => n.kunde_id === kunde);
  return (
    <Karte>
      <KarteKopf><KarteTitel>Nachrichten</KarteTitel><KarteBeschreibung>Chat mit jedem Kunden — er antwortet über seinen Kundenbereich.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-3 text-[13px]">
        {d.zugaenge.length === 0 ? <p className="text-gedaempft">Noch keine Zugänge.</p> : (
          <>
            <Feld id="nk-kunde" beschriftung="Kunde"><Auswahl id="nk-kunde" value={kunde} onChange={(e) => setKunde(e.target.value)}>{d.zugaenge.map((k) => { const u = d.nachrichten.filter((n) => n.kunde_id === k.id && n.richtung === "kunde" && !n.gelesen_am).length; return <option key={k.id} value={k.id}>{k.anzeigename}{u ? ` (${u} neu)` : ""}</option>; })}</Auswahl></Feld>
            <div className="max-h-80 space-y-2 overflow-auto rounded-[var(--radius)] border border-linie bg-hintergrund p-2">
              {liste.length === 0 && <p className="text-gedaempft">Noch keine Nachrichten. Der Kunde kann Sie über seinen Kundenbereich anschreiben — oder Sie beginnen hier.</p>}
              {liste.map((n) => <div key={n.id} className={`max-w-[80%] rounded-[var(--radius)] px-3 py-2 ${n.richtung === "makler" ? "ml-auto bg-akzent-schwach" : "bg-flaeche border border-linie"}`}><p className="whitespace-pre-wrap">{n.text}</p><p className="mt-1 text-[10px] text-gedaempft">{n.richtung === "makler" ? "Sie" : "Kunde"} · {zeitpunkt(n.erstellt_am)}</p></div>)}
            </div>
            {d.darfAendern && (
              <form action={senden} className="flex gap-2">
                <input type="hidden" name="kunde_id" value={kunde} />
                <Textfeld name="text" rows={2} required maxLength={5000} placeholder="Nachricht an den Kunden …" aria-label="Nachricht" />
                <Button type="submit" disabled={laeuft}>{laeuft ? "…" : "Senden"}</Button>
              </form>
            )}
            <Meldung z={z} />
          </>
        )}
      </KarteInhalt>
    </Karte>
  );
}

function Aktivitaeten(d: ProjektDaten) {
  return (
    <Karte>
      <KarteKopf><KarteTitel>Aktivitäten</KarteTitel><KarteBeschreibung>Was Kunden im Kundenbereich getan haben — Anmeldungen, angesehene Dateien, Merkliste, Anfragen, Uploads.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-1 text-[13px]">
        {d.aktivitaeten.length === 0 && <p className="text-gedaempft">Noch nichts.</p>}
        {d.aktivitaeten.map((a) => { const k = d.zugaenge.find((x) => x.id === a.kunde_id); return (
          <div key={a.id} className={`flex flex-wrap gap-2 rounded-[var(--radius)] px-2 py-1 ${a.gesehen_am ? "" : "bg-akzent-schwach"}`}><span className="w-36 shrink-0 text-[11px] text-gedaempft">{zeitpunkt(a.erstellt_am)}</span><span className="font-medium">{k?.anzeigename ?? "—"}</span><span className="text-gedaempft">{AKTIVITAET_ART[a.art as keyof typeof AKTIVITAET_ART] ?? a.art}</span><span>{a.detail}</span></div>
        ); })}
      </KarteInhalt>
    </Karte>
  );
}
