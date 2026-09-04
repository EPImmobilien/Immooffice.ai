"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { datum, euro, zeitpunkt } from "@/lib/format";
import { einstellungSetzen, erneutVersuchen, mandantSperren, preisSpeichern, type PlattformErgebnis } from "@/server/plattform-aktionen";

export interface PlattformDaten {
  mandanten: Array<{ id: string; name: string; slug: string; abo_status: string; testphase_bis: string | null; gesperrt_am: string | null; gesperrt_grund: string | null; gekuendigt_am: string | null; loeschung_geplant_am: string | null; erstellt_am: string; benutzer: number; tarif: string | null; intervall: string | null; credits_verbraucht: number; credits_verfuegbar: number; letzte_aktivitaet: string | null; integrationen: number; jobs_fehler: number }>;
  tarife: Array<{ schluessel: string; name: string; preis_monat_netto: number; preis_jahr_netto: number; enthaltene_benutzer: number; credits_monat: number; aktiv: boolean }>;
  preise: Array<{ schluessel: string; bezeichnung: string; art: string; netto: number; credits: number | null; aktiv: boolean }>;
  creditPreise: Array<{ aktion: string; bezeichnung: string; credits: number }>;
  einstellungen: Array<{ schluessel: string; wert: unknown; beschreibung: string | null; geaendert_am: string }>;
  jobs: Array<{ id: string; mandant_id: string; art: string; status: string; versuche: number; fehler_text: string | null; erstellt_am: string }>;
  rueckrufe: Array<{ id: string; mandant_id: string; ereignis: string; status: string; versuche: number; fehler_text: string | null; erstellt_am: string }>;
  stripe: Array<{ id: string; typ: string; status: string; erstellt_am: string }>;
  support: Array<{ id: string; mandant_id: string; gueltig_bis: string; widerrufen_am: string | null; erstellt_am: string }>;
  audit: Array<{ id: string; mandant_id: string; aktion: string; ziel_art: string | null; erstellt_am: string; details: unknown }>;
  kosten: { api_cent: number; umsatz_netto: number; monat: string };
}

const REITER = [["mandanten", "Mandanten"], ["preise", "Preise und Credits"], ["einstellungen", "Limits und Schalter"], ["jobs", "Jobs und Rückrufe"], ["support", "Support und Audit"], ["system", "Systemzustand"]] as const;
type Reiter = (typeof REITER)[number][0];

function Meldung({ z }: { z: PlattformErgebnis }) { return <>{z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}{z.erfolg && <Hinweis ton="erfolg">{z.erfolg}</Hinweis>}</>; }

/** Plattform-Administration (Masterprompt 15): Metadaten, keine Mandanteninhalte. */
export function PlattformAnsicht(d: PlattformDaten) {
  const [reiter, setReiter] = useState<Reiter>("mandanten");
  const name = (id: string) => d.mandanten.find((m) => m.id === id)?.name ?? id.slice(0, 8);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {REITER.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={reiter === k} onClick={() => setReiter(k)} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${reiter === k ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft hover:text-text"}`}>{l}{k === "jobs" && d.jobs.length + d.rueckrufe.length > 0 ? <span className="ml-1 rounded-full bg-fehler px-1.5 text-[10px] text-white">{d.jobs.length + d.rueckrufe.length}</span> : null}</button>)}
      </div>
      {reiter === "mandanten" && <Mandanten d={d} />}
      {reiter === "preise" && <Preise d={d} />}
      {reiter === "einstellungen" && <Einstellungen d={d} />}
      {reiter === "jobs" && <Jobs d={d} name={name} />}
      {reiter === "support" && <Support d={d} name={name} />}
      {reiter === "system" && <System d={d} />}
    </div>
  );
}

function Mandanten({ d }: { d: PlattformDaten }) {
  const [z, aktion, laeuft] = useActionState<PlattformErgebnis, FormData>(mandantSperren, {});
  const [filter, setFilter] = useState("");
  const liste = d.mandanten.filter((m) => !filter || m.name.toLowerCase().includes(filter.toLowerCase()) || m.slug.includes(filter.toLowerCase()));
  return (
    <Karte>
      <KarteKopf><KarteTitel>Mandanten ({d.mandanten.length})</KarteTitel><KarteBeschreibung>Nur Metadaten: Tarif, Abo, Benutzer, Credits, letzte Aktivität, Integrationen. Sperren und Reaktivieren werden im Audit-Log des Mandanten protokolliert.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-3 text-[13px]">
        <Eingabe value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtern …" aria-label="Mandanten filtern" className="max-w-xs" />
        <Meldung z={z} />
        <div className="overflow-x-auto"><table className="w-full text-[12px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-gedaempft"><th className="py-1 pr-2">Mandant</th><th className="py-1 pr-2">Abo</th><th className="py-1 pr-2">Tarif</th><th className="py-1 pr-2">Benutzer</th><th className="py-1 pr-2">Credits (Monat / frei)</th><th className="py-1 pr-2">Zuletzt aktiv</th><th className="py-1 pr-2">Integr.</th><th className="py-1 pr-2">Jobs ✗</th><th /></tr></thead><tbody>
          {liste.map((m) => (
            <tr key={m.id} className={`border-t border-linie ${m.gesperrt_am ? "bg-warnung-schwach" : ""}`}>
              <td className="py-1 pr-2"><p className="font-medium">{m.name}</p><p className="text-gedaempft">{m.slug} · seit {datum(m.erstellt_am)}{m.gekuendigt_am ? ` · gekündigt ${datum(m.gekuendigt_am)}` : ""}{m.loeschung_geplant_am ? ` · Löschung ${datum(m.loeschung_geplant_am)}` : ""}</p></td>
              <td className="py-1 pr-2"><Marke ton={m.gesperrt_am ? "fehler" : m.abo_status === "aktiv" ? "erfolg" : m.abo_status === "test" ? "warnung" : "neutral"}>{m.gesperrt_am ? "gesperrt" : m.abo_status}</Marke>{m.abo_status === "test" && m.testphase_bis ? <span className="ml-1 text-gedaempft">bis {datum(m.testphase_bis)}</span> : null}</td>
              <td className="py-1 pr-2">{m.tarif ?? "—"}{m.intervall ? ` (${m.intervall})` : ""}</td>
              <td className="py-1 pr-2">{m.benutzer}</td>
              <td className="py-1 pr-2">{m.credits_verbraucht} / {m.credits_verfuegbar}</td>
              <td className="py-1 pr-2">{m.letzte_aktivitaet ? zeitpunkt(m.letzte_aktivitaet) : "—"}</td>
              <td className="py-1 pr-2">{m.integrationen}</td>
              <td className="py-1 pr-2">{m.jobs_fehler > 0 ? <Marke ton="fehler">{m.jobs_fehler}</Marke> : "0"}</td>
              <td className="py-1 text-right">
                <form action={aktion} className="flex items-center justify-end gap-1">
                  <input type="hidden" name="mandant_id" value={m.id} />
                  {!m.gesperrt_am && <Eingabe name="grund" placeholder="Grund" className="w-32" aria-label="Sperrgrund" />}
                  <input type="hidden" name="sperren" value={m.gesperrt_am ? "0" : "1"} />
                  <Button type="submit" groesse="klein" variante={m.gesperrt_am ? "sekundaer" : "gefahr"} disabled={laeuft} onClick={(e) => { if (!m.gesperrt_am && !confirm(`${m.name} sperren? Alle Benutzer verlieren sofort den Zugang.`)) e.preventDefault(); }}>{m.gesperrt_am ? "Reaktivieren" : "Sperren"}</Button>
                </form>
                {m.gesperrt_grund && <p className="text-[11px] text-gedaempft">{m.gesperrt_grund}</p>}
              </td>
            </tr>
          ))}
        </tbody></table></div>
      </KarteInhalt>
    </Karte>
  );
}

function PreisZeile({ tabelle, schluessel, felder, aktiv }: { tabelle: string; schluessel: string; felder: Array<{ name: string; label: string; wert: number | string }>; aktiv?: boolean }) {
  const [z, aktion, laeuft] = useActionState<PlattformErgebnis, FormData>(preisSpeichern, {});
  return (
    <form action={aktion} className="flex flex-wrap items-end gap-2 border-t border-linie py-2">
      <input type="hidden" name="tabelle" value={tabelle} /><input type="hidden" name="schluessel" value={schluessel} />
      <span className="w-48 text-[13px] font-medium">{schluessel}</span>
      {felder.map((f) => <Feld key={f.name} id={`${tabelle}-${schluessel}-${f.name}`} beschriftung={f.label}><Eingabe id={`${tabelle}-${schluessel}-${f.name}`} name={f.name} inputMode="decimal" defaultValue={f.wert} className="w-28" /></Feld>)}
      {aktiv !== undefined && <label className="flex items-center gap-1 pb-2 text-[12px]"><input type="checkbox" name="aktiv" value="1" defaultChecked={aktiv} /> aktiv</label>}
      {aktiv !== undefined && <input type="hidden" name="aktiv" value="0" />}
      <Button type="submit" groesse="klein" disabled={laeuft}>Speichern</Button>
      <Meldung z={z} />
    </form>
  );
}

function Preise({ d }: { d: PlattformDaten }) {
  return (
    <div className="space-y-4">
      <Karte><KarteKopf><KarteTitel>Tarife (netto, zzgl. USt.)</KarteTitel><KarteBeschreibung>Änderungen gelten für neue Buchungen; laufende Abos bleiben bei Stripe unverändert, bis der Preis dort nachgezogen wird.</KarteBeschreibung></KarteKopf><KarteInhalt>
        {d.tarife.map((t) => <PreisZeile key={t.schluessel} tabelle="tarife" schluessel={`${t.name} (${t.schluessel})`.slice(0, 60) && t.schluessel} felder={[{ name: "netto", label: "€ / Monat", wert: t.preis_monat_netto }, { name: "netto_jahr", label: "€ / Jahr", wert: t.preis_jahr_netto }, { name: "enthaltene_benutzer", label: "Benutzer", wert: t.enthaltene_benutzer }, { name: "credits_monat", label: "Credits / Monat", wert: t.credits_monat }]} aktiv={t.aktiv} />)}
      </KarteInhalt></Karte>
      <Karte><KarteKopf><KarteTitel>Zusatznutzer und Credit-Pakete</KarteTitel></KarteKopf><KarteInhalt>
        {d.preise.map((p) => <PreisZeile key={p.schluessel} tabelle="preise" schluessel={p.schluessel} felder={[{ name: "netto", label: `${p.bezeichnung} € netto`, wert: p.netto }, ...(p.credits != null ? [{ name: "credits", label: "Credits", wert: p.credits }] : [])]} aktiv={p.aktiv} />)}
      </KarteInhalt></Karte>
      <Karte><KarteKopf><KarteTitel>Credit-Werte je KI-Aktion</KarteTitel><KarteBeschreibung>Ein Credit ist eine interne Nutzungseinheit. Werte gelten sofort für neue Aufträge.</KarteBeschreibung></KarteKopf><KarteInhalt>
        {d.creditPreise.map((c) => <PreisZeile key={c.aktion} tabelle="credit_preise" schluessel={c.aktion} felder={[{ name: "netto", label: `${c.bezeichnung} — Credits`, wert: c.credits }]} />)}
      </KarteInhalt></Karte>
    </div>
  );
}

function Einstellungen({ d }: { d: PlattformDaten }) {
  const [z, aktion, laeuft] = useActionState<PlattformErgebnis, FormData>(einstellungSetzen, {});
  return (
    <Karte>
      <KarteKopf><KarteTitel>Limits und Feature-Schalter</KarteTitel><KarteBeschreibung>Schlüssel-Wert-Paare (Zahl, true/false, Text oder JSON). Feature-Schalter beginnen mit „feature.“ und werden von der Anwendung gelesen.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="space-y-2 text-[13px]">
        {d.einstellungen.map((e) => (
          <form key={e.schluessel} action={aktion} className="flex flex-wrap items-end gap-2 border-t border-linie py-2">
            <input type="hidden" name="schluessel" value={e.schluessel} />
            <span className="w-64 font-medium">{e.schluessel}<span className="block text-[11px] font-normal text-gedaempft">{e.beschreibung ?? ""} · {zeitpunkt(e.geaendert_am)}</span></span>
            <Feld id={`pe-${e.schluessel}`} beschriftung="Wert"><Eingabe id={`pe-${e.schluessel}`} name="wert" defaultValue={typeof e.wert === "string" ? e.wert : JSON.stringify(e.wert)} className="w-56" /></Feld>
            <input type="hidden" name="beschreibung" value={e.beschreibung ?? ""} />
            <Button type="submit" groesse="klein" disabled={laeuft}>Setzen</Button>
          </form>
        ))}
        <form action={aktion} className="flex flex-wrap items-end gap-2 border-t border-linie pt-3">
          <Feld id="pe-neu-s" beschriftung="Neuer Schlüssel"><Eingabe id="pe-neu-s" name="schluessel" placeholder="feature.kundenbereich" className="w-56" /></Feld>
          <Feld id="pe-neu-w" beschriftung="Wert"><Eingabe id="pe-neu-w" name="wert" placeholder="true" className="w-40" /></Feld>
          <Feld id="pe-neu-b" beschriftung="Beschreibung"><Eingabe id="pe-neu-b" name="beschreibung" className="w-64" /></Feld>
          <Button type="submit" groesse="klein" variante="sekundaer" disabled={laeuft}>Anlegen</Button>
        </form>
        <Meldung z={z} />
      </KarteInhalt>
    </Karte>
  );
}

function Jobs({ d, name }: { d: PlattformDaten; name: (id: string) => string }) {
  return (
    <div className="space-y-4">
      <Karte><KarteKopf><KarteTitel>Fehlgeschlagene Jobs ({d.jobs.length})</KarteTitel></KarteKopf><KarteInhalt className="space-y-1 text-[12px]">
        {d.jobs.length === 0 && <p className="text-gedaempft">Keine.</p>}
        {d.jobs.map((j) => <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-linie py-1"><span><strong>{name(j.mandant_id)}</strong> · {j.art} · {j.versuche} Versuche · {zeitpunkt(j.erstellt_am)}<span className="block text-gedaempft">{j.fehler_text}</span></span><form action={erneutVersuchen}><input type="hidden" name="art" value="job" /><input type="hidden" name="id" value={j.id} /><Button type="submit" groesse="klein" variante="sekundaer">Erneut</Button></form></div>)}
      </KarteInhalt></Karte>
      <Karte><KarteKopf><KarteTitel>Fehlgeschlagene Rückrufe ({d.rueckrufe.length})</KarteTitel></KarteKopf><KarteInhalt className="space-y-1 text-[12px]">
        {d.rueckrufe.length === 0 && <p className="text-gedaempft">Keine.</p>}
        {d.rueckrufe.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-linie py-1"><span><strong>{name(r.mandant_id)}</strong> · {r.ereignis} · {r.versuche} Versuche · {zeitpunkt(r.erstellt_am)}<span className="block text-gedaempft">{r.fehler_text}</span></span><form action={erneutVersuchen}><input type="hidden" name="art" value="rueckruf" /><input type="hidden" name="id" value={r.id} /><Button type="submit" groesse="klein" variante="sekundaer">Erneut</Button></form></div>)}
      </KarteInhalt></Karte>
      <Karte><KarteKopf><KarteTitel>Stripe-Ereignisse (letzte 30)</KarteTitel></KarteKopf><KarteInhalt className="text-[12px]">
        {d.stripe.length === 0 && <p className="text-gedaempft">Keine.</p>}
        {d.stripe.map((s) => <p key={s.id} className="border-t border-linie py-1">{zeitpunkt(s.erstellt_am)} · {s.typ} · <Marke ton={s.status === "fehler" ? "fehler" : "neutral"}>{s.status}</Marke></p>)}
      </KarteInhalt></Karte>
    </div>
  );
}

function Support({ d, name }: { d: PlattformDaten; name: (id: string) => string }) {
  return (
    <div className="space-y-4">
      <Karte><KarteKopf><KarteTitel>Supportfreigaben</KarteTitel><KarteBeschreibung>Inhalte eines Mandanten sind nur mit ausdrücklicher Freigabe eines Inhabers zugänglich (24 Stunden); jeder Zugriff wird protokolliert.</KarteBeschreibung></KarteKopf><KarteInhalt className="text-[12px]">
        {d.support.length === 0 && <p className="text-gedaempft">Keine Freigaben.</p>}
        {d.support.map((s) => <p key={s.id} className="border-t border-linie py-1"><strong>{name(s.mandant_id)}</strong> · erteilt {zeitpunkt(s.erstellt_am)} · gültig bis {zeitpunkt(s.gueltig_bis)} {s.widerrufen_am ? <Marke ton="neutral">widerrufen</Marke> : s.gueltig_bis > new Date().toISOString() ? <Marke ton="erfolg">aktiv</Marke> : <Marke ton="neutral">abgelaufen</Marke>}</p>)}
      </KarteInhalt></Karte>
      <Karte><KarteKopf><KarteTitel>Audit-Log (Plattform, letzte 100)</KarteTitel><KarteBeschreibung>Unveränderbar. Zeigt Aktionen wie Sperren, Reaktivieren, Kündigung, Supportzugriff, Datenexport.</KarteBeschreibung></KarteKopf><KarteInhalt className="text-[12px]">
        {d.audit.map((a) => <p key={a.id} className="border-t border-linie py-1">{zeitpunkt(a.erstellt_am)} · <strong>{name(a.mandant_id)}</strong> · {a.aktion}{a.ziel_art ? ` (${a.ziel_art})` : ""} <span className="text-gedaempft">{a.details ? JSON.stringify(a.details).slice(0, 120) : ""}</span></p>)}
      </KarteInhalt></Karte>
    </div>
  );
}

function System({ d }: { d: PlattformDaten }) {
  const aktiv = d.mandanten.filter((m) => m.abo_status === "aktiv").length;
  const test = d.mandanten.filter((m) => m.abo_status === "test").length;
  return (
    <Karte>
      <KarteKopf><KarteTitel>Systemzustand</KarteTitel><KarteBeschreibung>Kennzahlen des laufenden Monats {d.kosten.monat}. API-Kosten sind die im Ledger erfassten Anbieterkosten der KI-Aufträge.</KarteBeschreibung></KarteKopf>
      <KarteInhalt className="grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
        {[["Mandanten aktiv / Test", `${aktiv} / ${test}`], ["Umsatz netto (Monat, laut Abos)", euro(d.kosten.umsatz_netto)], ["API-Kosten (Monat)", euro(d.kosten.api_cent / 100, true)], ["Deckungsbeitrag", euro(d.kosten.umsatz_netto - d.kosten.api_cent / 100)], ["Fehlgeschlagene Jobs", String(d.jobs.length)], ["Fehlgeschlagene Rückrufe", String(d.rueckrufe.length)], ["Gesperrte Mandanten", String(d.mandanten.filter((m) => m.gesperrt_am).length)], ["Kündigungen vorgemerkt", String(d.mandanten.filter((m) => m.gekuendigt_am).length)]].map(([l, v]) => (
          <div key={l} className="rounded-[var(--radius)] border border-linie p-3"><p className="text-[11px] uppercase tracking-wide text-gedaempft">{l}</p><p className="font-titel text-lg font-semibold">{v}</p></div>
        ))}
      </KarteInhalt>
    </Karte>
  );
}
