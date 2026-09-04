import type { Metadata } from "next";
import Link from "next/link";

import { AufgabeAnlegen } from "@/components/AufgabeAnlegen";
import { AufgabenKanban } from "@/components/aufgaben/AufgabenKanban";
import { Schnelleingabe } from "@/components/aufgaben/Schnelleingabe";
import { Aufgabenliste } from "@/components/Aufgabenliste";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { AUFGABEN_STATUS, fristlage, type AufgabeErweitert, type AufgabenStatus, type Tag } from "@/lib/arbeitsmittel";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Aufgaben" };

const AUSWAHL =
  "id, titel, beschreibung, prioritaet, faellig_am, erledigt_am, objekt_id, kontakt_id, status, typ, tags, wiederholung, erinnerung_am, quelle, team_sichtbar, lead_id, termin_id, nachricht_id, vertrag_id, zustaendig_id, erstellt_von, erstellt_am, " +
  "objekt:objekte(objektnummer, bezeichnung), kontakt:kontakte(vorname, nachname), " +
  "zustaendig:benutzer!aufgaben_zustaendig_id_fkey(name)";

const ANSICHTEN = [["liste", "Liste"], ["kanban", "Kanban"], ["notizen", "Notizen"]] as const;

export default async function AufgabenSeite({ searchParams }: { searchParams: Promise<{ ansicht?: string; wer?: string; status?: string; tag?: string; q?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const ansicht = ANSICHTEN.some(([k]) => k === p.ansicht) ? (p.ansicht as (typeof ANSICHTEN)[number][0]) : "liste";
  const meine = p.wer !== "alle";

  let abfrage = supabase.from("aufgaben").select(AUSWAHL).order("faellig_am", { ascending: true, nullsFirst: false }).limit(500);
  abfrage = ansicht === "notizen" ? abfrage.eq("typ", "notiz") : abfrage.eq("typ", "aufgabe");
  if (meine) abfrage = abfrage.or(`zustaendig_id.eq.${sitzung.benutzerId},erstellt_von.eq.${sitzung.benutzerId}`);
  else abfrage = abfrage.or(`team_sichtbar.eq.true,erstellt_von.eq.${sitzung.benutzerId}`);
  if (p.status && p.status in AUFGABEN_STATUS) abfrage = abfrage.eq("status", p.status);
  else if (ansicht === "liste") abfrage = abfrage.not("status", "in", "(erledigt,verworfen)");
  if (p.tag) abfrage = abfrage.contains("tags", [p.tag]);
  if (p.q) abfrage = abfrage.ilike("titel", `%${p.q.replace(/[%,]/g, "")}%`);
  const [{ data: liste }, { data: erledigt }, { data: tags }] = await Promise.all([
    abfrage,
    ansicht === "liste" && !p.status ? supabase.from("aufgaben").select(AUSWAHL).eq("status", "erledigt").eq("typ", "aufgabe").order("erledigt_am", { ascending: false }).limit(30) : Promise.resolve({ data: [] as unknown[] }),
    supabase.from("aufgaben_tags").select("id, name, farbe").order("name"),
  ]);
  const zeilen = (liste ?? []) as unknown as AufgabeErweitert[];
  const heute = new Date().toISOString();
  const stichtag = new Date(heute);
  const dringend = zeilen.filter((a) => a.status !== "erledigt" && ["ueberfaellig", "heute"].includes(fristlage(a.faellig_am, stichtag)));
  const darfAendern = hatRecht(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const darfLoeschen = hatRecht(sitzung.rolle, "kalender", "loeschen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "kalender", "anlegen", sitzung.uebersteuerung);
  const link = (aenderung: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ansicht: p.ansicht, wer: p.wer, status: p.status, tag: p.tag, q: p.q, ...aenderung })) if (v) q.set(k, v);
    return `/aufgaben?${q.toString()}`;
  };
  const chip = (aktiv: boolean) => `rounded-[var(--radius)] border px-3 py-1 text-[12px] ${aktiv ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`;

  return (
    <div className="space-y-5">
      <Seitenkopf titel={ansicht === "notizen" ? "Notizen" : "Aufgaben"} beschreibung={ansicht === "notizen" ? "Gedanken, Ideen und Merker mit Tags — ohne Frist, jederzeit in eine Aufgabe zu verwandeln." : dringend.length > 0 ? `${dringend.length} ${dringend.length === 1 ? "Aufgabe ist" : "Aufgaben sind"} heute oder früher fällig.` : "Alles im Zeitplan."}>
        <Link href="/checklisten" className="text-[13px] text-akzent hover:underline">Checklisten</Link>
      </Seitenkopf>

      {darfAnlegen && <Schnelleingabe heute={heute} zustaendigId={sitzung.benutzerId} />}

      <div className="flex flex-wrap items-center gap-2">
        {ANSICHTEN.map(([k, b]) => <Link key={k} href={link({ ansicht: k, status: undefined })} className={chip(ansicht === k)}>{b}</Link>)}
        <span className="mx-1 text-linie">|</span>
        <Link href={link({ wer: undefined })} className={chip(meine)}>Meine</Link>
        <Link href={link({ wer: "alle" })} className={chip(!meine)}>Team</Link>
        {ansicht !== "kanban" && (
          <>
            <span className="mx-1 text-linie">|</span>
            <Link href={link({ status: undefined })} className={chip(!p.status)}>Offen</Link>
            {(Object.keys(AUFGABEN_STATUS) as AufgabenStatus[]).map((s) => <Link key={s} href={link({ status: s })} className={chip(p.status === s)}>{AUFGABEN_STATUS[s]}</Link>)}
          </>
        )}
        {(tags ?? []).length > 0 && (
          <>
            <span className="mx-1 text-linie">|</span>
            {((tags ?? []) as Tag[]).map((t) => <Link key={t.id} href={link({ tag: p.tag === t.name ? undefined : t.name })} className={chip(p.tag === t.name)} style={{ borderColor: p.tag === t.name ? undefined : t.farbe }}>#{t.name}</Link>)}
          </>
        )}
        <form className="ml-auto" action="/aufgaben">
          {p.ansicht && <input type="hidden" name="ansicht" value={p.ansicht} />}
          {p.wer && <input type="hidden" name="wer" value={p.wer} />}
          <input name="q" defaultValue={p.q ?? ""} placeholder="Suchen …" aria-label="Aufgaben durchsuchen" className="h-8 rounded-[var(--radius)] border border-linie bg-flaeche px-2 text-[12px]" />
        </form>
      </div>

      {ansicht === "kanban" ? (
        zeilen.length === 0 ? <Hinweis>Keine Aufgaben in dieser Auswahl.</Hinweis> : <AufgabenKanban aufgaben={zeilen} heute={heute} darfAendern={darfAendern} />
      ) : ansicht === "notizen" ? (
        zeilen.length === 0 ? <Hinweis>Keine Notizen. Schreiben Sie oben „Notiz: …“ oder legen Sie eine Aufgabe als Notiz an.</Hinweis> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {zeilen.map((n) => (
              <Link key={n.id} href={`/aufgaben/${n.id}`} className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche p-4 transition-colors hover:border-akzent/50">
                <p className="text-[14px] font-medium text-text">{n.titel}</p>
                {n.beschreibung && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[12.5px] text-gedaempft">{n.beschreibung}</p>}
                <p className="mt-2 flex flex-wrap gap-1 text-[11px] text-gedaempft">{n.tags.map((t) => <Marke key={t}>#{t}</Marke>)}{n.prioritaet === "hoch" && <Marke ton="akzent">Hoch</Marke>}{!n.team_sichtbar && <Marke>privat</Marke>}<span className="ml-auto">{n.zustaendig?.name}</span></p>
              </Link>
            ))}
          </div>
        )
      ) : (
        <>
          <Karte>
            <KarteKopf>
              <KarteTitel>{p.status ? AUFGABEN_STATUS[p.status as AufgabenStatus] : "Offen"}</KarteTitel>
              <KarteBeschreibung>{zeilen.length === 0 ? "Keine Aufgaben." : `${zeilen.length} — überfällige zuerst, Aufgaben ohne Frist am Ende. Ein Klick auf den Titel öffnet Schritte, Kommentare und Verknüpfungen.`}</KarteBeschreibung>
            </KarteKopf>
            <KarteInhalt className="space-y-3">
              <Aufgabenliste aufgaben={zeilen} heute={heute} darfAendern={darfAendern} darfLoeschen={darfLoeschen} />
              {darfAnlegen && <AufgabeAnlegen />}
            </KarteInhalt>
          </Karte>
          {(erledigt ?? []).length > 0 && (
            <Karte>
              <KarteKopf><KarteTitel>Zuletzt erledigt</KarteTitel></KarteKopf>
              <KarteInhalt><Aufgabenliste aufgaben={(erledigt ?? []) as unknown as AufgabeErweitert[]} heute={heute} darfAendern={darfAendern} darfLoeschen={darfLoeschen} /></KarteInhalt>
            </Karte>
          )}
        </>
      )}
    </div>
  );
}
