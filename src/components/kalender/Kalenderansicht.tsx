"use client";

import Link from "next/link";

import { TERMINARTEN } from "@/lib/arbeitsmittel";
import { fahrzeitText } from "@/lib/kalender/fahrzeit";
import { mitarbeiterFarbe, type KalenderTermin, type Mitarbeiter } from "@/lib/kalender/typen";
import { berlin, datumKurz, monatPlus, tagPlus, wochenstart } from "@/lib/kalender/zeit";

export type Ansicht = "tag" | "woche" | "monat" | "liste";

const STUNDE_PX = 44;
const START_STUNDE = 7;
const ENDE_STUNDE = 20;
const TAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function link(ansicht: Ansicht, datum: string, person: string): string {
  return `/kalender?${new URLSearchParams({ ansicht, datum, ...(person !== "alle" ? { person } : {}) }).toString()}`;
}

function farbeVon(t: KalenderTermin, mitarbeiter: Mitarbeiter[]): string {
  const i = mitarbeiter.findIndex((m) => m.id === t.zustaendig_id);
  return mitarbeiterFarbe(mitarbeiter[i], Math.max(0, i));
}

/** Termine eines Tages, mit Spalten fuer Ueberschneidungen. */
function spalten(termine: KalenderTermin[]): Array<{ t: KalenderTermin; spalte: number; anzahl: number }> {
  const sortiert = [...termine].sort((a, b) => a.beginnt_am.localeCompare(b.beginnt_am));
  const aus: Array<{ t: KalenderTermin; spalte: number; anzahl: number }> = [];
  let gruppe: Array<{ t: KalenderTermin; spalte: number; anzahl: number }> = [];
  let gruppenEnde = "";
  const abschliessen = () => { for (const g of gruppe) g.anzahl = Math.max(...gruppe.map((x) => x.spalte)) + 1; aus.push(...gruppe); gruppe = []; };
  for (const t of sortiert) {
    if (gruppe.length > 0 && t.beginnt_am >= gruppenEnde) abschliessen();
    const belegt = new Set(gruppe.filter((g) => g.t.endet_am > t.beginnt_am).map((g) => g.spalte));
    let spalte = 0;
    while (belegt.has(spalte)) spalte++;
    gruppe.push({ t, spalte, anzahl: 1 });
    if (t.endet_am > gruppenEnde) gruppenEnde = t.endet_am;
  }
  if (gruppe.length > 0) abschliessen();
  return aus;
}

function TerminBlock({ t, farbe, fahrzeit, spalte, anzahl, von, bis }: { t: KalenderTermin; farbe: string; fahrzeit: boolean; spalte: number; anzahl: number; von: number; bis: number }) {
  const oben = ((von - START_STUNDE * 60) / 60) * STUNDE_PX;
  const hoehe = Math.max(18, ((bis - von) / 60) * STUNDE_PX);
  const breite = 100 / anzahl;
  const hin = fahrzeit && t.fahrzeit?.hin?.min ? t.fahrzeit.hin.min : 0;
  const rueck = fahrzeit && t.fahrzeit?.rueck?.min ? t.fahrzeit.rueck.min : 0;
  const schraffur = { backgroundImage: `repeating-linear-gradient(45deg, ${farbe}22 0 4px, transparent 4px 8px)` };
  return (
    <>
      {hin > 0 && <div className="absolute rounded-t border-x border-t border-dashed" style={{ ...schraffur, borderColor: `${farbe}66`, top: oben - (hin / 60) * STUNDE_PX, height: (hin / 60) * STUNDE_PX, left: `${spalte * breite}%`, width: `calc(${breite}% - 2px)` }} title={`Anfahrt ${fahrzeitText(hin)}`} />}
      <Link
        href={`/kalender/${t.id}`}
        className={`absolute overflow-hidden rounded-[var(--radius)] border px-1.5 py-0.5 text-[11px] leading-tight text-white shadow-sm transition-opacity hover:opacity-90 ${t.abgesagt_am ? "line-through opacity-50" : ""}`}
        style={{ top: oben, height: hoehe, left: `${spalte * breite}%`, width: `calc(${breite}% - 2px)`, background: t.extern_quelle ? "#7A828C" : farbe, borderColor: "rgba(255,255,255,.35)" }}
        title={`${t.titel} · ${berlin(t.beginnt_am).zeit}–${berlin(t.endet_am).zeit}${t.ort ? ` · ${t.ort}` : ""}`}
      >
        <span className="font-medium">{berlin(t.beginnt_am).zeit}</span> {t.titel}
        {hoehe > 34 && <div className="truncate opacity-80">{t.objekt ? `${t.objekt.objektnummer} ${t.objekt.bezeichnung}` : t.ort ?? TERMINARTEN[t.art]}</div>}
      </Link>
      {rueck > 0 && <div className="absolute rounded-b border-x border-b border-dashed" style={{ ...schraffur, borderColor: `${farbe}66`, top: oben + hoehe, height: (rueck / 60) * STUNDE_PX, left: `${spalte * breite}%`, width: `calc(${breite}% - 2px)` }} title={`Rückfahrt ${fahrzeitText(rueck)}`} />}
    </>
  );
}

function TagesSpalte({ datum, termine, mitarbeiter, fahrzeit, heute, ansicht, person }: { datum: string; termine: KalenderTermin[]; mitarbeiter: Mitarbeiter[]; fahrzeit: boolean; heute: string; ansicht: Ansicht; person: string }) {
  const zeitTermine = termine.filter((t) => !t.ganztags);
  const bloecke = spalten(zeitTermine);
  const hoehe = (ENDE_STUNDE - START_STUNDE) * STUNDE_PX;
  return (
    <div className={`relative border-l border-linie ${datum === heute ? "bg-akzent-schwach/30" : ""}`} style={{ height: hoehe }}>
      {Array.from({ length: ENDE_STUNDE - START_STUNDE }, (_, i) => (
        <Link key={i} href={`${link(ansicht, datum, person)}&neu=1&zeit=${String(START_STUNDE + i).padStart(2, "0")}:00`} aria-label={`Termin am ${datumKurz(datum)} um ${START_STUNDE + i}:00 anlegen`} className="absolute left-0 right-0 border-t border-linie/70 hover:bg-akzent-schwach/60" style={{ top: i * STUNDE_PX, height: STUNDE_PX }} />
      ))}
      {bloecke.map(({ t, spalte, anzahl }) => {
        const b = berlin(t.beginnt_am);
        const e = berlin(t.endet_am);
        const von = Math.max(START_STUNDE * 60, b.datum < datum ? START_STUNDE * 60 : b.minuten);
        const bis = Math.min(ENDE_STUNDE * 60, e.datum > datum ? ENDE_STUNDE * 60 : Math.max(e.minuten, von + 15));
        return <TerminBlock key={t.id} t={t} farbe={farbeVon(t, mitarbeiter)} fahrzeit={fahrzeit} spalte={spalte} anzahl={anzahl} von={von} bis={bis} />;
      })}
    </div>
  );
}

export function Kalenderansicht({ ansicht, datum, termine, mitarbeiter, person, heute, fahrzeit }: { ansicht: Ansicht; datum: string; termine: KalenderTermin[]; mitarbeiter: Mitarbeiter[]; person: string; heute: string; fahrzeit: boolean }) {
  const tage: string[] = ansicht === "tag" ? [datum] : ansicht === "woche" ? Array.from({ length: 7 }, (_, i) => tagPlus(wochenstart(datum), i)) : [];
  const jeTag = (tag: string) => termine.filter((t) => { const b = berlin(t.beginnt_am).datum; const e = berlin(new Date(new Date(t.endet_am).getTime() - 1)).datum; return b <= tag && e >= tag; });
  const monatsAnfang = `${datum.slice(0, 8)}01`;
  const zurueck = ansicht === "tag" ? tagPlus(datum, -1) : ansicht === "woche" ? tagPlus(datum, -7) : monatPlus(monatsAnfang, -1);
  const vor = ansicht === "tag" ? tagPlus(datum, 1) : ansicht === "woche" ? tagPlus(datum, 7) : monatPlus(monatsAnfang, 1);
  const titel = ansicht === "tag" ? datumKurz(datum) : ansicht === "woche" ? `${datumKurz(tage[0] ?? datum)} – ${datumKurz(tage[6] ?? datum)}` : new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${datum.slice(0, 8)}01T12:00:00Z`));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link href={link(ansicht, zurueck, person)} className="rounded-[var(--radius)] border border-linie bg-flaeche px-2.5 py-1 text-[13px] hover:border-akzent/50" aria-label="Zurück">‹</Link>
          <Link href={link(ansicht, heute, person)} className="rounded-[var(--radius)] border border-linie bg-flaeche px-2.5 py-1 text-[13px] hover:border-akzent/50">Heute</Link>
          <Link href={link(ansicht, vor, person)} className="rounded-[var(--radius)] border border-linie bg-flaeche px-2.5 py-1 text-[13px] hover:border-akzent/50" aria-label="Vor">›</Link>
        </div>
        <p className="font-titel text-[15px] font-semibold text-text">{titel}</p>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(["tag", "woche", "monat", "liste"] as Ansicht[]).map((a) => (
            <Link key={a} href={link(a, datum, person)} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${ansicht === a ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{{ tag: "Tag", woche: "Woche", monat: "Monat", liste: "Liste" }[a]}</Link>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Link href={link(ansicht, datum, "alle")} className={`rounded-[var(--radius)] border px-2.5 py-0.5 text-[12px] ${person === "alle" ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>Alle</Link>
        {mitarbeiter.map((m, i) => (
          <Link key={m.id} href={link(ansicht, datum, m.id)} className={`flex items-center gap-1.5 rounded-[var(--radius)] border px-2.5 py-0.5 text-[12px] ${person === m.id ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: mitarbeiterFarbe(m, i) }} aria-hidden="true" />{m.name}
          </Link>
        ))}
      </div>

      {(ansicht === "woche" || ansicht === "tag") && (
        <div className="overflow-x-auto rounded-[var(--radius-gross)] border border-linie bg-flaeche">
          <div className="min-w-[640px]">
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${tage.length}, 1fr)` }}>
              <div className="border-b border-linie" />
              {tage.map((tag) => {
                const [j, m, d] = tag.split("-");
                const wt = TAGE_KURZ[(new Date(Date.UTC(Number(j), Number(m) - 1, Number(d), 12)).getUTCDay() + 6) % 7];
                return <div key={tag} className={`border-b border-l border-linie px-2 py-1.5 text-center text-[12px] ${tag === heute ? "font-semibold text-akzent" : "text-gedaempft"}`}>{wt} {d}.{m}.</div>;
              })}
              <div className="border-b border-linie px-1 py-1 text-[10px] text-gedaempft">ganztags</div>
              {tage.map((tag) => (
                <div key={`g-${tag}`} className="min-h-[26px] space-y-0.5 border-b border-l border-linie p-0.5">
                  {jeTag(tag).filter((t) => t.ganztags).map((t) => (
                    <Link key={t.id} href={`/kalender/${t.id}`} className={`block truncate rounded px-1.5 py-0.5 text-[11px] text-white ${t.abgesagt_am ? "line-through opacity-50" : ""}`} style={{ background: farbeVon(t, mitarbeiter) }}>{t.titel}</Link>
                  ))}
                </div>
              ))}
              <div className="relative" style={{ height: (ENDE_STUNDE - START_STUNDE) * STUNDE_PX }}>
                {Array.from({ length: ENDE_STUNDE - START_STUNDE }, (_, i) => <div key={i} className="absolute right-1 text-[10px] text-gedaempft" style={{ top: i * STUNDE_PX - 6 }}>{String(START_STUNDE + i).padStart(2, "0")}:00</div>)}
              </div>
              {tage.map((tag) => <TagesSpalte key={tag} datum={tag} termine={jeTag(tag)} mitarbeiter={mitarbeiter} fahrzeit={fahrzeit} heute={heute} ansicht={ansicht} person={person} />)}
            </div>
          </div>
        </div>
      )}

      {ansicht === "monat" && (() => {
        const erster = `${datum.slice(0, 8)}01`;
        const start = wochenstart(erster);
        const zellen = Array.from({ length: 42 }, (_, i) => tagPlus(start, i));
        return (
          <div className="overflow-x-auto rounded-[var(--radius-gross)] border border-linie bg-flaeche">
            <div className="grid min-w-[640px] grid-cols-7">
              {TAGE_KURZ.map((w) => <div key={w} className="border-b border-linie px-2 py-1.5 text-center text-[12px] text-gedaempft">{w}</div>)}
              {zellen.map((tag) => {
                const liste = jeTag(tag);
                const imMonat = tag.slice(0, 7) === datum.slice(0, 7);
                return (
                  <div key={tag} className={`min-h-[92px] border-b border-l border-linie p-1 ${imMonat ? "" : "bg-hintergrund/60"} ${tag === heute ? "bg-akzent-schwach/30" : ""}`}>
                    <Link href={link("tag", tag, person)} className={`block text-right text-[11px] ${tag === heute ? "font-semibold text-akzent" : imMonat ? "text-text" : "text-gedaempft"}`}>{Number(tag.slice(8, 10))}</Link>
                    <div className="mt-0.5 space-y-0.5">
                      {liste.slice(0, 3).map((t) => (
                        <Link key={t.id} href={`/kalender/${t.id}`} className={`block truncate rounded px-1 py-0.5 text-[10.5px] text-white ${t.abgesagt_am ? "line-through opacity-50" : ""}`} style={{ background: t.extern_quelle ? "#7A828C" : farbeVon(t, mitarbeiter) }}>{t.ganztags ? "" : `${berlin(t.beginnt_am).zeit} `}{t.titel}</Link>
                      ))}
                      {liste.length > 3 && <Link href={link("tag", tag, person)} className="block text-[10.5px] text-gedaempft hover:text-akzent">+ {liste.length - 3} weitere</Link>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
