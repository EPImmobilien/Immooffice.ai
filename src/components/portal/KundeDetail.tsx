"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { dateigroesse } from "@/lib/dokumente";
import { datum, zeitpunkt } from "@/lib/format";
import { AKTIVITAET_ART, ANTRAG_STATUS, FORTSCHRITT, KUNDEN_ART, type PortalKunde } from "@/lib/portal/typen";
import { antragZeilen, type AntragDaten } from "@/lib/portal/verbrauchsausweis";
import {
  antragStatusSetzen,
  dateiLink,
  kundeAendern,
  kundeDokumentHochladen,
  kundeDokumentLoeschen,
  kundeLinkErneuern,
  kundeLoeschen,
  kundeNachrichtenGelesen,
  kundeNachrichtSenden,
  kundeObjektZuordnen,
  type PortalErgebnis,
} from "@/server/portal-aktionen";

const REITER = [["objekte", "Objekte"], ["unterlagen", "Unterlagen"], ["nachrichten", "Nachrichten"], ["antraege", "Anträge"], ["aktivitaeten", "Aktivitäten"], ["zugang", "Zugang"]] as const;
type Reiter = (typeof REITER)[number][0];

export interface KundeDaten {
  kunde: PortalKunde;
  projekt: { id: string; name: string } | null;
  objekte: Array<{ id: string; bezeichnung: string; status: string; vertrag_id: string | null; zugeordnet: boolean }>;
  vertraege: Array<{ id: string; titel: string; objekt_id: string | null }>;
  dokumente: Array<{ id: string; name: string; kategorie: string; pfad: string; bytes: number | null; hochgeladen_von: string; gesehen_am: string | null; objekt_id: string | null; erstellt_am: string }>;
  nachrichten: Array<{ id: string; richtung: string; text: string; gelesen_am: string | null; erstellt_am: string }>;
  aktivitaeten: Array<{ id: string; art: string; detail: string | null; gesehen_am: string | null; erstellt_am: string }>;
  antraege: Array<{ id: string; status: string; daten: AntragDaten; objekt_id: string | null; eingereicht_am: string | null; erstellt_am: string }>;
  checkliste: Array<{ objekt_id: string; titel: string; pflicht: boolean; status: string }>;
  mitarbeiter: Array<{ id: string; name: string }>;
  darfAendern: boolean;
  darfLoeschen: boolean;
}

function Meldung({ z }: { z: PortalErgebnis }) {
  return <>{z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}{z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}</>;
}

/** Kundenakte (Referenz: Kundenbereich → Eigentuemer/Kaeufer → Detail). */
export function KundeDetail(d: KundeDaten) {
  const [reiter, setReiter] = useState<Reiter>(d.kunde.projekt_id ? "nachrichten" : "objekte");
  const ungelesen = d.nachrichten.filter((n) => n.richtung === "kunde" && !n.gelesen_am).length;
  const neu = d.aktivitaeten.filter((a) => !a.gesehen_am).length;
  const uploads = d.dokumente.filter((x) => x.hochgeladen_von === "kunde" && !x.gesehen_am).length;
  const zaehler: Partial<Record<Reiter, number>> = { nachrichten: ungelesen, aktivitaeten: neu, unterlagen: uploads, antraege: d.antraege.filter((a) => a.status === "eingereicht").length };
  return (
    <div className="space-y-4">
      <Karte>
        <KarteInhalt className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <div>
            <p className="text-[15px] font-semibold">{d.kunde.anzeigename} <Marke ton={d.kunde.art === "eigentuemer" ? "akzent" : "neutral"}>{KUNDEN_ART[d.kunde.art]}</Marke> {!d.kunde.aktiv && <Marke ton="fehler">gesperrt</Marke>}</p>
            <p className="text-gedaempft">{d.kunde.email}{d.kunde.telefon ? ` · ${d.kunde.telefon}` : ""}{d.projekt ? <> · Projekt <Link href={`/projekte/${d.projekt.id}`} className="text-akzent hover:underline">{d.projekt.name}</Link></> : null}{d.kunde.kontakt_id ? <> · <Link href={`/kontakte/${d.kunde.kontakt_id}`} className="text-akzent hover:underline">Adressbuch</Link></> : null}</p>
            <p className="text-[11px] text-gedaempft">Eingeladen {datum(d.kunde.eingeladen_am)} · {d.kunde.angenommen_am ? `angenommen ${datum(d.kunde.angenommen_am)}` : "noch nicht geöffnet"}{d.kunde.letzter_login_am ? ` · zuletzt ${zeitpunkt(d.kunde.letzter_login_am)}` : ""} · Passwort {d.kunde.passwort_hash ? "gesetzt" : "nicht gesetzt"}</p>
          </div>
          {(ungelesen > 0 || neu > 0 || uploads > 0) && d.darfAendern && <form action={kundeNachrichtenGelesen}><input type="hidden" name="kunde_id" value={d.kunde.id} /><Button type="submit" groesse="klein" variante="sekundaer">Alles als gesehen markieren</Button></form>}
        </KarteInhalt>
      </Karte>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {REITER.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={reiter === k} onClick={() => setReiter(k)} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${reiter === k ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft hover:text-text"}`}>
            {l}{zaehler[k] ? <span className="ml-1 rounded-full bg-primaer px-1.5 text-[10px] text-white">{zaehler[k]}</span> : null}
          </button>
        ))}
      </div>
      {reiter === "objekte" && <Objekte {...d} />}
      {reiter === "unterlagen" && <Unterlagen {...d} />}
      {reiter === "nachrichten" && <Nachrichten {...d} />}
      {reiter === "antraege" && <Antraege {...d} />}
      {reiter === "aktivitaeten" && <Aktivitaeten {...d} />}
      {reiter === "zugang" && <Zugang {...d} />}
    </div>
  );
}

function Objekte(d: KundeDaten) {
  const zugeordnet = d.objekte.filter((o) => o.zugeordnet);
  const frei = d.objekte.filter((o) => !o.zugeordnet);
  return (
    <Karte>
      <KarteKopf><KarteTitel>Objekte im Kundenbereich</KarteTitel><KarteBeschreibung>Der Kunde sieht zu jedem Objekt Vermarktungsstand, Kundendokumente (Sichtbarkeit „Kunde“ am Objekt) und die Unterlagen-Checkliste.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-3 text-[13px]">
        {zugeordnet.length === 0 && <p className="text-gedaempft">{d.kunde.projekt_id ? "Projekt-Zugang — Objekte laufen über das Projekt." : "Noch kein Objekt zugeordnet."}</p>}
        {zugeordnet.map((o) => {
          const punkte = d.checkliste.filter((c) => c.objekt_id === o.id);
          const pflicht = punkte.filter((c) => c.pflicht);
          const erledigt = pflicht.filter((c) => c.status === "erledigt").length;
          return (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-linie p-2">
              <div><Link href={`/objekte/${o.id}`} className="font-medium text-akzent hover:underline">{o.bezeichnung}</Link> <Marke>{o.status}</Marke>{pflicht.length > 0 && <p className="text-[11px] text-gedaempft">Unterlagen-Checkliste: {erledigt}/{pflicht.length} Pflichtpunkte erledigt</p>}{o.vertrag_id && <p className="text-[11px] text-gedaempft">Vertrag: {d.vertraege.find((v) => v.id === o.vertrag_id)?.titel ?? "verknüpft"}</p>}</div>
              {d.darfAendern && <form action={kundeObjektZuordnen}><input type="hidden" name="kunde_id" value={d.kunde.id} /><input type="hidden" name="objekt_id" value={o.id} /><input type="hidden" name="entfernen" value="1" /><button type="submit" className="text-gedaempft hover:text-fehler">Entfernen</button></form>}
            </div>
          );
        })}
        {d.darfAendern && frei.length > 0 && (
          <form action={kundeObjektZuordnen} className="flex flex-wrap items-end gap-2 border-t border-linie pt-3">
            <input type="hidden" name="kunde_id" value={d.kunde.id} />
            <Feld id="ko-objekt" beschriftung="Objekt zuordnen"><Auswahl id="ko-objekt" name="objekt_id">{frei.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>
            <Feld id="ko-vertrag" beschriftung="Maklervertrag (optional)"><Auswahl id="ko-vertrag" name="vertrag_id" defaultValue=""><option value="">— keiner —</option>{d.vertraege.map((v) => <option key={v.id} value={v.id}>{v.titel}</option>)}</Auswahl></Feld>
            <Button type="submit" groesse="klein" variante="sekundaer">Zuordnen</Button>
          </form>
        )}
      </KarteInhalt>
    </Karte>
  );
}

function Unterlagen(d: KundeDaten) {
  const [z, hochladen, laeuft] = useActionState<PortalErgebnis, FormData>(kundeDokumentHochladen, {});
  const oeffnen = async (pfad: string) => { const url = await dateiLink(pfad); if (url) window.open(url, "_blank", "noopener"); };
  return (
    <Karte>
      <KarteKopf><KarteTitel>Persönliche Unterlagen</KarteTitel><KarteBeschreibung>Nur dieser Kunde sieht sie — z. B. Reservierungsvereinbarung, Kaufvertragsentwurf. Uploads des Kunden erscheinen hier ebenfalls.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-3 text-[13px]">
        {d.dokumente.length === 0 && <p className="text-gedaempft">Noch keine Unterlagen.</p>}
        {d.dokumente.map((x) => (
          <div key={x.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-linie p-2 ${x.hochgeladen_von === "kunde" && !x.gesehen_am ? "bg-akzent-schwach" : ""}`}>
            <div><button type="button" className="text-left text-akzent hover:underline" onClick={() => void oeffnen(x.pfad)}>{x.name}</button><p className="text-[11px] text-gedaempft">{x.kategorie} · {dateigroesse(x.bytes)} · {datum(x.erstellt_am)} · {x.hochgeladen_von === "kunde" ? "vom Kunden hochgeladen" : x.gesehen_am ? `vom Kunden angesehen ${datum(x.gesehen_am)}` : "vom Kunden noch nicht angesehen"}{x.objekt_id ? ` · ${d.objekte.find((o) => o.id === x.objekt_id)?.bezeichnung ?? ""}` : ""}</p></div>
            {d.darfAendern && <form action={kundeDokumentLoeschen} onSubmit={(ev) => { if (!confirm(`„${x.name}“ löschen?`)) ev.preventDefault(); }}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="kunde_id" value={d.kunde.id} /><button type="submit" className="text-gedaempft hover:text-fehler">Löschen</button></form>}
          </div>
        ))}
        {d.darfAendern && (
          <form action={hochladen} className="grid gap-3 rounded-[var(--radius)] border border-linie bg-hintergrund p-3 md:grid-cols-3">
            <input type="hidden" name="kunde_id" value={d.kunde.id} />
            <Feld id="kd-datei" beschriftung="Datei" pflicht><input id="kd-datei" name="datei" type="file" required className="text-[13px]" /></Feld>
            <Feld id="kd-kat" beschriftung="Kategorie"><Eingabe id="kd-kat" name="kategorie" placeholder="z. B. Reservierungsvereinbarung" maxLength={60} /></Feld>
            <Feld id="kd-objekt" beschriftung="Objekt"><Auswahl id="kd-objekt" name="objekt_id" defaultValue=""><option value="">— keines —</option>{d.objekte.filter((o) => o.zugeordnet).map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>
            <div className="md:col-span-3 flex items-center gap-3"><Button type="submit" groesse="klein" disabled={laeuft}>{laeuft ? "Lädt hoch …" : "Für den Kunden ablegen"}</Button><Meldung z={z} /></div>
          </form>
        )}
      </KarteInhalt>
    </Karte>
  );
}

function Nachrichten(d: KundeDaten) {
  const [z, senden, laeuft] = useActionState<PortalErgebnis, FormData>(kundeNachrichtSenden, {});
  return (
    <Karte>
      <KarteKopf><KarteTitel>Nachrichten</KarteTitel><KarteBeschreibung>Der Kunde antwortet über seinen Kundenbereich und erhält bei neuen Nachrichten eine E-Mail (sofern ein Mail-Dienst eingerichtet ist).</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-3 text-[13px]">
        <div className="max-h-96 space-y-2 overflow-auto rounded-[var(--radius)] border border-linie bg-hintergrund p-2">
          {d.nachrichten.length === 0 && <p className="text-gedaempft">Noch keine Nachrichten.</p>}
          {d.nachrichten.map((n) => <div key={n.id} className={`max-w-[80%] rounded-[var(--radius)] px-3 py-2 ${n.richtung === "makler" ? "ml-auto bg-akzent-schwach" : "border border-linie bg-flaeche"}`}><p className="whitespace-pre-wrap">{n.text}</p><p className="mt-1 text-[10px] text-gedaempft">{n.richtung === "makler" ? "Sie" : d.kunde.anzeigename} · {zeitpunkt(n.erstellt_am)}{n.richtung === "makler" && n.gelesen_am ? " · gelesen" : ""}</p></div>)}
        </div>
        {d.darfAendern && <form action={senden} className="flex gap-2"><input type="hidden" name="kunde_id" value={d.kunde.id} /><Textfeld name="text" rows={2} required maxLength={5000} placeholder="Nachricht an den Kunden …" aria-label="Nachricht" /><Button type="submit" disabled={laeuft}>{laeuft ? "…" : "Senden"}</Button></form>}
        <Meldung z={z} />
      </KarteInhalt>
    </Karte>
  );
}

function Antraege(d: KundeDaten) {
  const [offen, setOffen] = useState<string | null>(null);
  return (
    <Karte>
      <KarteKopf><KarteTitel>Verbrauchsausweis-Anträge</KarteTitel><KarteBeschreibung>Der Eigentümer füllt die Gebäude- und Verbrauchsdaten im Kundenbereich aus; eingereichte Anträge reichen Sie beim Aussteller ein und setzen sie auf „erledigt“.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-2 text-[13px]">
        {d.antraege.length === 0 && <p className="text-gedaempft">Keine Anträge.</p>}
        {d.antraege.map((a) => (
          <div key={a.id} className="rounded-[var(--radius)] border border-linie p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p><Marke ton={a.status === "eingereicht" ? "warnung" : a.status === "erledigt" ? "erfolg" : "neutral"}>{ANTRAG_STATUS[a.status as keyof typeof ANTRAG_STATUS]}</Marke> <span className="ml-1">{String(a.daten["objekt_strasse"] ?? d.objekte.find((o) => o.id === a.objekt_id)?.bezeichnung ?? "Antrag")}</span> <span className="text-[11px] text-gedaempft">· {a.eingereicht_am ? `eingereicht ${zeitpunkt(a.eingereicht_am)}` : `angelegt ${datum(a.erstellt_am)}`}</span></p>
              <div className="flex gap-2">
                <button type="button" className="text-akzent hover:underline" onClick={() => setOffen(offen === a.id ? null : a.id)}>{offen === a.id ? "Zuklappen" : "Angaben"}</button>
                {d.darfAendern && a.status !== "erledigt" && <form action={antragStatusSetzen}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="kunde_id" value={d.kunde.id} /><input type="hidden" name="status" value="erledigt" /><button type="submit" className="text-akzent hover:underline">Als erledigt</button></form>}
                {d.darfAendern && a.status === "eingereicht" && <form action={antragStatusSetzen}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="kunde_id" value={d.kunde.id} /><input type="hidden" name="status" value="in_arbeit" /><button type="submit" className="text-gedaempft hover:text-text">Zurück an Kunden</button></form>}
              </div>
            </div>
            {offen === a.id && (
              <table className="mt-2 w-full text-[12px]"><tbody>{antragZeilen(a.daten).map((z, i) => <tr key={i} className="border-t border-linie"><td className="py-0.5 pr-2 text-gedaempft">{z.abschnitt}</td><td className="py-0.5 pr-2">{z.beschriftung}</td><td className="py-0.5 font-medium">{z.wert}</td></tr>)}</tbody></table>
            )}
          </div>
        ))}
      </KarteInhalt>
    </Karte>
  );
}

function Aktivitaeten(d: KundeDaten) {
  return (
    <Karte>
      <KarteKopf><KarteTitel>Aktivitäten</KarteTitel></KarteKopf>
      <KarteInhalt className="space-y-1 text-[13px]">
        {d.aktivitaeten.length === 0 && <p className="text-gedaempft">Noch nichts.</p>}
        {d.aktivitaeten.map((a) => <div key={a.id} className={`flex flex-wrap gap-2 rounded-[var(--radius)] px-2 py-1 ${a.gesehen_am ? "" : "bg-akzent-schwach"}`}><span className="w-36 shrink-0 text-[11px] text-gedaempft">{zeitpunkt(a.erstellt_am)}</span><span className="text-gedaempft">{AKTIVITAET_ART[a.art as keyof typeof AKTIVITAET_ART] ?? a.art}</span><span>{a.detail}</span></div>)}
      </KarteInhalt>
    </Karte>
  );
}

function Zugang(d: KundeDaten) {
  const [z, aendern, laeuft] = useActionState<PortalErgebnis, FormData>(kundeAendern, {});
  const [zl, linkNeu, laeuftL] = useActionState<PortalErgebnis, FormData>(kundeLinkErneuern, {});
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Karte>
        <KarteKopf><KarteTitel>Stammdaten und Betreuung</KarteTitel><KarteBeschreibung>Adressdaten pflegen Sie im Adressbuch; hier stehen Anzeige, Ansprechpartner und Fortschritt.</KarteBeschreibung></KarteKopf>
        <KarteInhalt>
          <form action={aendern} className="space-y-3">
            <input type="hidden" name="id" value={d.kunde.id} />
            <Feld id="kz-name" beschriftung="Anzeigename"><Eingabe id="kz-name" name="anzeigename" defaultValue={d.kunde.anzeigename} maxLength={200} /></Feld>
            <Feld id="kz-telefon" beschriftung="Telefon"><Eingabe id="kz-telefon" name="telefon" defaultValue={d.kunde.telefon ?? ""} maxLength={60} /></Feld>
            <Feld id="kz-ap" beschriftung="Ansprechpartner"><Auswahl id="kz-ap" name="ansprechpartner_id" defaultValue={d.kunde.ansprechpartner_id ?? ""}><option value="">— keiner —</option>{d.mitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Auswahl></Feld>
            {d.kunde.art === "kaeufer" && (
              <>
                <Feld id="kz-f" beschriftung="Fortschritt der Kaufabwicklung"><Auswahl id="kz-f" name="fortschritt_stufe" defaultValue={String(d.kunde.fortschritt_stufe)}>{FORTSCHRITT.map((s, i) => <option key={s} value={i + 1}>{i + 1}/7 · {s}</option>)}</Auswahl></Feld>
                <Feld id="kz-n" beschriftung="Nächster Schritt (sieht der Kunde)"><Eingabe id="kz-n" name="fortschritt_notiz" defaultValue={d.kunde.fortschritt_notiz ?? ""} maxLength={500} /></Feld>
              </>
            )}
            <Feld id="kz-art" beschriftung="Rolle"><Auswahl id="kz-art" name="art" defaultValue={d.kunde.art}>{Object.entries(KUNDEN_ART).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
            <Meldung z={z} />
            {d.darfAendern && <Button type="submit" disabled={laeuft}>Speichern</Button>}
          </form>
        </KarteInhalt>
      </Karte>
      <Karte>
        <KarteKopf><KarteTitel>Zugang</KarteTitel></KarteKopf>
        <KarteInhalt className="space-y-3 text-[13px]">
          <p>Status: <Marke ton={d.kunde.aktiv ? "erfolg" : "fehler"}>{d.kunde.aktiv ? "aktiv" : "gesperrt"}</Marke> · Passwort {d.kunde.passwort_hash ? "gesetzt" : "nicht gesetzt"}</p>
          {d.darfAendern && (
            <div className="flex flex-wrap gap-2">
              <form action={aendern}><input type="hidden" name="id" value={d.kunde.id} /><input type="hidden" name="aktiv" value={d.kunde.aktiv ? "0" : "1"} /><Button type="submit" groesse="klein" variante="sekundaer">{d.kunde.aktiv ? "Sperren" : "Freischalten"}</Button></form>
              {d.kunde.passwort_hash && <form action={aendern}><input type="hidden" name="id" value={d.kunde.id} /><input type="hidden" name="passwort_zuruecksetzen" value="1" /><Button type="submit" groesse="klein" variante="sekundaer">Passwort zurücksetzen</Button></form>}
              <form action={linkNeu}><input type="hidden" name="id" value={d.kunde.id} /><Button type="submit" groesse="klein" disabled={laeuftL} onClick={(e) => { if (!confirm("Neuen Zugangslink erzeugen? Der bisherige wird ungültig.")) e.preventDefault(); }}>Login-Link neu senden</Button></form>
            </div>
          )}
          {zl.link && <div className="flex gap-2"><Eingabe readOnly value={zl.link} onFocus={(e) => e.currentTarget.select()} aria-label="Zugangslink" /><Button type="button" groesse="klein" variante="sekundaer" onClick={() => { void navigator.clipboard?.writeText(zl.link ?? "").then(() => setKopiert(true)); }}>{kopiert ? "Kopiert" : "Kopieren"}</Button></div>}
          <Meldung z={zl} />
          <p className="text-[12px] text-gedaempft">Der Zugangslink liegt nicht im System — nur sein Hash. Verliert der Kunde den Link, erzeugen Sie hier einen neuen.</p>
          {d.darfLoeschen && (
            <form action={kundeLoeschen} onSubmit={(e) => { if (!confirm("Zugang endgültig löschen? Nachrichten, Unterlagen und Aktivitäten werden mitgelöscht. Tipp: „Sperren“ reicht oft.")) e.preventDefault(); }} className="border-t border-linie pt-3">
              <input type="hidden" name="id" value={d.kunde.id} />
              <Button type="submit" groesse="klein" variante="sekundaer">Zugang löschen</Button>
            </form>
          )}
        </KarteInhalt>
      </Karte>
    </div>
  );
}
