"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import { dateigroesse } from "@/lib/dokumente";
import { datum, euro } from "@/lib/format";
import { ANFRAGE_ART, DATEI_KATEGORIEN, EINHEIT_STATUS } from "@/lib/portal/typen";
import { projektAnfrage, projektDatei, type KundeErgebnis } from "@/server/kunde-aktionen";

export interface OeffentlichesProjekt {
  projekt: { id: string; name: string; strasse: string | null; plz: string | null; ort: string | null; beschreibung: string | null; status: string; vermarktungsart: "kauf" | "miete"; baubeginn: string | null; fertigstellung: string | null };
  anbieter: { name: string } | null;
  einheiten: Array<{ id: string; we_nr: string; geschoss: string | null; zimmer: number | null; wohnflaeche: number | null; ausrichtung: string | null; kaufpreis: number | null; miete: number | null; status: string }>;
  updates: Array<{ id: string; titel: string; text: string | null; erstellt_am: string }>;
  dateien: Array<{ id: string; name: string; kategorie: string; bytes: number | null }>;
}

function DateiKnopf({ token, id, name }: { token: string; id: string; name: string }) {
  const [z, aktion, laeuft] = useActionState<KundeErgebnis, FormData>(projektDatei, {});
  return <form action={aktion} className="inline"><input type="hidden" name="token" value={token} /><input type="hidden" name="id" value={id} /><button type="submit" disabled={laeuft} className="text-akzent hover:underline">{name}</button>{z.fehler && <span className="ml-2 text-[11px] text-fehler">{z.fehler}</span>}</form>;
}

/** Oeffentliche Projektseite (Referenz: oeffentliche Projektseiten mit Anfrage → Kundenbereich). */
export function Projektseite({ token, daten }: { token: string; daten: OeffentlichesProjekt }) {
  const [z, aktion, laeuft] = useActionState<KundeErgebnis, FormData>(projektAnfrage, {});
  const p = daten.projekt;
  const frei = daten.einheiten.filter((e) => e.status === "verfuegbar").length;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.12em] text-gedaempft">{daten.anbieter?.name ?? "Neubauprojekt"}</p>
        <h1 className="font-titel text-3xl font-semibold text-primaer">{p.name}</h1>
        <p className="text-[14px] text-gedaempft">{[p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-[12px]"><Marke ton="akzent">{p.vermarktungsart === "miete" ? "Vermietung" : "Verkauf"}</Marke><Marke ton={frei > 0 ? "erfolg" : "neutral"}>{frei} von {daten.einheiten.length} Einheiten verfügbar</Marke>{p.baubeginn && <Marke>Baubeginn {datum(p.baubeginn)}</Marke>}{p.fertigstellung && <Marke>Fertigstellung {datum(p.fertigstellung)}</Marke>}</div>
      </header>
      {p.beschreibung && <section className="mb-6 whitespace-pre-wrap text-[14px] leading-relaxed">{p.beschreibung}</section>}

      <section className="mb-6 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-4">
        <h2 className="font-titel text-[16px] font-semibold text-primaer">Wohnungen</h2>
        {daten.einheiten.length === 0 ? <p className="text-[13px] text-gedaempft">Die Einheiten werden in Kürze veröffentlicht.</p> : (
          <div className="mt-2 overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-gedaempft"><th className="py-1 pr-2">WE</th><th className="py-1 pr-2">Geschoss</th><th className="py-1 pr-2">Zimmer</th><th className="py-1 pr-2">Fläche</th><th className="py-1 pr-2">Ausrichtung</th><th className="py-1 pr-2">{p.vermarktungsart === "miete" ? "Miete" : "Kaufpreis"}</th><th className="py-1">Status</th></tr></thead><tbody>
            {daten.einheiten.map((e) => <tr key={e.id} className="border-t border-linie"><td className="py-1.5 pr-2 font-medium">{e.we_nr}</td><td className="py-1.5 pr-2">{e.geschoss ?? "—"}</td><td className="py-1.5 pr-2">{e.zimmer ?? "—"}</td><td className="py-1.5 pr-2">{e.wohnflaeche != null ? `${e.wohnflaeche.toLocaleString("de-DE")} m²` : "—"}</td><td className="py-1.5 pr-2">{e.ausrichtung ?? "—"}</td><td className="py-1.5 pr-2">{p.vermarktungsart === "miete" ? (e.miete != null ? `${euro(e.miete)} / Monat` : "auf Anfrage") : e.kaufpreis != null ? euro(e.kaufpreis) : "auf Anfrage"}</td><td className="py-1.5"><Marke ton={e.status === "verfuegbar" ? "erfolg" : e.status === "reserviert" ? "warnung" : "neutral"}>{EINHEIT_STATUS[e.status as keyof typeof EINHEIT_STATUS] ?? e.status}</Marke></td></tr>)}
          </tbody></table></div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          {daten.dateien.length > 0 && (
            <section className="mb-6 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-4">
              <h2 className="font-titel text-[16px] font-semibold text-primaer">Unterlagen</h2>
              <ul className="mt-2 space-y-1 text-[13px]">{daten.dateien.map((f) => <li key={f.id}><DateiKnopf token={token} id={f.id} name={f.name} /> <span className="text-[11px] text-gedaempft">{DATEI_KATEGORIEN[f.kategorie as keyof typeof DATEI_KATEGORIEN] ?? f.kategorie} · {dateigroesse(f.bytes)}</span></li>)}</ul>
            </section>
          )}
          {daten.updates.length > 0 && (
            <section className="mb-6 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-4">
              <h2 className="font-titel text-[16px] font-semibold text-primaer">Baufortschritt</h2>
              <div className="mt-2 space-y-3 text-[13px]">{daten.updates.map((u) => <div key={u.id}><p className="font-medium">{u.titel} <span className="text-[11px] font-normal text-gedaempft">{datum(u.erstellt_am)}</span></p>{u.text && <p className="whitespace-pre-wrap text-gedaempft">{u.text}</p>}</div>)}</div>
            </section>
          )}
        </div>
        <section className="rounded-[var(--radius-gross)] border border-linie bg-flaeche p-4">
          <h2 className="font-titel text-[16px] font-semibold text-primaer">Anfrage</h2>
          <p className="text-[12px] text-gedaempft">Sie erhalten einen persönlichen Kundenbereich mit Merkliste, Unterlagen und dem Stand Ihrer Anfrage.</p>
          {z.erfolg ? <Hinweis ton="erfolg" className="mt-3">{z.erfolg}</Hinweis> : (
            <form action={aktion} className="mt-3 space-y-3">
              <input type="hidden" name="token" value={token} />
              <Feld id="pa-art" beschriftung="Anliegen"><Auswahl id="pa-art" name="art" defaultValue="information">{Object.entries(ANFRAGE_ART).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Auswahl></Feld>
              {daten.einheiten.length > 0 && <Feld id="pa-einheit" beschriftung="Wohnung"><Auswahl id="pa-einheit" name="einheit_id" defaultValue=""><option value="">— allgemein —</option>{daten.einheiten.map((e) => <option key={e.id} value={e.id}>{e.we_nr}{e.status !== "verfuegbar" ? ` (${EINHEIT_STATUS[e.status as keyof typeof EINHEIT_STATUS]})` : ""}</option>)}</Auswahl></Feld>}
              <Feld id="pa-name" beschriftung="Name" pflicht><Eingabe id="pa-name" name="name" required maxLength={200} autoComplete="name" /></Feld>
              <Feld id="pa-email" beschriftung="E-Mail" pflicht><Eingabe id="pa-email" name="email" type="email" required maxLength={200} autoComplete="email" /></Feld>
              <Feld id="pa-telefon" beschriftung="Telefon"><Eingabe id="pa-telefon" name="telefon" maxLength={60} autoComplete="tel" /></Feld>
              <Feld id="pa-text" beschriftung="Nachricht"><Textfeld id="pa-text" name="nachricht" rows={3} maxLength={2000} /></Feld>
              <label className="flex items-start gap-2 text-[12px]"><input type="checkbox" name="einwilligung" value="ja" required className="mt-0.5" /> Ich bin einverstanden, dass meine Angaben zur Bearbeitung der Anfrage gespeichert und ich per E-Mail kontaktiert werde.</label>
              {z.fehler && <Hinweis ton="fehler">{z.fehler}</Hinweis>}
              <Button type="submit" disabled={laeuft} className="w-full">{laeuft ? "Sendet …" : "Anfrage senden"}</Button>
            </form>
          )}
        </section>
      </div>
      <footer className="mt-8 border-t border-linie pt-3 text-[11px] text-gedaempft">Angaben ohne Gewähr. Anbieter: {daten.anbieter?.name ?? "—"}.</footer>
    </div>
  );
}
