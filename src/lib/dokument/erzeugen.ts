import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createElement, type ReactElement } from "react";

import { DOKUMENT_BUCKET } from "@/lib/dokumente";
import { icsKalender } from "@/lib/kalender/ics";
import { terminOrtText } from "@/lib/kalender/bestaetigung";
import { TERMINARTEN, type Terminart } from "@/lib/arbeitsmittel";
import { logoLaden } from "@/lib/expose/logo-laden";
import { briefAlsDokument, rechnungAlsDokument, type Absender, type Brief, type Position, type Rechnung } from "@/lib/rechnungen";

import { DokumentPdf } from "./pdf";
import type { Briefkopf, Dokument } from "./struktur";

/**
 * Serverseitige Erzeugung von PDFs aus der Dokumentstruktur — gemeinsam fuer
 * die Download-Route, das Festschreiben von Rechnungen (GoBD: die gestellte
 * Rechnung liegt als Datei im Storage) und E-Mail-Anhaenge aus dem Postfach.
 */

export async function briefkopfLaden(supabase: SupabaseClient, mandantId: string, mandantName: string, absender?: Partial<Absender> | null): Promise<Briefkopf> {
  const { data: branding } = await supabase
    .from("mandant_branding")
    .select("firmenname, strasse, hausnummer, plz, ort, telefon, email, web, logo_pfad, farbe_primaer, farbe_akzent")
    .eq("mandant_id", mandantId)
    .maybeSingle();
  const logo = await logoLaden(supabase, branding?.logo_pfad as string | null);
  // Ein Rechnungs- oder Briefabsender ueberschreibt die Anschrift im Kopf (persoenliche Rechnung, Zweigstelle).
  const a = absender ?? null;
  const strasse = a ? [a.strasse, a.hausnummer].filter(Boolean).join(" ") : [branding?.strasse, branding?.hausnummer].filter(Boolean).join(" ");
  const ort = a ? [a.plz, a.ort].filter(Boolean).join(" ") : [branding?.plz, branding?.ort].filter(Boolean).join(" ");
  const kontakt = a ? [a.telefon, a.email, a.web] : [branding?.telefon, branding?.email, branding?.web];
  return {
    firmenname: a?.name ?? (branding?.firmenname as string | null) ?? mandantName,
    zeile2: [strasse, ort].filter(Boolean).join(" · "),
    zeile3: kontakt.filter(Boolean).join(" · "),
    logo: logo ? `data:image/${logo.format === "jpg" ? "jpeg" : "png"};base64,${logo.daten.toString("base64")}` : null,
    farbePrimaer: (branding?.farbe_primaer as string | null) ?? "#1B2A47",
    farbeAkzent: (branding?.farbe_akzent as string | null) ?? "#B5934F",
  };
}

export async function dokumentAlsPdf(dokument: Dokument, kopf: Briefkopf): Promise<Buffer> {
  return renderToBuffer(createElement(DokumentPdf, { dokument, kopf }) as unknown as ReactElement<DocumentProps>);
}

export function dateinameSicher(name: string, laenge = 80): string {
  return name.replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_").slice(0, laenge);
}

function zahl(w: unknown): number {
  return w === null || w === undefined ? 0 : Number(w);
}

/** Rechnung samt Positionen und Absender laden und als Dokument aufbereiten. */
export async function rechnungDokumentLaden(supabase: SupabaseClient, mandantId: string, id: string): Promise<{ rechnung: Rechnung; dokument: Dokument; absender: Partial<Absender> | null; dateiname: string } | null> {
  const { data: r } = await supabase.from("rechnungen").select("*").eq("id", id).eq("mandant_id", mandantId).maybeSingle();
  if (!r) return null;
  const [{ data: positionen }, { data: a }] = await Promise.all([
    supabase.from("rechnungspositionen").select("id, position, beschreibung, menge, einheit, einzelpreis_netto, mwst_satz, netto").eq("rechnung_id", id).order("position"),
    r.absender_id ? supabase.from("rechnungs_absender").select("*").eq("id", r.absender_id as string).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rechnung = { ...(r as Record<string, unknown>), netto: zahl(r.netto), mwst: zahl(r.mwst), brutto: zahl(r.brutto), bezahlt_betrag: r.bezahlt_betrag === null ? null : zahl(r.bezahlt_betrag) } as unknown as Rechnung;
  const pos: Position[] = (positionen ?? []).map((p) => ({ id: p.id as string, position: p.position as number, beschreibung: p.beschreibung as string, menge: zahl(p.menge), einheit: (p.einheit as string | null) ?? null, einzelpreis_netto: zahl(p.einzelpreis_netto), mwst_satz: zahl(p.mwst_satz), netto: zahl(p.netto) }));
  // Nach dem Stellen gilt der eingefrorene Absender, davor der aktuelle Stammsatz.
  const absender = (rechnung.status !== "entwurf" && rechnung.absender_snapshot ? rechnung.absender_snapshot : (a as Partial<Absender> | null)) ?? null;
  const dokument = rechnungAlsDokument(rechnung, pos, absender);
  const dateiname = rechnung.rechnungsnummer ? `Rechnung_${dateinameSicher(rechnung.rechnungsnummer)}` : `Rechnungsentwurf_${id.slice(0, 8)}`;
  return { rechnung, dokument, absender, dateiname };
}

export async function briefDokumentLaden(supabase: SupabaseClient, mandantId: string, id: string): Promise<{ brief: Brief; dokument: Dokument; absender: Partial<Absender> | null; dateiname: string } | null> {
  const { data: b } = await supabase.from("briefe").select("*").eq("id", id).eq("mandant_id", mandantId).maybeSingle();
  if (!b) return null;
  const { data: a } = b.absender_id ? await supabase.from("rechnungs_absender").select("*").eq("id", b.absender_id as string).maybeSingle() : { data: null };
  const brief = b as unknown as Brief;
  const absender = (a as Partial<Absender> | null) ?? null;
  return { brief, dokument: briefAlsDokument(brief, absender), absender, dateiname: `Brief_${dateinameSicher(brief.betreff, 60)}` };
}

/**
 * PDF einer Rechnung oder eines Briefs als Anhang: Liegt eine festgeschriebene
 * Datei im Storage, wird genau diese verwendet — nie eine neue Fassung.
 */
export async function anhangPdf(supabase: SupabaseClient, mandantId: string, mandantName: string, art: "rechnung" | "brief" | "termin", id: string): Promise<{ dateiname: string; mime: string; inhalt: Buffer; bezeichnung: string } | null> {
  if (art === "termin") {
    const t = await terminIcsLaden(supabase, mandantId, id, mandantName);
    return t ? { dateiname: t.dateiname, mime: "text/calendar", inhalt: Buffer.from(t.ics, "utf8"), bezeichnung: t.bezeichnung } : null;
  }
  const geladen = art === "rechnung" ? await rechnungDokumentLaden(supabase, mandantId, id) : await briefDokumentLaden(supabase, mandantId, id);
  if (!geladen) return null;
  const pfad = "rechnung" in geladen ? geladen.rechnung.pdf_pfad : geladen.brief.pdf_pfad;
  const bezeichnung = "rechnung" in geladen ? `Rechnung ${geladen.rechnung.rechnungsnummer ?? "(Entwurf)"}` : `Brief „${geladen.brief.betreff}“`;
  if (pfad) {
    const { data } = await supabase.storage.from(DOKUMENT_BUCKET).download(pfad).catch(() => ({ data: null }));
    if (data) return { dateiname: `${geladen.dateiname}.pdf`, mime: "application/pdf", inhalt: Buffer.from(await data.arrayBuffer()), bezeichnung };
  }
  const kopf = await briefkopfLaden(supabase, mandantId, mandantName, geladen.absender);
  return { dateiname: `${geladen.dateiname}.pdf`, mime: "application/pdf", inhalt: await dokumentAlsPdf(geladen.dokument, kopf), bezeichnung };
}

/** PDF erzeugen und im Unterlagen-Bucket festschreiben; gibt den Pfad zurueck. */
export async function pdfFestschreiben(supabase: SupabaseClient, mandantId: string, mandantName: string, art: "rechnungen" | "briefe", id: string, dokument: Dokument, absender: Partial<Absender> | null): Promise<string | null> {
  const pfad = `${mandantId}/${art}/${id}.pdf`;
  try {
    const kopf = await briefkopfLaden(supabase, mandantId, mandantName, absender);
    const puffer = await dokumentAlsPdf(dokument, kopf);
    const { error } = await supabase.storage.from(DOKUMENT_BUCKET).upload(pfad, puffer, { contentType: "application/pdf", upsert: true });
    return error ? null : pfad;
  } catch {
    // Ohne erreichbaren Storage bleibt die Rechnung gestellt; das PDF wird dann bei jedem Abruf aus dem eingefrorenen Snapshot gerendert.
    return null;
  }
}

/** Termin als Kalenderdatei (.ics) — fuer Terminbestaetigungen und den Download. */
export async function terminIcsLaden(supabase: SupabaseClient, mandantId: string, id: string, mandantName: string): Promise<{ ics: string; dateiname: string; bezeichnung: string } | null> {
  const { data: t } = await supabase.from("termine").select("id, titel, art, beginnt_am, endet_am, ganztags, ort, notiz, abgesagt_am, geaendert_am, objekt:objekte(objektnummer, bezeichnung, strasse, hausnummer, plz, ort)").eq("id", id).eq("mandant_id", mandantId).maybeSingle();
  if (!t) return null;
  const objekt = t.objekt as unknown as { objektnummer: string; bezeichnung: string; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null } | null;
  const artText = TERMINARTEN[t.art as Terminart] ?? "Termin";
  const ics = icsKalender([{
    id: t.id as string,
    titel: `${t.titel as string} – ${mandantName}`,
    beginnt_am: t.beginnt_am as string,
    endet_am: t.endet_am as string,
    ganztags: Boolean(t.ganztags),
    ort: terminOrtText({ ort: (t.ort as string | null) ?? null }, objekt) || null,
    beschreibung: [artText, objekt ? `${objekt.objektnummer} · ${objekt.bezeichnung}` : null].filter(Boolean).join(" · "),
    abgesagt: Boolean(t.abgesagt_am),
    geaendert_am: (t.geaendert_am as string | null) ?? null,
  }], mandantName);
  return { ics, dateiname: `Termin_${dateinameSicher(t.titel as string, 60)}.ics`, bezeichnung: `Termin „${t.titel as string}“` };
}
