import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { marketingReport, pipelinePrognose } from "@/lib/akquise/auswertung";
import type { Kampagne, LeadZeile, Quelle, Stufe } from "@/lib/akquise/stammdaten";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { euro } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Akquise-Auswertung" };

function Kennzahl({ titel, wert, hinweis }: { titel: string; wert: string; hinweis?: string }) {
  return (
    <div className="rounded-[var(--radius-gross)] border border-linie bg-flaeche px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gedaempft">{titel}</p>
      <p className="text-lg font-semibold text-text">{wert}</p>
      {hinweis && <p className="text-[11px] text-gedaempft">{hinweis}</p>}
    </div>
  );
}

export default async function AuswertungSeite({ searchParams }: { searchParams: Promise<{ von?: string; bis?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "akquise", "lesen", sitzung.uebersteuerung);
  const heute = new Date();
  const bis = /^\d{4}-\d{2}-\d{2}$/.test(p.bis ?? "") ? (p.bis as string) : heute.toISOString().slice(0, 10);
  const von = /^\d{4}-\d{2}-\d{2}$/.test(p.von ?? "") ? (p.von as string) : new Date(heute.getFullYear(), heute.getMonth() - 2, 1).toISOString().slice(0, 10);
  const supabase = await serverClient();
  const [{ data: leads }, { data: kampagnen }, { data: quellen }, { data: stufen }] = await Promise.all([
    supabase.from("akquise_leads").select("*").limit(5000),
    supabase.from("akquise_kampagnen").select("id, name, art, kanal, budget, ausgaben, beginn, ende, notiz, aktiv"),
    supabase.from("akquise_quellen").select("id, name, art, kampagne_id, pipeline_id, sortierung, aktiv"),
    supabase.from("akquise_stufen").select("id, pipeline_id, name, zusatz, sortierung, wahrscheinlichkeit, ist_gewonnen, ist_verloren"),
  ]);
  const alle = ((leads ?? []) as LeadZeile[]).map((l) => ({ ...l, provision_erwartet: l.provision_erwartet === null ? null : Number(l.provision_erwartet) }));
  const k = ((kampagnen ?? []) as Kampagne[]).map((x) => ({ ...x, budget: x.budget === null ? null : Number(x.budget), ausgaben: Number(x.ausgaben) }));
  const r = marketingReport(alle, k, (quellen ?? []) as Quelle[], von, bis);
  const prognose = pipelinePrognose(alle, (stufen ?? []) as Stufe[]);
  const f = (n: number | null, einheit = "") => (n === null ? "—" : `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })}${einheit}`);

  return (
    <>
      <Seitenkopf titel="Akquise-Auswertung" beschreibung="Marketing-Report je Zeitraum: Leads nach Quellenart, Abschlüsse, Kosten je Lead und je Abschluss, ROAS, Conversion — und die gewichtete Pipeline-Prognose.">
        <Link href="/akquise" className="text-[13px] text-akzent hover:underline">Zur Akquise</Link>
      </Seitenkopf>
      <form className="mb-5 flex flex-wrap items-end gap-2" action="/akquise/auswertung">
        <Feld id="aw-von" beschriftung="Von"><Eingabe name="von" type="date" defaultValue={von} /></Feld>
        <Feld id="aw-bis" beschriftung="Bis"><Eingabe name="bis" type="date" defaultValue={bis} /></Feld>
        <Button type="submit" variante="sekundaer">Anzeigen</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kennzahl titel="Leads" wert={String(r.leads)} hinweis={`online ${r.online} · offline ${r.offline} · Netzwerk ${r.netzwerk} · Tippgeber ${r.tippgeber}`} />
        <Kennzahl titel="Gewonnen" wert={String(r.gewonnen)} hinweis={`verloren ${r.verloren} · Conversion ${f(r.conversion, " %")}`} />
        <Kennzahl titel="Erwartete Provision" wert={euro(r.umsatz)} hinweis={`je Abschluss ${r.provisionJeAbschluss === null ? "—" : euro(r.provisionJeAbschluss)}`} />
        <Kennzahl titel="Ausgaben" wert={euro(r.ausgaben)} hinweis={`${r.kampagnen} Kampagnen im Zeitraum`} />
        <Kennzahl titel="Kosten je Lead" wert={r.cpl === null ? "—" : euro(r.cpl)} />
        <Kennzahl titel="Kosten je Abschluss" wert={r.cpa === null ? "—" : euro(r.cpa)} />
        <Kennzahl titel="ROAS" wert={r.roas === null ? "—" : `${r.roas.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ×`} hinweis="Provision ÷ Ausgaben" />
        <Kennzahl titel="Pipeline-Prognose" wert={euro(prognose.gewichtet)} hinweis={`roh ${euro(prognose.roh)} · ${prognose.offen} offene Leads`} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Karte>
          <KarteKopf><KarteTitel>Leads je Quelle</KarteTitel></KarteKopf>
          <KarteInhalt>{r.quellen.length === 0 ? <p className="text-[13px] text-gedaempft">Keine Leads im Zeitraum.</p> : <ul className="divide-y divide-linie text-[13px]">{r.quellen.map((q) => <li key={q.name} className="flex justify-between py-1.5"><span className="text-text">{q.name}</span><span className="text-gedaempft">{q.anzahl} · {q.gewonnen} gewonnen</span></li>)}</ul>}</KarteInhalt>
        </Karte>
        <Karte>
          <KarteKopf><KarteTitel>Verlustgründe</KarteTitel></KarteKopf>
          <KarteInhalt>{r.verlustgruende.length === 0 ? <p className="text-[13px] text-gedaempft">Keine Verluste im Zeitraum.</p> : <ul className="divide-y divide-linie text-[13px]">{r.verlustgruende.map((g) => <li key={g.grund} className="flex justify-between py-1.5"><span className="text-text">{g.grund}</span><span className="text-gedaempft">{g.anzahl}</span></li>)}</ul>}</KarteInhalt>
        </Karte>
        <Karte>
          <KarteKopf><KarteTitel>Prognose je Stufe</KarteTitel><KarteBeschreibung>Gewichtet nach Stufen-Wahrscheinlichkeit.</KarteBeschreibung></KarteKopf>
          <KarteInhalt>{prognose.jeStufe.length === 0 ? <p className="text-[13px] text-gedaempft">Keine offenen Leads.</p> : <ul className="divide-y divide-linie text-[13px]">{prognose.jeStufe.map((s) => <li key={s.stufe} className="flex justify-between py-1.5"><span className="text-text">{s.stufe} <span className="text-gedaempft">({s.anzahl})</span></span><span className="text-gedaempft">{euro(s.gewichtet)} <span className="text-[11px]">roh {euro(s.roh)}</span></span></li>)}</ul>}</KarteInhalt>
        </Karte>
      </div>
    </>
  );
}
