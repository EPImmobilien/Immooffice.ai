"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, KiKennzeichen, Marke } from "@/components/ui/Status";
import { AUFGABEN_STATUS, AUFGABEN_TYPEN, PRIORITAETEN, WIEDERHOLUNGEN, type AufgabeErweitert, type Kommentar, type Schritt, type Tag } from "@/lib/arbeitsmittel";
import { cn } from "@/lib/cn";
import { datum, zeitpunkt } from "@/lib/format";
import { aufgabeLoeschen, aufgabeSpeichern, aufgabeStatus, kommentarAnlegen, schrittAnlegen, schrittLoeschen, schrittUmschalten, textKorrigieren, type ArbeitsErgebnis } from "@/server/arbeitsmittel-aktionen";

export interface Verknuepfung { art: "objekt" | "kontakt" | "lead" | "termin" | "nachricht" | "vertrag"; bezeichnung: string; pfad: string }

/**
 * Aufgabe im Detail (Referenz ToDo-Detail): Felder, Status, Schritte mit
 * Fortschritt, Kommentare mit Systemverlauf, Verknuepfungen, Korrektur des
 * Beschreibungstexts per KI (1 Credit).
 */
export function AufgabeDetail({ aufgabe, schritte, kommentare, tags, verknuepfungen, benutzer, objekte, kontakte, kiVerfuegbar, darfAendern, darfLoeschen }: { aufgabe: AufgabeErweitert; schritte: Schritt[]; kommentare: Kommentar[]; tags: Tag[]; verknuepfungen: Verknuepfung[]; benutzer: { id: string; name: string }[]; objekte: { id: string; objektnummer: string; bezeichnung: string }[]; kontakte: { id: string; name: string }[]; kiVerfuegbar: boolean; darfAendern: boolean; darfLoeschen: boolean }) {
  const [erg, speichern, speichert] = useActionState<ArbeitsErgebnis, FormData>(aufgabeSpeichern, {});
  const [schrittErg, schrittAktion, schrittLaeuft] = useActionState<ArbeitsErgebnis, FormData>(schrittAnlegen, {});
  const [kommentarErg, kommentarAktion, kommentarLaeuft] = useActionState<ArbeitsErgebnis, FormData>(kommentarAnlegen, {});
  const [korrektur, korrekturAktion, korrigiert] = useActionState<ArbeitsErgebnis, FormData>(textKorrigieren, {});
  const [beschreibung, setBeschreibung] = useState(aufgabe.beschreibung ?? "");
  const [korrekturUebernommen, setKorrekturUebernommen] = useState<string | null>(null);
  if (korrektur.text && korrekturUebernommen !== korrektur.text) { setKorrekturUebernommen(korrektur.text); setBeschreibung(korrektur.text); }
  const fertig = schritte.filter((s) => s.erledigt_am).length;
  const gesperrt = !darfAendern;
  const a = aufgabe;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        <Karte>
          <KarteKopf>
            <KarteTitel>{AUFGABEN_TYPEN[a.typ]}</KarteTitel>
            <KarteBeschreibung>Angelegt {zeitpunkt(a.erstellt_am)}{a.quelle ? ` · Quelle ${a.quelle}` : ""}{a.erledigt_am ? ` · erledigt ${zeitpunkt(a.erledigt_am)}` : ""}</KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <form action={speichern} className="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="aufgabe_id" value={a.id} />
              <div className="sm:col-span-4"><Feld id="ad-titel" beschriftung="Titel" pflicht><Eingabe name="titel" defaultValue={a.titel} readOnly={gesperrt} required /></Feld></div>
              <Feld id="ad-status" beschriftung="Status"><Auswahl name="status" defaultValue={a.status} disabled={gesperrt}>{Object.entries(AUFGABEN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="ad-prio" beschriftung="Priorität"><Auswahl name="prioritaet" defaultValue={a.prioritaet} disabled={gesperrt}>{Object.entries(PRIORITAETEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="ad-faellig" beschriftung="Fällig am"><Eingabe name="faellig_am" type="date" defaultValue={a.faellig_am ?? ""} readOnly={gesperrt} /></Feld>
              <Feld id="ad-erinnerung" beschriftung="Erinnerung"><Eingabe name="erinnerung_am" type="datetime-local" defaultValue={a.erinnerung_am ? a.erinnerung_am.slice(0, 16) : ""} readOnly={gesperrt} /></Feld>
              <Feld id="ad-typ" beschriftung="Art"><Auswahl name="typ" defaultValue={a.typ} disabled={gesperrt}>{Object.entries(AUFGABEN_TYPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="ad-wdh" beschriftung="Wiederholung" hinweis="Beim Erledigen entsteht die nächste"><Auswahl name="wiederholung" defaultValue={a.wiederholung ?? ""} disabled={gesperrt}><option value="">keine</option>{Object.entries(WIEDERHOLUNGEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              <Feld id="ad-zustaendig" beschriftung="Zuständig" hinweis="Wechsel = Übergabe (im Verlauf)"><Auswahl name="zustaendig_id" defaultValue={a.zustaendig_id ?? ""} disabled={gesperrt}><option value="">—</option>{benutzer.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Auswahl></Feld>
              <Feld id="ad-sichtbar" beschriftung="Sichtbar für"><Auswahl name="team_sichtbar" defaultValue={a.team_sichtbar ? "1" : "0"} disabled={gesperrt}><option value="1">Team</option><option value="0">nur mich (Notiz)</option></Auswahl></Feld>
              <div className="sm:col-span-2"><Feld id="ad-objekt" beschriftung="Objekt"><Auswahl name="objekt_id" defaultValue={a.objekt_id ?? ""} disabled={gesperrt}><option value="">—</option>{objekte.map((o) => <option key={o.id} value={o.id}>{o.objektnummer} · {o.bezeichnung}</option>)}</Auswahl></Feld></div>
              <div className="sm:col-span-2"><Feld id="ad-kontakt" beschriftung="Kontakt"><Auswahl name="kontakt_id" defaultValue={a.kontakt_id ?? ""} disabled={gesperrt}><option value="">—</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Auswahl></Feld></div>
              {a.lead_id && <input type="hidden" name="lead_id" value={a.lead_id} />}
              <div className="sm:col-span-4"><Feld id="ad-tags" beschriftung="Tags" hinweis={tags.length > 0 ? `Vorhanden: ${tags.map((t) => `#${t.name}`).join(" ")}` : "Mit Komma oder Leerzeichen trennen"}><Eingabe name="tags" defaultValue={a.tags.map((t) => `#${t}`).join(" ")} readOnly={gesperrt} /></Feld></div>
              <div className="sm:col-span-4">
                <Feld id="ad-beschreibung" beschriftung="Beschreibung"><Textfeld name="beschreibung" rows={5} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} readOnly={gesperrt} /></Feld>
                {korrektur.hinweis && <p className="mt-1 text-[12px] text-gedaempft">{korrektur.hinweis} {korrektur.text && <KiKennzeichen art="erzeugt" />}</p>}
                {korrektur.fehler && <p className="mt-1 text-[12px] text-fehler">{korrektur.fehler}</p>}
              </div>
              {erg.fehler && <Hinweis ton="fehler" className="sm:col-span-4">{erg.fehler}</Hinweis>}
              {erg.erfolg && <Hinweis ton="erfolg" className="sm:col-span-4">{erg.erfolg}</Hinweis>}
              {!gesperrt && <div className="sm:col-span-4 flex flex-wrap gap-2"><Button type="submit" laedt={speichert}>Speichern</Button></div>}
            </form>
            {!gesperrt && (
              <form action={korrekturAktion} className="mt-2">
                <input type="hidden" name="text" value={beschreibung} />
                <Button type="submit" variante="leise" groesse="klein" laedt={korrigiert} disabled={!beschreibung.trim()}>Rechtschreibung prüfen {kiVerfuegbar ? "(KI, 1 Credit)" : "(ohne Modellzugang)"}</Button>
              </form>
            )}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf><KarteTitel>Schritte</KarteTitel><KarteBeschreibung>{schritte.length === 0 ? "Teilaufgaben, die nacheinander abgehakt werden." : `${fertig} von ${schritte.length} erledigt`}</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="space-y-2">
            {schritte.length > 0 && <div className="h-1.5 w-full rounded-full bg-flaeche-gedaempft"><div className="h-1.5 rounded-full bg-erfolg" style={{ width: `${Math.round((fertig / schritte.length) * 100)}%` }} /></div>}
            <ul className="divide-y divide-linie">
              {schritte.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                  {darfAendern ? (
                    <form action={schrittUmschalten}><input type="hidden" name="schritt_id" value={s.id} /><button type="submit" aria-label={s.erledigt_am ? "Wieder öffnen" : "Erledigt"} className={cn("flex h-[16px] w-[16px] items-center justify-center rounded-[4px] border", s.erledigt_am ? "border-erfolg bg-erfolg text-erfolg-text" : "border-linie-stark")}>{s.erledigt_am ? "✓" : ""}</button></form>
                  ) : <span className={cn("h-[16px] w-[16px] rounded-[4px] border", s.erledigt_am ? "bg-erfolg" : "border-linie")} />}
                  <span className={cn("flex-1", s.erledigt_am ? "text-gedaempft line-through" : "text-text")}>{s.titel}</span>
                  {darfAendern && <form action={schrittLoeschen}><input type="hidden" name="schritt_id" value={s.id} /><Button type="submit" variante="leise" groesse="klein">Entfernen</Button></form>}
                </li>
              ))}
            </ul>
            {darfAendern && (
              <form action={schrittAktion} className="flex gap-2">
                <input type="hidden" name="aufgabe_id" value={a.id} />
                <Eingabe name="titel" placeholder="Neuer Schritt" required className="h-8 text-[13px]" />
                <Button type="submit" variante="sekundaer" groesse="klein" laedt={schrittLaeuft}>Hinzufügen</Button>
                {schrittErg.fehler && <span className="text-[12px] text-fehler">{schrittErg.fehler}</span>}
              </form>
            )}
          </KarteInhalt>
        </Karte>
      </div>

      <div className="space-y-5">
        <Karte>
          <KarteKopf><KarteTitel>Status</KarteTitel></KarteKopf>
          <KarteInhalt className="flex flex-wrap gap-1.5">
            {(Object.keys(AUFGABEN_STATUS) as Array<keyof typeof AUFGABEN_STATUS>).map((s) => (
              darfAendern && s !== a.status ? (
                <form key={s} action={aufgabeStatus}><input type="hidden" name="aufgabe_id" value={a.id} /><input type="hidden" name="status" value={s} /><Button type="submit" variante="leise" groesse="klein">{AUFGABEN_STATUS[s]}</Button></form>
              ) : <Marke key={s} ton={s === a.status ? "akzent" : "neutral"}>{AUFGABEN_STATUS[s]}</Marke>
            ))}
            {darfLoeschen && <form action={aufgabeLoeschen} className="ml-auto"><input type="hidden" name="aufgabe_id" value={a.id} /><Button type="submit" variante="gefahr" groesse="klein">Löschen</Button></form>}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf><KarteTitel>Verknüpfungen</KarteTitel><KarteBeschreibung>Objekt, Kontakt, Lead, Termin, E-Mail, Vertrag — ein Klick springt hin.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>
            {verknuepfungen.length === 0 ? <p className="text-[13px] text-gedaempft">Keine Verknüpfung.</p> : (
              <ul className="space-y-1 text-[13px]">{verknuepfungen.map((v) => <li key={v.pfad}><Marke>{v.art}</Marke> <Link href={v.pfad} className="text-akzent hover:underline">{v.bezeichnung}</Link></li>)}</ul>
            )}
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf><KarteTitel>Kommentare und Verlauf</KarteTitel><KarteBeschreibung>Statuswechsel und Übergaben werden automatisch vermerkt; Kommentare bleiben unveränderbar.</KarteBeschreibung></KarteKopf>
          <KarteInhalt className="space-y-3">
            <ul className="space-y-2 text-[13px]">
              {kommentare.map((k) => (
                <li key={k.id} className={cn("rounded-[var(--radius)] px-3 py-2", k.system ? "bg-flaeche-gedaempft text-gedaempft" : "border border-linie bg-flaeche text-text")}>
                  <p className="whitespace-pre-wrap">{k.text}</p>
                  <p className="mt-0.5 text-[11px] text-gedaempft">{k.benutzer_name ?? "System"} · {zeitpunkt(k.erstellt_am)}</p>
                </li>
              ))}
              {kommentare.length === 0 && <li className="text-gedaempft">Noch keine Einträge.</li>}
            </ul>
            {darfAendern && (
              <form action={kommentarAktion} className="space-y-2">
                <input type="hidden" name="aufgabe_id" value={a.id} />
                <Textfeld name="text" rows={2} placeholder="Kommentar …" required />
                <div className="flex items-center gap-2"><Button type="submit" variante="sekundaer" groesse="klein" laedt={kommentarLaeuft}>Kommentieren</Button>{kommentarErg.fehler && <span className="text-[12px] text-fehler">{kommentarErg.fehler}</span>}</div>
              </form>
            )}
          </KarteInhalt>
        </Karte>
        {a.faellig_am && <p className="text-[12px] text-gedaempft">Fällig {datum(a.faellig_am)}{a.wiederholung ? ` · ${WIEDERHOLUNGEN[a.wiederholung]}` : ""}</p>}
      </div>
    </div>
  );
}
