"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { TERMINARTEN, type Terminart } from "@/lib/arbeitsmittel";
import { regelAusWahl, SERIE_EINHEIT, SERIE_WAHL, serienDaten, serieStandard, serieText, WOCHENTAGE, type SerienRegel, type SerieTakt, type SerieWahl } from "@/lib/kalender/serie";
import { ERINNERUNGEN, type Mitarbeiter } from "@/lib/kalender/typen";
import { berlin } from "@/lib/kalender/zeit";
import { terminSpeichern, type KalenderErgebnis } from "@/server/kalender-aktionen";
import { urlaubBeantragen, type VerwaltungErgebnis } from "@/server/verwaltung-aktionen";

export interface TerminStart {
  id?: string;
  titel?: string;
  art?: Terminart;
  datum?: string;
  zeit?: string;
  dauer?: number;
  ganztags?: boolean;
  datum_ende?: string;
  ort?: string | null;
  notiz?: string | null;
  objekt_id?: string | null;
  kontakt_id?: string | null;
  zustaendig_id?: string | null;
  teilnehmer?: string[];
  privat?: boolean;
  erinnerung_minuten?: number | null;
  nachfassen?: boolean;
  erinnerung_kunde?: boolean;
  serie_regel?: SerienRegel | null;
  serie_id?: string | null;
}

/** Aus einem gespeicherten Termin die Formularwerte bilden. */
export function terminStart(t: { id: string; titel: string; art: Terminart; beginnt_am: string; endet_am: string; ganztags: boolean; ort: string | null; notiz: string | null; objekt_id: string | null; kontakt_id: string | null; zustaendig_id: string | null; teilnehmer: string[]; privat: boolean; erinnerung_minuten: number | null; nachfassen: boolean; erinnerung_kunde?: boolean; serie_regel: SerienRegel | null; serie_id: string | null }): TerminStart {
  const b = berlin(t.beginnt_am);
  const e = berlin(new Date(new Date(t.endet_am).getTime() - (t.ganztags ? 1 : 0)));
  return { ...t, datum: b.datum, zeit: b.zeit, dauer: Math.round((new Date(t.endet_am).getTime() - new Date(t.beginnt_am).getTime()) / 60_000), datum_ende: e.datum };
}

/** Gemerkte Formularwerte (nach der Dubletten-Rueckfrage) wieder als Startwerte. */
function gemerktAlsStart(start: TerminStart, g: Record<string, string>): TerminStart {
  const s: TerminStart = { ...start };
  if (g["titel"] !== undefined) s.titel = g["titel"];
  if (g["ort"] !== undefined) s.ort = g["ort"] || null;
  if (g["notiz"] !== undefined) s.notiz = g["notiz"] || null;
  if (g["objekt_id"]) s.objekt_id = g["objekt_id"];
  if (g["zustaendig_id"]) s.zustaendig_id = g["zustaendig_id"];
  if (g["zeit"]) s.zeit = g["zeit"];
  if (g["dauer_minuten"]) s.dauer = Number(g["dauer_minuten"]);
  if (g["datum_ende"]) s.datum_ende = g["datum_ende"];
  if (g["erinnerung_minuten"] !== undefined) s.erinnerung_minuten = g["erinnerung_minuten"] === "" ? null : Number(g["erinnerung_minuten"]);
  s.privat = g["privat"] === "1";
  s.nachfassen = g["nachfassen"] !== "0";
  s.erinnerung_kunde = g["erinnerung_kunde"] !== "0";
  return s;
}

/**
 * Termin-Dialog (Referenz: Kalender): Anlass, Art, Zeit oder ganztaegig, Ort,
 * Objekt/Kontakt, Zustaendiger und Teilnehmer, Erinnerung, Nachfassen, privat,
 * Serie (nur beim Anlegen), Terminbestaetigung an den Kontakt.
 */
export function TerminFormular({ start, mitarbeiter, objekte, kontakte, benutzerId, standardDauer = 60, weiter, kompakt = false, schliessen }: {
  start: TerminStart;
  mitarbeiter: Mitarbeiter[];
  objekte: Array<{ id: string; bezeichnung: string }>;
  kontakte: Array<{ id: string; bezeichnung: string; email: string | null }>;
  benutzerId: string;
  standardDauer?: number;
  /** „detail“: nach dem Anlegen zur Detailseite */
  weiter?: "detail" | undefined;
  kompakt?: boolean;
  schliessen?: (() => void) | undefined;
}) {
  // React setzt das Formular nach jeder Aktion zurueck. Bei der Dubletten-
  // Rueckfrage sollen die Eingaben aber stehen bleiben — deshalb werden sie
  // beim Absenden gemerkt und nach der Rueckfrage wieder eingesetzt.
  const [gemerkt, setGemerkt] = useState<Record<string, string>>({});
  const [zustand, aktion, laeuft] = useActionState<KalenderErgebnis, FormData>(async (vorher, fd) => {
    const o: Record<string, string> = {};
    fd.forEach((v, k) => { if (typeof v === "string") o[k] = v; });
    setGemerkt(o);
    return terminSpeichern(vorher, fd);
  }, {});
  const [urlaub, urlaubAktion, urlaubLaeuft] = useActionState<VerwaltungErgebnis, FormData>(urlaubBeantragen, {});
  const bearbeiten = Boolean(start.id);
  const [art, setArt] = useState<Terminart | "urlaub">(start.art ?? "besichtigung");
  const [ganztags, setGanztags] = useState(Boolean(start.ganztags));
  const [kontaktId, setKontaktId] = useState(start.kontakt_id ?? "");
  const [serieWahl, setSerieWahl] = useState<SerieWahl>("keine");
  const [eigen, setEigen] = useState<SerienRegel>(start.serie_regel ?? serieStandard());
  const [datum, setDatum] = useState(start.datum ?? berlin(new Date()).datum);
  const [teilnehmer, setTeilnehmer] = useState<string[]>(start.teilnehmer ?? [start.zustaendig_id ?? benutzerId]);
  const regel = regelAusWahl(serieWahl, eigen);
  const vorschau = regel ? serienDaten(datum, regel) : [];
  const kontaktMail = kontakte.find((k) => k.id === kontaktId)?.email ?? null;

  const s: TerminStart = zustand.doppelt ? gemerktAlsStart(start, gemerkt) : start;
  const leadGemerkt = zustand.doppelt ? gemerkt["lead_anlegen"] === "1" : false;

  const toggleTeilnehmer = (id: string) => setTeilnehmer((alt) => (alt.includes(id) ? alt.filter((x) => x !== id) : [...alt, id]));

  // Urlaub aus dem Kalenderdialog (Referenz: Terminart „Urlaub" → Antrag ins Dashboard)
  if (art === "urlaub" && !bearbeiten) {
    return (
      <form action={urlaubAktion} className={kompakt ? "space-y-3 rounded-[var(--radius)] border border-linie bg-flaeche p-3" : "space-y-4"}>
        {urlaub.fehler && <Hinweis ton="fehler">{urlaub.fehler}</Hinweis>}
        {urlaub.erfolg && <Hinweis ton="erfolg">{urlaub.erfolg}</Hinweis>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Feld id="tf-art" beschriftung="Art"><Auswahl value="urlaub" onChange={(e) => setArt(e.target.value as Terminart | "urlaub")}>{Object.entries(TERMINARTEN).map(([w, n]) => <option key={w} value={w}>{n}</option>)}<option value="urlaub">Urlaub (Antrag)</option></Auswahl></Feld>
          <Feld id="tf-u-von" beschriftung="Von" pflicht><Eingabe name="von" type="date" required value={datum} onChange={(e) => setDatum(e.target.value)} /></Feld>
          <Feld id="tf-u-bis" beschriftung="Bis" pflicht><Eingabe name="bis" type="date" required defaultValue={start.datum_ende ?? datum} /></Feld>
        </div>
        <Feld id="tf-u-bem" beschriftung="Bemerkung"><Textfeld name="bemerkung" rows={2} maxLength={500} /></Feld>
        <p className="text-[12px] text-gedaempft">Der Antrag geht an die Verwaltung; genehmigter Urlaub erscheint als ganztägiger Eintrag im Kalender und in der Arbeitszeit. Beantragter Urlaub ist bis zur Entscheidung als „beantragt“ sichtbar.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={urlaubLaeuft} groesse={kompakt ? "klein" : "standard"}>{urlaubLaeuft ? "Sendet …" : "Urlaub beantragen"}</Button>
          {schliessen && <Button type="button" variante="leise" groesse={kompakt ? "klein" : "standard"} onClick={schliessen}>Abbrechen</Button>}
        </div>
      </form>
    );
  }

  return (
    <form key={zustand.doppelt ? "rueckfrage" : "neu"} action={aktion} className={kompakt ? "space-y-3 rounded-[var(--radius)] border border-linie bg-flaeche p-3" : "space-y-4"}>
      {s.id && <input type="hidden" name="id" value={s.id} />}
      {weiter && <input type="hidden" name="weiter" value={weiter} />}
      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
      {zustand.erfolg && <Hinweis ton="erfolg">{zustand.erfolg}</Hinweis>}
      {zustand.doppelt && (
        <Hinweis ton="warnung">
          {zustand.doppelt}
          <input type="hidden" name="doppelt_bestaetigt" value="1" />
          <span className="mt-2 block"><Button type="submit" variante="sekundaer" groesse="klein">Ja, zweiten Termin anlegen</Button></span>
        </Hinweis>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><Feld id="tf-titel" beschriftung="Anlass" pflicht><Eingabe name="titel" required maxLength={300} defaultValue={s.titel ?? ""} placeholder="Besichtigung Familie Sommer" /></Feld></div>
        <Feld id="tf-art" beschriftung="Art">
          <Auswahl name="art" value={art} onChange={(e) => setArt(e.target.value as Terminart | "urlaub")}>{Object.entries(TERMINARTEN).map(([w, n]) => <option key={w} value={w}>{n}</option>)}{!bearbeiten && <option value="urlaub">Urlaub (Antrag)</option>}</Auswahl>
        </Feld>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Feld id="tf-datum" beschriftung={ganztags ? "Von" : "Datum"} pflicht><Eingabe name="datum" type="date" required value={datum} onChange={(e) => setDatum(e.target.value)} /></Feld>
        {ganztags ? (
          <Feld id="tf-datum-ende" beschriftung="Bis"><Eingabe name="datum_ende" type="date" defaultValue={s.datum_ende ?? s.datum ?? datum} /></Feld>
        ) : (
          <>
            <Feld id="tf-zeit" beschriftung="Uhrzeit" pflicht><Eingabe name="zeit" type="time" required defaultValue={s.zeit ?? "10:00"} step={300} /></Feld>
            <Feld id="tf-dauer" beschriftung="Dauer">
              <Auswahl name="dauer_minuten" defaultValue={String(s.dauer ?? (art === "besichtigung" ? standardDauer : 60))}>
                {[15, 30, 45, 60, 90, 120, 180, 240, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} Minuten` : m % 60 === 0 ? `${m / 60} Std` : `${Math.floor(m / 60)},${((m % 60) / 60) * 10} Std`}</option>)}
              </Auswahl>
            </Feld>
          </>
        )}
        <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-[13px] text-text"><input type="checkbox" name="ganztags" value="1" checked={ganztags} onChange={(e) => setGanztags(e.target.checked)} className="h-4 w-4 accent-akzent" />Ganztägig</label></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Feld id="tf-ort" beschriftung="Ort" hinweis="Leer = Anschrift des Objekts"><Eingabe name="ort" maxLength={300} defaultValue={s.ort ?? ""} placeholder="Vor Ort" /></Feld>
        <Feld id="tf-objekt" beschriftung="Objekt"><Auswahl name="objekt_id" defaultValue={s.objekt_id ?? ""}><option value="">— ohne —</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>
        <Feld id="tf-kontakt" beschriftung="Kontakt"><Auswahl name="kontakt_id" value={kontaktId} onChange={(e) => setKontaktId(e.target.value)}><option value="">— ohne —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung}</option>)}</Auswahl></Feld>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Feld id="tf-zust" beschriftung="Zuständig"><Auswahl name="zustaendig_id" defaultValue={s.zustaendig_id ?? benutzerId}>{mitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Auswahl></Feld>
        <div className="sm:col-span-2">
          <p className="mb-1 text-[12px] font-medium text-text">Teilnehmer</p>
          <div className="flex flex-wrap gap-2">
            {mitarbeiter.map((m) => (
              <label key={m.id} className={`flex cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border px-2.5 py-1 text-[12px] ${teilnehmer.includes(m.id) ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>
                <input type="checkbox" name="teilnehmer" value={m.id} checked={teilnehmer.includes(m.id)} onChange={() => toggleTeilnehmer(m.id)} className="sr-only" />
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: m.farbe ?? "#1B2A47" }} aria-hidden="true" />
                {m.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Feld id="tf-erinnerung" beschriftung="Erinnerung intern" hinweis="Per E-Mail an Zuständigen und Teilnehmer">
          <Auswahl name="erinnerung_minuten" defaultValue={s.erinnerung_minuten === undefined ? "360" : s.erinnerung_minuten === null ? "" : String(s.erinnerung_minuten)}>{ERINNERUNGEN.map(([w, n]) => <option key={w} value={w}>{n}</option>)}</Auswahl>
        </Feld>
        <div className="flex flex-col justify-end gap-2 pb-2 sm:col-span-3 sm:flex-row sm:items-center sm:gap-5">
          {kontaktId && <label className="flex items-center gap-2 text-[13px] text-text"><input type="hidden" name="erinnerung_kunde" value="0" /><input type="checkbox" name="erinnerung_kunde" value="1" defaultChecked={s.erinnerung_kunde !== false} className="h-4 w-4 accent-akzent" />Kontakt etwa 6 Stunden vorher automatisch erinnern</label>}
          {art === "besichtigung" && <label className="flex items-center gap-2 text-[13px] text-text"><input type="hidden" name="nachfassen" value="0" /><input type="checkbox" name="nachfassen" value="1" defaultChecked={s.nachfassen !== false} className="h-4 w-4 accent-akzent" />Nach 3 Tagen nachfassen (Vorschlag mit Mailentwurf auf der Startseite)</label>}
          <label className="flex items-center gap-2 text-[13px] text-text"><input type="checkbox" name="privat" value="1" defaultChecked={Boolean(s.privat)} className="h-4 w-4 accent-akzent" />Privat (nur Beteiligte und Verwaltung sehen Details)</label>
        </div>
      </div>

      <Feld id="tf-notiz" beschriftung="Notiz"><Textfeld name="notiz" rows={kompakt ? 2 : 3} maxLength={2000} defaultValue={s.notiz ?? ""} /></Feld>

      {!bearbeiten && (
        <label className="flex items-start gap-2 text-[13px] text-text">
          <input type="checkbox" name="lead_anlegen" value="1" defaultChecked={leadGemerkt} className="mt-0.5 h-4 w-4 accent-akzent" />
          <span>In der Akquise als Lead anlegen <span className="text-gedaempft">— mit Kontakt und Objekt aus diesem Termin. Gibt es zu der Adresse schon einen Lead, wird nur verknüpft.{kontaktId ? "" : " Ohne Kontakt läuft keine Automation und keine Terminbestätigung; lässt sich später am Lead nachtragen."}</span></span>
        </label>
      )}

      {!bearbeiten && (
        <div className="rounded-[var(--radius)] border border-linie bg-hintergrund p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Feld id="tf-serie" beschriftung="Wiederholung"><Auswahl name="serie_wahl" value={serieWahl} onChange={(e) => setSerieWahl(e.target.value as SerieWahl)}>{(Object.keys(SERIE_WAHL) as SerieWahl[]).map((w) => <option key={w} value={w}>{SERIE_WAHL[w]}</option>)}</Auswahl></Feld>
            {serieWahl === "eigen" && (
              <>
                <Feld id="tf-serie-intervall" beschriftung="Alle"><Eingabe name="serie_intervall" inputMode="numeric" value={String(eigen.intervall)} onChange={(e) => setEigen({ ...eigen, intervall: Math.max(1, Number(e.target.value) || 1) })} /></Feld>
                <Feld id="tf-serie-takt" beschriftung="Einheit"><Auswahl name="serie_takt" value={eigen.takt} onChange={(e) => setEigen({ ...eigen, takt: e.target.value as SerieTakt })}>{(Object.keys(SERIE_EINHEIT) as SerieTakt[]).map((t) => <option key={t} value={t}>{SERIE_EINHEIT[t]}</option>)}</Auswahl></Feld>
              </>
            )}
            {serieWahl !== "keine" && (
              <Feld id="tf-serie-ende" beschriftung="Ende">
                <div className="flex gap-2">
                  <Auswahl name="serie_ende_art" value={eigen.ende_art} onChange={(e) => setEigen({ ...eigen, ende_art: e.target.value as "anzahl" | "datum" })} className="w-auto"><option value="anzahl">nach Anzahl</option><option value="datum">am Datum</option></Auswahl>
                  {eigen.ende_art === "anzahl" ? <Eingabe name="serie_anzahl" inputMode="numeric" value={String(eigen.anzahl)} onChange={(e) => setEigen({ ...eigen, anzahl: Math.max(1, Number(e.target.value) || 1) })} className="w-20" /> : <Eingabe name="serie_bis" type="date" value={eigen.bis ?? ""} onChange={(e) => setEigen({ ...eigen, bis: e.target.value || null })} />}
                </div>
              </Feld>
            )}
          </div>
          {regel && regel.takt === "woche" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WOCHENTAGE.map(([n, w]) => (
                <label key={w} className={`cursor-pointer rounded-[var(--radius)] border px-2.5 py-1 text-[12px] ${eigen.wochentage.includes(w) ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>
                  <input type="checkbox" name="serie_wochentage" value={w} checked={eigen.wochentage.includes(w)} onChange={() => setEigen({ ...eigen, wochentage: eigen.wochentage.includes(w) ? eigen.wochentage.filter((x) => x !== w) : [...eigen.wochentage, w].sort() })} className="sr-only" />{n}
                </label>
              ))}
            </div>
          )}
          {regel && <p className="mt-2 text-[12px] text-gedaempft">{serieText(regel)} · {vorschau.length} Termin{vorschau.length === 1 ? "" : "e"}{vorschau.length > 0 ? `, zuletzt am ${vorschau[vorschau.length - 1]?.split("-").reverse().join(".")}` : ""}</p>}
        </div>
      )}

      {bearbeiten && s.serie_id && (
        <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius)] border border-linie bg-hintergrund p-3 text-[13px]">
          <span className="text-gedaempft">Serientermin ({serieText(s.serie_regel)}) — Änderung gilt für:</span>
          <label className="flex items-center gap-1.5"><input type="radio" name="serie_umfang" value="dieser" defaultChecked className="accent-akzent" />nur diesen Termin</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="serie_umfang" value="folgende" className="accent-akzent" />diesen und alle folgenden</label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={laeuft} groesse={kompakt ? "klein" : "standard"}>{laeuft ? "Speichert …" : bearbeiten ? "Speichern" : regel && vorschau.length > 1 ? `${vorschau.length} Termine anlegen` : "Termin anlegen"}</Button>
        {kontaktMail && <label className="flex items-center gap-2 text-[13px] text-text"><input type="checkbox" name="bestaetigung" value="1" className="h-4 w-4 accent-akzent" />Terminbestätigung an {kontaktMail} senden (öffnet das Postfach mit Kalenderdatei)</label>}
        {schliessen && <Button type="button" variante="leise" groesse={kompakt ? "klein" : "standard"} onClick={schliessen}>Abbrechen</Button>}
      </div>
    </form>
  );
}
