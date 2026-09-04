import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";

import { wertindikation } from "@/lib/akquise/preisfinder";
import type { LeadZeile } from "@/lib/akquise/stammdaten";
import { akquiseEinstellungenLaden, vergleichswerteLaden } from "@/lib/akquise/vergleichswerte";
import { wertindikationAlsDokument } from "@/lib/akquise/wertindikation-dokument";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungLaden } from "@/lib/auth/sitzung";
import { briefDokumentLaden, briefkopfLaden, rechnungDokumentLaden, terminIcsLaden } from "@/lib/dokument/erzeugen";
import { DokumentPdf } from "@/lib/dokument/pdf";
import { textZuDokument, type Briefkopf, type Dokument } from "@/lib/dokument/struktur";
import { dokumentAlsWord } from "@/lib/dokument/word";
import { DOKUMENT_BUCKET } from "@/lib/dokumente";
import type { Absender } from "@/lib/rechnungen";
import { serverClient } from "@/lib/supabase/server";
import { laufzettelAlsDokument, laufzettelAusDaten, type Anhang } from "@/lib/verkauf/laufzettel";
import { protokollAlsDokument, protokollAusZeile, protokollTitel } from "@/lib/verkauf/uebergabe";
import { mietvertragAusZeile, mietvertragText, mietvertragTitel } from "@/lib/vermietung/mietvertrag";
import { MUSTER_HINWEIS, VERTRAGSARTEN, type Vertragsart } from "@/lib/vertraege";
import { blattLesen } from "@/lib/werkzeuge/wohnflaeche";
import { wohnflaecheAlsDokument } from "@/lib/werkzeuge/wohnflaeche-dokument";

export const runtime = "nodejs";

/**
 * PDF- und Word-Ausgabe von Vertraegen, Uebergabeprotokollen und Laufzetteln.
 * Kostet keine Credits (Export bestehender Inhalte, Abschnitt 14).
 *
 *   /api/dokumente/vertrag/<id>?format=pdf|docx&vollmacht=1
 *   /api/dokumente/uebergabe/<id>?format=pdf|docx
 *   /api/dokumente/laufzettel/<id>?format=pdf|docx
 *   /api/dokumente/rechnung/<id>           — gestellte Rechnungen: die festgeschriebene Datei
 *   /api/dokumente/brief/<id>?format=pdf|docx
 */
export async function GET(anfrage: Request, { params }: { params: Promise<{ art: string; id: string }> }) {
  const { art, id } = await params;
  const sitzung = await sitzungLaden();
  if (!sitzung) return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  rechtErzwingen(sitzung.rolle, art === "wertindikation" ? "akquise" : art === "rechnung" || art === "brief" ? "rechnungen" : art === "termin" ? "kalender" : art === "wohnflaeche" ? "objekte" : "vertraege", "lesen", sitzung.uebersteuerung);
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });

  const url = new URL(anfrage.url);
  const format = url.searchParams.get("format") === "docx" ? "docx" : "pdf";
  const supabase = await serverClient();

  if (art === "termin") {
    const t = await terminIcsLaden(supabase, sitzung.mandantId, id, sitzung.mandantName);
    if (!t) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
    return new NextResponse(t.ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${t.dateiname}"`, "Cache-Control": "no-store" } });
  }

  let absender: Partial<Absender> | null = null;
  let dokument: Dokument | null = null;
  let dateiname = "dokument";
  let festgeschrieben: string | null = null;

  if (art === "vertrag") {
    const { data: v } = await supabase.from("vertraege").select("*").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
    if (!v) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
    const unterschriften = (Array.isArray(v.unterzeichnungen) ? v.unterzeichnungen : []) as { name: string; unterzeichnet_am: string }[];
    dokument = textZuDokument(v.titel as string, v.inhalt as string, `${VERTRAGSARTEN[v.art as Vertragsart]} · ${MUSTER_HINWEIS}`);
    if (unterschriften.length > 0) {
      dokument.abschnitte.push({ ueberschrift: "Elektronisch unterzeichnet", absaetze: unterschriften.map((u) => `${u.name} — ${new Date(u.unterzeichnet_am).toLocaleString("de-DE")} (einfache elektronische Signatur)`) });
    }
    // Vollmacht als Anlage im selben Dokument
    if (url.searchParams.get("vollmacht") === "1") {
      const { data: vm } = await supabase.from("vertraege").select("titel, inhalt").eq("mandant_id", sitzung.mandantId).eq("art", "vollmacht").contains("daten", { zu_vertrag_id: id }).maybeSingle();
      if (vm) {
        const anlage = textZuDokument(vm.titel as string, vm.inhalt as string);
        dokument.abschnitte.push({ ueberschrift: "Anlage — Vollmacht", neueSeite: true, absaetze: [] }, ...anlage.abschnitte);
      }
    }
    dateiname = (v.titel as string).replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_").slice(0, 80);
  } else if (art === "uebergabe") {
    const { data: u } = await supabase.from("uebergabeprotokolle").select("*").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
    if (!u) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
    const p = protokollAusZeile(u as Record<string, unknown>);
    dokument = protokollAlsDokument(p);
    if (u.status !== "abgeschlossen") dokument.fussnote = "ENTWURF — noch nicht abgeschlossen";
    dateiname = protokollTitel(p).replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_").slice(0, 80);
  } else if (art === "laufzettel") {
    const { data: l } = await supabase.from("notar_laufzettel").select("*").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
    if (!l) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
    dokument = laufzettelAlsDokument(laufzettelAusDaten(l.daten), (Array.isArray(l.anhaenge) ? l.anhaenge : []) as Anhang[]);
    dateiname = `Notar-Laufzettel_${(l.bezeichnung as string).replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_").slice(0, 60)}`;
  } else if (art === "mietvertrag") {
    const { data: m } = await supabase.from("mietvertraege").select("*").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
    if (!m) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
    const d = mietvertragAusZeile(m as Record<string, unknown>);
    dokument = textZuDokument(mietvertragTitel(d), mietvertragText(d), m.status === "entwurf" ? "ENTWURF" : MUSTER_HINWEIS);
    dateiname = mietvertragTitel(d).replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_").slice(0, 80);
  } else if (art === "wertindikation") {
    const { data: l } = await supabase.from("akquise_leads").select("*, kontakt:kontakte!akquise_leads_kontakt_id_fkey(anrede, vorname, nachname, firma)").eq("id", id).maybeSingle();
    if (!l) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
    const lead = l as unknown as LeadZeile & { kontakt: { anrede: string | null; vorname: string | null; nachname: string | null; firma: string | null } | null };
    const [einst, bestand] = await Promise.all([akquiseEinstellungenLaden(supabase), vergleichswerteLaden(supabase)]);
    const k = lead.kontakt;
    const eigentuemer = k ? [k.anrede, k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma : null;
    const zahl = (w: unknown) => (w === null || w === undefined ? null : Number(w));
    const leadZeile: LeadZeile = { ...lead, wohnflaeche: zahl(lead.wohnflaeche), grundstueck: zahl(lead.grundstueck), wert_indikation: zahl(lead.wert_indikation), angebotspreis: zahl(lead.angebotspreis) };
    dokument = wertindikationAlsDokument(leadZeile, wertindikation(leadZeile, bestand), einst, eigentuemer, new Date().toISOString().slice(0, 10));
    dateiname = `Wertindikation_${lead.titel.replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_").slice(0, 60)}`;
  } else if (art === "rechnung") {
    const g = await rechnungDokumentLaden(supabase, sitzung.mandantId, id);
    if (!g) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
    dokument = g.dokument; dateiname = g.dateiname; absender = g.absender; festgeschrieben = g.rechnung.pdf_pfad;
  } else if (art === "wohnflaeche") {
    const { data: b } = await supabase.from("wohnflaechen_berechnungen").select("blatt, bezeichnung, erstellt_am").eq("id", id).eq("mandant_id", sitzung.mandantId).maybeSingle();
    if (!b) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
    dokument = wohnflaecheAlsDokument(blattLesen(b.blatt), new Date().toLocaleDateString("de-DE"), sitzung.name);
    dateiname = `Wohnflaeche_${(b.bezeichnung as string).replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_").slice(0, 60)}`;
  } else if (art === "brief") {
    const g = await briefDokumentLaden(supabase, sitzung.mandantId, id);
    if (!g) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
    dokument = g.dokument; dateiname = g.dateiname; absender = g.absender; festgeschrieben = g.brief.pdf_pfad;
  } else {
    return NextResponse.json({ fehler: "Unbekannte Dokumentart." }, { status: 404 });
  }

  // GoBD: Eine gestellte Rechnung wird nie neu gerendert, sondern aus dem Storage geliefert.
  if (festgeschrieben && format === "pdf") {
    const { data } = await supabase.storage.from(DOKUMENT_BUCKET).download(festgeschrieben).catch(() => ({ data: null }));
    if (data) {
      return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${dateiname}.pdf"`, "Cache-Control": "no-store" },
      });
    }
  }
  const kopf: Briefkopf = await briefkopfLaden(supabase, sitzung.mandantId, sitzung.mandantName, absender);

  if (format === "docx") {
    const puffer = await dokumentAlsWord(dokument, kopf);
    return new NextResponse(new Uint8Array(puffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${dateiname}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const puffer = await renderToBuffer(<DokumentPdf dokument={dokument} kopf={kopf} />);
  return new NextResponse(new Uint8Array(puffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${dateiname}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
