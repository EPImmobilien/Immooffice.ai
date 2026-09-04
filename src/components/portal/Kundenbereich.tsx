"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { dateigroesse } from "@/lib/dokumente";
import { datum, euro, zeitpunkt } from "@/lib/format";
import { ANFRAGE_ART, ANFRAGE_STATUS, DATEI_KATEGORIEN, EINHEIT_STATUS, FORTSCHRITT, type KundenArt } from "@/lib/portal/typen";
import { ANTRAG_ABSCHNITTE, antragZeilen, type AntragDaten } from "@/lib/portal/verbrauchsausweis";
import {
  kundeAnfrage,
  kundeAntrag,
  kundeDatei,
  kundeMerkliste,
  kundeNachricht,
  kundePasswortSetzen,
  kundeUpdateBilder,
  kundeUpload,
  type KundeErgebnis,
} from "@/server/kunde-aktionen";

/** Daten aus portal_daten(token) — Struktur siehe Migration 20260904160000. */
export interface PortalDaten {
  kunde: { id: string; art: KundenArt; anzeigename: string; email: string; passwort_gesetzt: boolean; fortschritt_stufe: number; fortschritt_notiz: string | null; einheit_id: string | null };
  mandant: { name: string } | null;
  ansprechpartner: { name: string; email: string | null; telefon: string | null; funktion: string | null } | null;
  nachrichten: Array<{ id: string; richtung: string; text: string; erstellt_am: string }>;
  dokumente: Array<{ id: string; name: string; kategorie: string; bytes: number | null; hochgeladen_von: string; objekt_id: string | null; erstellt_am: string }>;
  objekte: Array<{
    id: string; bezeichnung: string; titel: string | null; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null;
    status: string; vermarktungsart: string; kaufpreis: number | null; kaltmiete: number | null; web_expose: boolean | null; aufrufe: number; anfragen: number;
    besichtigungen: number; naechste_besichtigung: string | null;
    dokumente: Array<{ id: string; titel: string; art: string; bytes: number | null; erstellt_am: string }>;
    checkliste: Array<{ id: string; titel: string; pflicht: boolean; status: string; dokumentart: string | null }>;
    verlauf: Array<{ typ: string; beschreibung: string; erstellt_am: string }>;
  }>;
  antraege: Array<{ id: string; status: string; daten: AntragDaten; objekt_id: string | null; geaendert_am: string }>;
  projekt?: { id: string; name: string; strasse: string | null; plz: string | null; ort: string | null; beschreibung: string | null; status: string; vermarktungsart: "kauf" | "miete"; baubeginn: string | null; fertigstellung: string | null } | null;
  einheiten?: Array<{ id: string; we_nr: string; geschoss: string | null; zimmer: number | null; wohnflaeche: number | null; ausrichtung: string | null; kaufpreis: number | null; miete: number | null; hausgeld: number | null; status: string }>;
  merkliste?: string[];
  ordner?: Array<{ id: string; name: string }>;
  dateien?: Array<{ id: string; name: string; kategorie: string; bytes: number | null; ordner_id: string | null; einheit_id: string | null; erstellt_am: string }>;
  updates?: Array<{ id: string; titel: string; text: string | null; bilder: string[]; erstellt_am: string }>;
  gewerke?: Array<{ id: string; gewerk: string; firma: string | null; name: string | null; telefon: string | null; email: string | null; ort: string | null; info: string | null }>;
  anfragen?: Array<{ id: string; einheit_id: string | null; art: string; status: string; nachricht: string | null; erstellt_am: string }>;
}

const OBJEKT_STATUS: Record<string, string> = { akquise: "In Vorbereitung", vorbereitung: "In Vorbereitung", aktiv: "In der Vermarktung", reserviert: "Reserviert", verkauft: "Verkauft", vermietet: "Vermietet", zurueckgezogen: "Zurückgezogen", archiviert: "Abgeschlossen" };

function Meldung({ z }: { z: KundeErgebnis }) {
  return <>{z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}{z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}</>;
}

function DateiKnopf({ token, quelle, id, name }: { token: string; quelle: "objekt" | "projekt" | "persoenlich"; id: string; name: string }) {
  const [z, aktion, laeuft] = useActionState<KundeErgebnis, FormData>(kundeDatei, {});
  return (
    <form action={aktion} className="inline">
      <input type="hidden" name="token" value={token} /><input type="hidden" name="quelle" value={quelle} /><input type="hidden" name="id" value={id} />
      <button type="submit" disabled={laeuft} className="text-left text-akzent hover:underline">{name}</button>
      {z.fehler && <span className="ml-2 text-[11px] text-fehler">{z.fehler}</span>}
    </form>
  );
}

/** Kundenbereich (Referenz: Eigentuemer-Portal, Kaeuferportal, Projekt-Kundenbereich) — eine Seite, Bereiche nach Rolle. */
export function Kundenbereich({ token, daten }: { token: string; daten: PortalDaten }) {
  const d = daten;
  const projekt = d.projekt ?? null;
  const bereiche: Array<[string, string]> = [];
  if (projekt) bereiche.push(["projekt", "Projekt"], ["einheiten", "Wohnungen"], ["fortschritt", "Baufortschritt"]);
  if (d.objekte.length > 0) bereiche.push(["objekte", d.kunde.art === "eigentuemer" ? "Meine Immobilie" : "Meine Immobilie"]);
  if (d.kunde.art === "kaeufer") bereiche.push(["kauf", "Kaufabwicklung"]);
  bereiche.push(["unterlagen", "Unterlagen"], ["nachrichten", "Nachrichten"]);
  if (d.kunde.art === "eigentuemer") bereiche.push(["ausweis", "Energieausweis"]);
  bereiche.push(["konto", "Zugang"]);
  const [bereich, setBereich] = useState<string>(bereiche[0]?.[0] ?? "nachrichten");
  const ungelesen = d.nachrichten.filter((n) => n.richtung === "makler").length; // Anzeige: letzte Nachricht
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-gedaempft">{d.mandant?.name ?? "Kundenbereich"}</p>
          <h1 className="font-titel text-2xl font-semibold text-primaer">Guten Tag, {d.kunde.anzeigename}</h1>
          <p className="text-[13px] text-gedaempft">{projekt ? `Ihr Kundenbereich zum Projekt „${projekt.name}“` : d.kunde.art === "eigentuemer" ? "Ihr Eigentümer-Bereich: Stand der Vermarktung, Unterlagen, Nachrichten." : d.kunde.art === "kaeufer" ? "Ihr Käufer-Bereich: Kaufabwicklung mit allen Unterlagen." : "Ihr persönlicher Kundenbereich."}</p>
        </div>
        {d.ansprechpartner && (
          <div className="rounded-[var(--radius)] border border-linie bg-flaeche px-3 py-2 text-[12px]">
            <p className="text-[11px] uppercase tracking-wide text-gedaempft">Ihr Ansprechpartner</p>
            <p className="font-medium">{d.ansprechpartner.name}{d.ansprechpartner.funktion ? ` · ${d.ansprechpartner.funktion}` : ""}</p>
            {d.ansprechpartner.telefon && <p><a href={`tel:${d.ansprechpartner.telefon}`} className="text-akzent hover:underline">{d.ansprechpartner.telefon}</a></p>}
            {d.ansprechpartner.email && <p><a href={`mailto:${d.ansprechpartner.email}`} className="text-akzent hover:underline">{d.ansprechpartner.email}</a></p>}
          </div>
        )}
      </header>
      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Bereiche">
        {bereiche.map(([k, l]) => <button key={k} type="button" onClick={() => setBereich(k)} className={`rounded-[var(--radius)] border px-3 py-1.5 text-[13px] ${bereich === k ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft hover:text-text"}`}>{l}{k === "nachrichten" && ungelesen > 0 ? "" : ""}</button>)}
      </nav>

      {bereich === "projekt" && projekt && <Projekt token={token} d={d} />}
      {bereich === "einheiten" && projekt && <Einheiten token={token} d={d} />}
      {bereich === "fortschritt" && projekt && <Fortschritt token={token} d={d} />}
      {bereich === "objekte" && <Objekte token={token} d={d} />}
      {bereich === "kauf" && <Kaufabwicklung d={d} />}
      {bereich === "unterlagen" && <Unterlagen token={token} d={d} />}
      {bereich === "nachrichten" && <Nachrichten token={token} d={d} />}
      {bereich === "ausweis" && <Energieausweis token={token} d={d} />}
      {bereich === "konto" && <Konto token={token} d={d} />}

      <footer className="mt-8 border-t border-linie pt-3 text-[11px] text-gedaempft">Dieser Bereich wird von {d.mandant?.name ?? "Ihrem Maklerbüro"} bereitgestellt. Bitte geben Sie Ihren Zugangslink nicht weiter.</footer>
    </div>
  );
}

function Abschnitt({ titel, beschreibung, children }: { titel: string; beschreibung?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-4">
      <h2 className="font-titel text-[15px] font-semibold text-primaer">{titel}</h2>
      {beschreibung && <p className="mb-2 text-[12px] text-gedaempft">{beschreibung}</p>}
      <div className="mt-2 text-[13px]">{children}</div>
    </section>
  );
}

function Projekt({ token, d }: { token: string; d: PortalDaten }) {
  const p = d.projekt!;
  const gemerkt = new Set(d.merkliste ?? []);
  return (
    <>
      <Abschnitt titel={p.name} beschreibung={[p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}>
        {p.beschreibung && <p className="whitespace-pre-wrap">{p.beschreibung}</p>}
        <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-gedaempft">
          {p.baubeginn && <span>Baubeginn {datum(p.baubeginn)}</span>}{p.fertigstellung && <span>Fertigstellung {datum(p.fertigstellung)}</span>}
          <span>{(d.einheiten ?? []).filter((e) => e.status === "verfuegbar").length} von {(d.einheiten ?? []).length} Einheiten verfügbar</span>
        </div>
      </Abschnitt>
      {d.kunde.einheit_id && (
        <Abschnitt titel="Ihre Wohnung">
          {(() => { const e = (d.einheiten ?? []).find((x) => x.id === d.kunde.einheit_id); return e ? <p><strong>{e.we_nr}</strong>{e.geschoss ? ` · ${e.geschoss}` : ""}{e.zimmer ? ` · ${e.zimmer} Zimmer` : ""}{e.wohnflaeche ? ` · ${e.wohnflaeche.toLocaleString("de-DE")} m²` : ""} · <Marke ton={e.status === "verfuegbar" ? "erfolg" : "warnung"}>{EINHEIT_STATUS[e.status as keyof typeof EINHEIT_STATUS] ?? e.status}</Marke></p> : null; })()}
          <p className="mt-2">Stand: <strong>{d.kunde.fortschritt_stufe}/7 · {FORTSCHRITT[d.kunde.fortschritt_stufe - 1]}</strong>{d.kunde.fortschritt_notiz ? ` — nächster Schritt: ${d.kunde.fortschritt_notiz}` : ""}</p>
        </Abschnitt>
      )}
      {gemerkt.size > 0 && <Abschnitt titel="Ihre Merkliste">{(d.einheiten ?? []).filter((e) => gemerkt.has(e.id)).map((e) => <p key={e.id}>{e.we_nr}{e.geschoss ? ` · ${e.geschoss}` : ""} · {p.vermarktungsart === "miete" ? (e.miete != null ? `${euro(e.miete)} / Monat` : "auf Anfrage") : e.kaufpreis != null ? euro(e.kaufpreis) : "auf Anfrage"}</p>)}</Abschnitt>}
      {(d.anfragen ?? []).length > 0 && <Abschnitt titel="Ihre Anfragen">{(d.anfragen ?? []).map((a) => <p key={a.id}>{ANFRAGE_ART[a.art as keyof typeof ANFRAGE_ART] ?? a.art}{a.einheit_id ? ` · ${(d.einheiten ?? []).find((e) => e.id === a.einheit_id)?.we_nr ?? ""}` : ""} · <Marke ton={a.status === "bestaetigt" ? "erfolg" : a.status === "abgelehnt" ? "neutral" : "warnung"}>{ANFRAGE_STATUS[a.status as keyof typeof ANFRAGE_STATUS]}</Marke> <span className="text-[11px] text-gedaempft">{datum(a.erstellt_am)}</span></p>)}</Abschnitt>}
      {(d.gewerke ?? []).length > 0 && (
        <Abschnitt titel="Ihre Ansprechpartner" beschreibung="Gewerke — z. B. für die Bemusterung.">
          <div className="grid gap-2 md:grid-cols-2">{(d.gewerke ?? []).map((g) => <div key={g.id} className="rounded-[var(--radius)] border border-linie p-2"><p className="font-medium">{g.gewerk}{g.firma ? ` · ${g.firma}` : ""}</p><p className="text-[12px] text-gedaempft">{[g.name, g.ort].filter(Boolean).join(" · ")}</p>{g.telefon && <p className="text-[12px]"><a href={`tel:${g.telefon}`} className="text-akzent hover:underline">{g.telefon}</a></p>}{g.email && <p className="text-[12px]"><a href={`mailto:${g.email}`} className="text-akzent hover:underline">{g.email}</a></p>}{g.info && <p className="mt-1 whitespace-pre-wrap rounded bg-akzent-schwach px-2 py-1 text-[12px]">{g.info}</p>}</div>)}</div>
        </Abschnitt>
      )}
      <Anfrage token={token} d={d} />
    </>
  );
}

function MerkKnopf({ token, einheitId, gemerkt }: { token: string; einheitId: string; gemerkt: boolean }) {
  const [z, aktion, laeuft] = useActionState<KundeErgebnis, FormData>(kundeMerkliste, {});
  const ist = z.gemerkt ?? gemerkt;
  return <form action={aktion} className="inline"><input type="hidden" name="token" value={token} /><input type="hidden" name="einheit_id" value={einheitId} /><button type="submit" disabled={laeuft} className={`rounded-[var(--radius)] border px-2 py-0.5 text-[12px] ${ist ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie text-gedaempft hover:text-text"}`} aria-pressed={ist}>{ist ? "★ gemerkt" : "☆ merken"}</button></form>;
}

function Einheiten({ token, d }: { token: string; d: PortalDaten }) {
  const p = d.projekt!;
  const gemerkt = new Set(d.merkliste ?? []);
  const liste = d.einheiten ?? [];
  return (
    <>
      <Abschnitt titel="Wohnungen im Projekt" beschreibung="Merken Sie sich Wohnungen vor oder stellen Sie unten eine Anfrage.">
        {liste.length === 0 && <p className="text-gedaempft">Noch keine Einheiten veröffentlicht.</p>}
        <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-gedaempft"><th className="py-1 pr-2">WE</th><th className="py-1 pr-2">Geschoss</th><th className="py-1 pr-2">Zimmer</th><th className="py-1 pr-2">Fläche</th><th className="py-1 pr-2">Ausrichtung</th><th className="py-1 pr-2">{p.vermarktungsart === "miete" ? "Miete" : "Kaufpreis"}</th>{p.vermarktungsart === "kauf" && <th className="py-1 pr-2">Hausgeld</th>}<th className="py-1 pr-2">Status</th><th /></tr></thead><tbody>
          {liste.map((e) => <tr key={e.id} className="border-t border-linie"><td className="py-1.5 pr-2 font-medium">{e.we_nr}</td><td className="py-1.5 pr-2">{e.geschoss ?? "—"}</td><td className="py-1.5 pr-2">{e.zimmer ?? "—"}</td><td className="py-1.5 pr-2">{e.wohnflaeche != null ? `${e.wohnflaeche.toLocaleString("de-DE")} m²` : "—"}</td><td className="py-1.5 pr-2">{e.ausrichtung ?? "—"}</td><td className="py-1.5 pr-2">{p.vermarktungsart === "miete" ? (e.miete != null ? `${euro(e.miete)} / Monat` : "auf Anfrage") : e.kaufpreis != null ? euro(e.kaufpreis) : "auf Anfrage"}</td>{p.vermarktungsart === "kauf" && <td className="py-1.5 pr-2">{e.hausgeld != null ? `${euro(e.hausgeld)} / Monat` : "—"}</td>}<td className="py-1.5 pr-2"><Marke ton={e.status === "verfuegbar" ? "erfolg" : e.status === "reserviert" ? "warnung" : "neutral"}>{EINHEIT_STATUS[e.status as keyof typeof EINHEIT_STATUS] ?? e.status}</Marke></td><td className="py-1.5"><MerkKnopf token={token} einheitId={e.id} gemerkt={gemerkt.has(e.id)} /></td></tr>)}
        </tbody></table></div>
      </Abschnitt>
      <Anfrage token={token} d={d} />
    </>
  );
}

function Anfrage({ token, d }: { token: string; d: PortalDaten }) {
  const [z, aktion, laeuft] = useActionState<KundeErgebnis, FormData>(kundeAnfrage, {});
  const liste = (d.einheiten ?? []).filter((e) => e.status === "verfuegbar");
  return (
    <Abschnitt titel="Anfrage stellen" beschreibung="Reservierung, Informationen oder Besichtigung — wir melden uns bei Ihnen.">
      <form action={aktion} className="grid gap-3 md:grid-cols-3">
        <input type="hidden" name="token" value={token} />
        <Feld id="kb-art" beschriftung="Anliegen"><Auswahl id="kb-art" name="art" defaultValue="information">{Object.entries(ANFRAGE_ART).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
        <Feld id="kb-einheit" beschriftung="Wohnung"><Auswahl id="kb-einheit" name="einheit_id" defaultValue={d.kunde.einheit_id ?? ""}><option value="">— allgemein —</option>{(d.einheiten ?? []).map((e) => <option key={e.id} value={e.id} disabled={!liste.includes(e) && e.status !== "verfuegbar"}>{e.we_nr}{e.status !== "verfuegbar" ? ` (${EINHEIT_STATUS[e.status as keyof typeof EINHEIT_STATUS]})` : ""}</option>)}</Auswahl></Feld>
        <div className="md:col-span-3"><Feld id="kb-text" beschriftung="Nachricht"><Textfeld id="kb-text" name="nachricht" rows={3} maxLength={2000} /></Feld></div>
        <div className="md:col-span-3 flex items-center gap-3"><Button type="submit" disabled={laeuft}>{laeuft ? "Sendet …" : "Anfrage senden"}</Button><Meldung z={z} /></div>
      </form>
    </Abschnitt>
  );
}

function UpdateBilder({ token, updateId, anzahl }: { token: string; updateId: string; anzahl: number }) {
  const [urls, setUrls] = useState<string[] | null>(null);
  if (anzahl === 0) return null;
  if (!urls) return <button type="button" className="text-[12px] text-akzent hover:underline" onClick={() => { void kundeUpdateBilder(token, updateId).then(setUrls); }}>{anzahl} Foto(s) anzeigen</button>;
  return <div className="flex flex-wrap gap-2">{urls.map((u) => (
    // eslint-disable-next-line @next/next/no-img-element -- signierte Adresse aus dem eigenen Bucket
    <a key={u} href={u} target="_blank" rel="noopener"><img src={u} alt="Baufortschritt" className="h-28 rounded-[var(--radius)] border border-linie object-cover" /></a>
  ))}</div>;
}

function Fortschritt({ token, d }: { token: string; d: PortalDaten }) {
  const liste = d.updates ?? [];
  return (
    <Abschnitt titel="Baufortschritt" beschreibung="Neuigkeiten von der Baustelle.">
      {liste.length === 0 && <p className="text-gedaempft">Noch keine Meldungen.</p>}
      <div className="space-y-3">{liste.map((u) => <div key={u.id} className="rounded-[var(--radius)] border border-linie p-3"><p className="font-medium">{u.titel}</p><p className="text-[11px] text-gedaempft">{datum(u.erstellt_am)}</p>{u.text && <p className="mt-1 whitespace-pre-wrap">{u.text}</p>}<div className="mt-2"><UpdateBilder token={token} updateId={u.id} anzahl={u.bilder.length} /></div></div>)}</div>
    </Abschnitt>
  );
}

function Objekte({ token, d }: { token: string; d: PortalDaten }) {
  return (
    <>
      {d.objekte.map((o) => {
        const pflicht = o.checkliste.filter((c) => c.pflicht);
        const erledigt = pflicht.filter((c) => c.status === "erledigt").length;
        const prozent = pflicht.length > 0 ? Math.round((erledigt / pflicht.length) * 100) : 100;
        return (
          <div key={o.id}>
            <Abschnitt titel={o.titel ?? o.bezeichnung} beschreibung={[o.strasse && o.hausnummer ? `${o.strasse} ${o.hausnummer}` : o.strasse, [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[var(--radius)] border border-linie p-2"><p className="text-[11px] uppercase tracking-wide text-gedaempft">Stand</p><p className="font-medium">{OBJEKT_STATUS[o.status] ?? o.status}</p></div>
                <div className="rounded-[var(--radius)] border border-linie p-2"><p className="text-[11px] uppercase tracking-wide text-gedaempft">Exposé-Aufrufe</p><p className="font-medium">{o.aufrufe}{o.web_expose ? "" : " (Web-Exposé nicht veröffentlicht)"}</p></div>
                <div className="rounded-[var(--radius)] border border-linie p-2"><p className="text-[11px] uppercase tracking-wide text-gedaempft">Anfragen</p><p className="font-medium">{o.anfragen}</p></div>
                <div className="rounded-[var(--radius)] border border-linie p-2"><p className="text-[11px] uppercase tracking-wide text-gedaempft">Besichtigungen</p><p className="font-medium">{o.besichtigungen}{o.naechste_besichtigung ? <span className="block text-[11px] font-normal text-gedaempft">nächste {zeitpunkt(o.naechste_besichtigung)}</span> : null}</p></div>
              </div>
              {o.vermarktungsart !== "miete" && o.kaufpreis != null && <p className="mt-2 text-[12px] text-gedaempft">Angebotspreis {euro(o.kaufpreis)}</p>}
              {o.vermarktungsart === "miete" && o.kaltmiete != null && <p className="mt-2 text-[12px] text-gedaempft">Kaltmiete {euro(o.kaltmiete)}</p>}
            </Abschnitt>
            {pflicht.length > 0 && (
              <Abschnitt titel="Checkliste Unterlagen" beschreibung={`${erledigt} von ${pflicht.length} Pflichtunterlagen liegen vor (${prozent} %). Fehlende Unterlagen können Sie unter „Unterlagen“ hochladen.`}>
                <div className="mb-2 h-2 overflow-hidden rounded bg-hintergrund"><div className="h-2 bg-akzent" style={{ width: `${prozent}%` }} /></div>
                <ul className="space-y-1">{o.checkliste.map((c) => <li key={c.id} className="flex items-center gap-2"><span aria-hidden>{c.status === "erledigt" ? "✓" : c.status === "nicht_noetig" ? "–" : "○"}</span><span className={c.status === "erledigt" ? "text-gedaempft line-through" : ""}>{c.titel}{c.pflicht ? "" : " (optional)"}</span></li>)}</ul>
              </Abschnitt>
            )}
            {o.dokumente.length > 0 && (
              <Abschnitt titel="Dokumente zum Objekt">
                <ul className="space-y-1">{o.dokumente.map((x) => <li key={x.id}><DateiKnopf token={token} quelle="objekt" id={x.id} name={x.titel} /> <span className="text-[11px] text-gedaempft">{dateigroesse(x.bytes)} · {datum(x.erstellt_am)}</span></li>)}</ul>
              </Abschnitt>
            )}
            {o.verlauf.length > 0 && (
              <Abschnitt titel="Verlauf der Vermarktung">
                <ul className="space-y-1">{o.verlauf.map((v, i) => <li key={i} className="flex gap-2"><span className="w-28 shrink-0 text-[11px] text-gedaempft">{datum(v.erstellt_am)}</span><span>{v.beschreibung}</span></li>)}</ul>
              </Abschnitt>
            )}
          </div>
        );
      })}
    </>
  );
}

function Kaufabwicklung({ d }: { d: PortalDaten }) {
  const stufe = d.kunde.fortschritt_stufe;
  return (
    <Abschnitt titel="Kaufabwicklung" beschreibung="Ihr aktueller Stand in sieben Schritten.">
      <ol className="space-y-1">{FORTSCHRITT.map((s, i) => <li key={s} className={`flex items-center gap-2 ${i + 1 < stufe ? "text-gedaempft" : i + 1 === stufe ? "font-semibold text-primaer" : "text-gedaempft"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${i + 1 <= stufe ? "border-akzent bg-akzent text-white" : "border-linie"}`}>{i + 1 < stufe ? "✓" : i + 1}</span>{s}</li>)}</ol>
      {d.kunde.fortschritt_notiz && <p className="mt-3 rounded bg-akzent-schwach px-3 py-2">Nächster Schritt: {d.kunde.fortschritt_notiz}</p>}
    </Abschnitt>
  );
}

function Unterlagen({ token, d }: { token: string; d: PortalDaten }) {
  const [z, aktion, laeuft] = useActionState<KundeErgebnis, FormData>(kundeUpload, {});
  const projektDateien = d.dateien ?? [];
  const ordner = d.ordner ?? [];
  return (
    <>
      {projektDateien.length > 0 && (
        <Abschnitt titel="Unterlagen zum Projekt">
          {[null, ...ordner.map((o) => o.id)].map((oid) => {
            const liste = projektDateien.filter((f) => (f.ordner_id ?? null) === oid);
            if (liste.length === 0) return null;
            return <div key={oid ?? "ohne"} className="mb-2">{oid && <p className="text-[11px] uppercase tracking-wide text-gedaempft">{ordner.find((o) => o.id === oid)?.name}</p>}<ul className="space-y-1">{liste.map((f) => <li key={f.id}><DateiKnopf token={token} quelle="projekt" id={f.id} name={f.name} /> <span className="text-[11px] text-gedaempft">{DATEI_KATEGORIEN[f.kategorie as keyof typeof DATEI_KATEGORIEN] ?? f.kategorie} · {dateigroesse(f.bytes)}</span></li>)}</ul></div>;
          })}
        </Abschnitt>
      )}
      <Abschnitt titel="Persönliche Unterlagen" beschreibung="Dokumente, die nur für Sie bestimmt sind — und Ihre eigenen Uploads.">
        {d.dokumente.length === 0 && <p className="text-gedaempft">Noch keine Unterlagen.</p>}
        <ul className="space-y-1">{d.dokumente.map((x) => <li key={x.id}><DateiKnopf token={token} quelle="persoenlich" id={x.id} name={x.name} /> <span className="text-[11px] text-gedaempft">{x.kategorie} · {dateigroesse(x.bytes)} · {datum(x.erstellt_am)}{x.hochgeladen_von === "kunde" ? " · von Ihnen" : ""}</span></li>)}</ul>
        <form action={aktion} className="mt-3 grid gap-3 border-t border-linie pt-3 md:grid-cols-3">
          <input type="hidden" name="token" value={token} />
          <Feld id="ku-datei" beschriftung="Datei hochladen (PDF, Bild, Word; bis 25 MB)" pflicht><input id="ku-datei" name="datei" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx" className="text-[13px]" /></Feld>
          <Feld id="ku-kat" beschriftung="Was ist das?"><Eingabe id="ku-kat" name="kategorie" placeholder="z. B. Grundbuchauszug" maxLength={60} /></Feld>
          {d.objekte.length > 0 && <Feld id="ku-objekt" beschriftung="Objekt"><Auswahl id="ku-objekt" name="objekt_id" defaultValue={d.objekte[0]?.id ?? ""}>{d.objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Feld>}
          <div className="md:col-span-3 flex items-center gap-3"><Button type="submit" disabled={laeuft}>{laeuft ? "Lädt hoch …" : "Hochladen"}</Button><Meldung z={z} /></div>
        </form>
      </Abschnitt>
    </>
  );
}

function Nachrichten({ token, d }: { token: string; d: PortalDaten }) {
  const [z, aktion, laeuft] = useActionState<KundeErgebnis, FormData>(kundeNachricht, {});
  return (
    <Abschnitt titel="Nachrichten" beschreibung="Schreiben Sie uns direkt — Ihr Ansprechpartner antwortet hier.">
      <div className="max-h-96 space-y-2 overflow-auto rounded-[var(--radius)] border border-linie bg-hintergrund p-2">
        {d.nachrichten.length === 0 && <p className="text-gedaempft">Noch keine Nachrichten.</p>}
        {d.nachrichten.map((n) => <div key={n.id} className={`max-w-[85%] rounded-[var(--radius)] px-3 py-2 ${n.richtung === "kunde" ? "ml-auto bg-akzent-schwach" : "border border-linie bg-flaeche"}`}><p className="whitespace-pre-wrap">{n.text}</p><p className="mt-1 text-[10px] text-gedaempft">{n.richtung === "kunde" ? "Sie" : d.ansprechpartner?.name ?? d.mandant?.name ?? "Maklerbüro"} · {zeitpunkt(n.erstellt_am)}</p></div>)}
      </div>
      <form action={aktion} className="mt-3 flex gap-2"><input type="hidden" name="token" value={token} /><Textfeld name="text" rows={2} required maxLength={5000} placeholder="Ihre Nachricht …" aria-label="Nachricht" /><Button type="submit" disabled={laeuft}>{laeuft ? "…" : "Senden"}</Button></form>
      <div className="mt-2"><Meldung z={z} /></div>
    </Abschnitt>
  );
}

function Energieausweis({ token, d }: { token: string; d: PortalDaten }) {
  const offen = d.antraege.find((a) => a.status === "in_arbeit");
  const [z, aktion, laeuft] = useActionState<KundeErgebnis, FormData>(kundeAntrag, {});
  const [neu, setNeu] = useState(false);
  const bearbeiten = offen ?? (neu ? { id: "", status: "in_arbeit", daten: {} as AntragDaten, objekt_id: d.objekte[0]?.id ?? null, geaendert_am: "" } : null);
  return (
    <>
      <Abschnitt titel="Verbrauchsausweis beantragen" beschreibung="Für den Energieausweis nach Verbrauch brauchen wir Angaben zu Gebäude, Heizung und dem Verbrauch der letzten drei Jahre. Sie können zwischenspeichern und später einreichen.">
        {d.antraege.filter((a) => a.status !== "in_arbeit").map((a) => <div key={a.id} className="mb-2 rounded-[var(--radius)] border border-linie p-2"><p><Marke ton={a.status === "erledigt" ? "erfolg" : "warnung"}>{a.status === "erledigt" ? "Erledigt" : "Eingereicht"}</Marke> <span className="text-[11px] text-gedaempft">{zeitpunkt(a.geaendert_am)}</span></p><p className="text-[12px] text-gedaempft">{antragZeilen(a.daten).slice(0, 3).map((x) => x.wert).join(" · ")}</p></div>)}
        {!bearbeiten && <Button type="button" onClick={() => setNeu(true)}>+ Neuer Antrag</Button>}
      </Abschnitt>
      {bearbeiten && (
        /* noValidate: Ein Zwischenstand darf unvollstaendig sein; die Pflichtpruefung beim Einreichen macht der Server und nennt die fehlenden Felder. */
        <form action={aktion} noValidate>
          <input type="hidden" name="token" value={token} />
          {bearbeiten.id && <input type="hidden" name="id" value={bearbeiten.id} />}
          {d.objekte.length > 0 && <Abschnitt titel="Objekt"><Auswahl name="objekt_id" defaultValue={bearbeiten.objekt_id ?? ""} aria-label="Objekt">{d.objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}</Auswahl></Abschnitt>}
          {ANTRAG_ABSCHNITTE.map((ab) => (
            <Abschnitt key={ab.titel} titel={ab.titel}>
              <div className="grid gap-3 md:grid-cols-2">
                {ab.felder.map((f) => {
                  const wert = bearbeiten.daten[f.schluessel];
                  const id = `va-${f.schluessel}`;
                  if (f.art === "ja_nein") return <label key={f.schluessel} className="flex items-center gap-2"><input type="checkbox" name={f.schluessel} value="ja" defaultChecked={wert === true} /> {f.beschriftung}</label>;
                  if (f.art === "auswahl") return <Feld key={f.schluessel} id={id} beschriftung={f.pflicht ? `${f.beschriftung} *` : f.beschriftung}><Auswahl id={id} name={f.schluessel} defaultValue={typeof wert === "string" ? wert : ""}><option value="">— bitte wählen —</option>{(f.optionen ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</Auswahl></Feld>;
                  if (f.art === "mehrzeilig") return <div key={f.schluessel} className="md:col-span-2"><Feld id={id} beschriftung={f.beschriftung}><Textfeld id={id} name={f.schluessel} rows={2} defaultValue={typeof wert === "string" ? wert : ""} maxLength={2000} /></Feld></div>;
                  return <Feld key={f.schluessel} id={id} beschriftung={`${f.einheit ? `${f.beschriftung} (${f.einheit})` : f.beschriftung}${f.pflicht ? " *" : ""}`}><Eingabe id={id} name={f.schluessel} inputMode={f.art === "zahl" ? "decimal" : undefined} defaultValue={wert == null || wert === false ? "" : String(wert)} maxLength={200} /></Feld>;
                })}
              </div>
            </Abschnitt>
          ))}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button type="submit" variante="sekundaer" disabled={laeuft}>Zwischenstand speichern</Button>
            <Button type="submit" name="einreichen" value="1" disabled={laeuft}>Antrag einreichen</Button>
            <Meldung z={z} />
          </div>
        </form>
      )}
    </>
  );
}

function Konto({ token, d }: { token: string; d: PortalDaten }) {
  const [z, aktion, laeuft] = useActionState<KundeErgebnis, FormData>(kundePasswortSetzen, {});
  return (
    <Abschnitt titel="Ihr Zugang" beschreibung={d.kunde.passwort_gesetzt ? "Ihr Zugangslink ist zusätzlich mit einem Passwort geschützt." : "Ihr Zugangslink ist Ihr Schlüssel. Sie können zusätzlich ein Passwort setzen — dann wird es beim Öffnen des Links abgefragt."}>
      <p className="mb-3">Angemeldet als <strong>{d.kunde.anzeigename}</strong> ({d.kunde.email}).</p>
      <form action={aktion} className="grid max-w-md gap-3">
        <input type="hidden" name="token" value={token} />
        <Feld id="pw-neu" beschriftung={d.kunde.passwort_gesetzt ? "Neues Passwort" : "Passwort"} hinweis="Mindestens 8 Zeichen" pflicht><Eingabe id="pw-neu" name="neues" type="password" autoComplete="new-password" minLength={8} required /></Feld>
        <Feld id="pw-wdh" beschriftung="Wiederholung" pflicht><Eingabe id="pw-wdh" name="wiederholung" type="password" autoComplete="new-password" minLength={8} required /></Feld>
        <div className="flex items-center gap-3"><Button type="submit" disabled={laeuft}>{d.kunde.passwort_gesetzt ? "Passwort ändern" : "Passwort setzen"}</Button><Meldung z={z} /></div>
      </form>
    </Abschnitt>
  );
}
