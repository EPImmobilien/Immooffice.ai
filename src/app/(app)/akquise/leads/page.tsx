import type { Metadata } from "next";
import Link from "next/link";

import { LeadNeu } from "@/components/akquise/LeadNeu";
import { StufeWechsel } from "@/components/akquise/StufeWechsel";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Hinweis, Marke } from "@/components/ui/Status";
import { LEAD_STATUS, leadAdresse, nachfassLage, type Kampagne, type LeadStatus, type LeadZeile, type Pipeline, type Quelle, type Stufe } from "@/lib/akquise/stammdaten";
import { akquiseEinstellungenLaden } from "@/lib/akquise/vergleichswerte";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum, euro } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { akquiseVorbereiten } from "@/server/akquise-aktionen";

export const metadata: Metadata = { title: "Leads" };

type Zeile = LeadZeile & { kontakt: { vorname: string | null; nachname: string | null; firma: string | null } | null; quelle: { name: string } | null; zustaendig: { name: string } | null };
const TON: Record<LeadStatus, "info" | "erfolg" | "fehler"> = { offen: "info", gewonnen: "erfolg", verloren: "fehler" };

export default async function LeadsSeite({ searchParams }: { searchParams: Promise<{ pipeline?: string; status?: string; ansicht?: string; nachfassen?: string; q?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "akquise", "lesen", sitzung.uebersteuerung);
  const standardPipeline = await akquiseVorbereiten();
  const supabase = await serverClient();
  const [{ data: pipelines }, { data: stufen }, { data: quellen }, { data: kampagnen }, { data: kontakte }, { data: objekte }, { data: benutzer }, einst] = await Promise.all([
    supabase.from("akquise_pipelines").select("id, name, beschreibung, ist_standard, sortierung").order("sortierung"),
    supabase.from("akquise_stufen").select("id, pipeline_id, name, zusatz, sortierung, wahrscheinlichkeit, ist_gewonnen, ist_verloren").order("sortierung"),
    supabase.from("akquise_quellen").select("id, name, art, kampagne_id, pipeline_id, sortierung, aktiv").order("sortierung"),
    supabase.from("akquise_kampagnen").select("id, name, art, kanal, budget, ausgaben, beginn, ende, notiz, aktiv").order("name"),
    supabase.from("kontakte").select("id, vorname, nachname, firma").is("geloescht_am", null).order("nachname").limit(500),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(300),
    supabase.from("benutzer").select("id, name").eq("aktiv", true).order("name"),
    akquiseEinstellungenLaden(supabase),
  ]);
  const pipelineId = (pipelines ?? []).some((x) => x.id === p.pipeline) ? (p.pipeline as string) : (standardPipeline ?? (pipelines ?? [])[0]?.id ?? "");
  const ansicht = p.ansicht === "kanban" ? "kanban" : "liste";
  let abfrage = supabase.from("akquise_leads").select("*, kontakt:kontakte!akquise_leads_kontakt_id_fkey(vorname, nachname, firma), quelle:akquise_quellen(name), zustaendig:benutzer!akquise_leads_zustaendig_id_fkey(name)").eq("pipeline_id", pipelineId).order("erstellt_am", { ascending: false }).limit(500);
  if (p.status && p.status in LEAD_STATUS) abfrage = abfrage.eq("status", p.status);
  if (p.nachfassen) abfrage = abfrage.eq("status", "offen").eq("nachfassen", true).lte("nachfassen_am", new Date().toISOString().slice(0, 10));
  if (p.q) abfrage = abfrage.or(`titel.ilike.%${p.q.replace(/[%,]/g, "")}%,ort.ilike.%${p.q.replace(/[%,]/g, "")}%,strasse.ilike.%${p.q.replace(/[%,]/g, "")}%`);
  const { data: leads } = await abfrage;
  const zeilen = ((leads ?? []) as unknown as Zeile[]).map((l) => ({ ...l, provision_erwartet: l.provision_erwartet === null ? null : Number(l.provision_erwartet) }));
  const stufenDerPipeline = ((stufen ?? []) as Stufe[]).filter((s) => s.pipeline_id === pipelineId);
  const heute = new Date().toISOString().slice(0, 10);
  const darfAnlegen = hatRecht(sitzung.rolle, "akquise", "anlegen", sitzung.uebersteuerung);
  const darfAendern = hatRecht(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung);
  const link = (aenderung: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const werte = { pipeline: pipelineId, status: p.status, ansicht: p.ansicht, nachfassen: p.nachfassen, q: p.q, ...aenderung };
    for (const [k, v] of Object.entries(werte)) if (v) q.set(k, v);
    return `/akquise/leads?${q.toString()}`;
  };
  const kontaktName = (l: Zeile) => (l.kontakt ? [l.kontakt.vorname, l.kontakt.nachname].filter(Boolean).join(" ") || l.kontakt.firma || "" : "");

  return (
    <>
      <Seitenkopf titel="Leads" beschreibung="Eigentümer-Leads je Pipeline — als Liste oder Kanban, mit Stufe, Quelle, Nachfassen und erwarteter Provision.">
        <Link href="/akquise" className="text-[13px] text-akzent hover:underline">Zur Akquise</Link>
      </Seitenkopf>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(pipelines ?? []).map((pl) => (
          <Link key={pl.id} href={link({ pipeline: pl.id })} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${pipelineId === pl.id ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{pl.name}</Link>
        ))}
        <span className="mx-1 text-linie">|</span>
        <Link href={link({ status: undefined, nachfassen: undefined })} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${!p.status && !p.nachfassen ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>Alle</Link>
        {(Object.keys(LEAD_STATUS) as LeadStatus[]).map((s) => (
          <Link key={s} href={link({ status: s, nachfassen: undefined })} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${p.status === s ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{LEAD_STATUS[s]}</Link>
        ))}
        <Link href={link({ nachfassen: "1", status: undefined })} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${p.nachfassen ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>Nachfassen fällig</Link>
        <span className="mx-1 text-linie">|</span>
        <Link href={link({ ansicht: "liste" })} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${ansicht === "liste" ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>Liste</Link>
        <Link href={link({ ansicht: "kanban" })} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${ansicht === "kanban" ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>Kanban</Link>
        <form className="ml-auto flex items-center gap-1" action="/akquise/leads">
          <input type="hidden" name="pipeline" value={pipelineId} />
          {p.ansicht && <input type="hidden" name="ansicht" value={p.ansicht} />}
          <input name="q" defaultValue={p.q ?? ""} placeholder="Suchen …" className="h-8 rounded-[var(--radius)] border border-linie bg-flaeche px-2 text-[12px]" aria-label="Leads durchsuchen" />
        </form>
      </div>

      {darfAnlegen && (
        <details className="mb-5" open={zeilen.length === 0}>
          <summary className="cursor-pointer text-[13px] font-medium text-akzent">Lead anlegen</summary>
          <div className="mt-3">
            <LeadNeu
              pipelines={(pipelines ?? []) as Pipeline[]}
              quellen={(quellen ?? []) as Quelle[]}
              kampagnen={((kampagnen ?? []) as Kampagne[]).map((k) => ({ ...k, budget: k.budget === null ? null : Number(k.budget), ausgaben: Number(k.ausgaben) }))}
              kontakte={((kontakte ?? []) as Array<{ id: string; vorname: string | null; nachname: string | null; firma: string | null }>).map((k) => ({ id: k.id, name: [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "Kontakt" }))}
              objekte={(objekte ?? []) as { id: string; objektnummer: string; bezeichnung: string }[]}
              benutzer={(benutzer ?? []) as { id: string; name: string }[]}
              aktuellerBenutzer={sitzung.benutzerId}
            />
          </div>
        </details>
      )}

      {zeilen.length === 0 ? (
        <Hinweis>Keine Leads in dieser Auswahl.</Hinweis>
      ) : ansicht === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {stufenDerPipeline.map((s) => {
            const inStufe = zeilen.filter((l) => l.stufe_id === s.id);
            const summe = inStufe.reduce((a, l) => a + (l.provision_erwartet ?? 0), 0);
            return (
              <div key={s.id} className={`w-72 shrink-0 rounded-[var(--radius-gross)] border bg-flaeche-gedaempft p-3 ${s.ist_gewonnen ? "border-erfolg/40" : s.ist_verloren ? "border-fehler/40" : "border-linie"}`}>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-[13px] font-semibold text-text">{s.name} <span className="font-normal text-gedaempft">{inStufe.length}</span></p>
                  <span className="text-[11px] text-gedaempft">{s.ist_gewonnen || s.ist_verloren ? "" : `${s.wahrscheinlichkeit} %`}{summe > 0 ? ` · ${euro(summe)}` : ""}</span>
                </div>
                <div className="space-y-2">
                  {inStufe.map((l) => {
                    const lage = nachfassLage(l, heute);
                    return (
                      <div key={l.id} className="rounded-[var(--radius)] border border-linie bg-flaeche p-2.5">
                        <Link href={`/akquise/leads/${l.id}`} className="block text-[13px] font-medium text-text hover:underline">{l.titel}</Link>
                        <p className="text-[11px] text-gedaempft">{[kontaktName(l), l.quelle?.name, l.provision_erwartet ? euro(l.provision_erwartet) : null].filter(Boolean).join(" · ")}</p>
                        {lage && lage !== "offen" && <Marke ton={lage === "ueberfaellig" ? "fehler" : "warnung"} className="mt-1">Nachfassen {datum(l.nachfassen_am)}</Marke>}
                        {darfAendern && <div className="mt-2"><StufeWechsel leadId={l.id} stufeId={l.stufe_id} stufen={stufenDerPipeline} verlustgruende={einst.verlustgruende} kompakt /></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-gross)] border border-linie bg-flaeche">
          <table className="w-full text-[13px]">
            <thead className="bg-flaeche-gedaempft text-left text-[11px] uppercase tracking-wide text-gedaempft">
              <tr><th className="px-3 py-2">Lead</th><th className="px-3 py-2">Eigentümer</th><th className="px-3 py-2">Stufe</th><th className="px-3 py-2">Quelle</th><th className="px-3 py-2">Zuständig</th><th className="px-3 py-2">Nachfassen</th><th className="px-3 py-2 text-right">Provision</th></tr>
            </thead>
            <tbody className="divide-y divide-linie">
              {zeilen.map((l) => {
                const lage = nachfassLage(l, heute);
                return (
                  <tr key={l.id} className="align-top">
                    <td className="px-3 py-2"><Link href={`/akquise/leads/${l.id}`} className="font-medium text-text hover:underline">{l.titel}</Link><p className="text-[11px] text-gedaempft">{leadAdresse(l)} · {datum(l.erstellt_am)}</p></td>
                    <td className="px-3 py-2 text-text">{kontaktName(l) || <span className="text-gedaempft">—</span>}</td>
                    <td className="px-3 py-2">{darfAendern ? <StufeWechsel leadId={l.id} stufeId={l.stufe_id} stufen={stufenDerPipeline} verlustgruende={einst.verlustgruende} kompakt /> : <Marke ton={TON[l.status]}>{stufenDerPipeline.find((s) => s.id === l.stufe_id)?.name ?? LEAD_STATUS[l.status]}</Marke>}{l.verlustgrund && <p className="text-[11px] text-gedaempft">{l.verlustgrund}</p>}</td>
                    <td className="px-3 py-2 text-gedaempft">{l.quelle?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-gedaempft">{l.zustaendig?.name ?? "—"}</td>
                    <td className="px-3 py-2">{lage ? <Marke ton={lage === "ueberfaellig" ? "fehler" : lage === "heute" ? "warnung" : "neutral"}>{datum(l.nachfassen_am)}</Marke> : <span className="text-gedaempft">—</span>}</td>
                    <td className="px-3 py-2 text-right text-text">{l.provision_erwartet ? euro(l.provision_erwartet) : <span className="text-gedaempft">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
