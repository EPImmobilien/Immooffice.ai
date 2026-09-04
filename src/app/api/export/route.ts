import { NextResponse } from "next/server";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungLaden } from "@/lib/auth/sitzung";
import { DOKUMENT_BUCKET } from "@/lib/dokumente";
import { BILD_BUCKET } from "@/lib/bilder";
import type { Ausstattungsmerkmal, OpenImmoObjekt } from "@/lib/openimmo/typen";
import { openImmoXml } from "@/lib/openimmo/xml";
import { zipPacken } from "@/lib/openimmo/zip";
import { serverClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Vollstaendiger Datenexport des Unternehmens (docs/AUTONOMIE.md A3, Masterprompt
 * Abschnitt 16 „Datenexport"): ein ZIP mit OpenImmo-XML aller Objekte, CSV-Tabellen
 * (Objekte, Kontakte, Termine, Aufgaben, Rechnungen, Verträge, Notizen) und auf
 * Wunsch (?dokumente=1) den Dateien aus Objektdokumenten und Bildern — bis zu
 * einer Grenze von 400 MB, damit die Antwort nicht abbricht.
 * Nur Inhaber und Administratoren.
 */

const CSV_TABELLEN: Array<{ tabelle: string; datei: string; felder?: string }> = [
  { tabelle: "objekte", datei: "objekte.csv" },
  { tabelle: "kontakte", datei: "kontakte.csv" },
  { tabelle: "kontakt_objekt", datei: "kontakt_objekt.csv" },
  { tabelle: "termine", datei: "termine.csv" },
  { tabelle: "aufgaben", datei: "aufgaben.csv" },
  { tabelle: "vertraege", datei: "vertraege.csv" },
  { tabelle: "rechnungen", datei: "rechnungen.csv" },
  { tabelle: "rechnungspositionen", datei: "rechnungspositionen.csv" },
  { tabelle: "briefe", datei: "briefe.csv" },
  { tabelle: "aktivitaeten", datei: "aktivitaeten.csv" },
  { tabelle: "objekt_dokumente", datei: "objekt_dokumente.csv" },
  { tabelle: "objekt_bilder", datei: "objekt_bilder.csv" },
  { tabelle: "projekte", datei: "projekte.csv" },
  { tabelle: "projekt_einheiten", datei: "projekt_einheiten.csv" },
  { tabelle: "portal_kunden", datei: "kundenbereich_zugaenge.csv", felder: "id, art, anzeigename, email, telefon, kontakt_id, aktiv, eingeladen_am, angenommen_am, projekt_id, einheit_id, fortschritt_stufe" },
  { tabelle: "urlaubsantraege", datei: "urlaubsantraege.csv" },
  { tabelle: "arbeitszeit_tage", datei: "arbeitszeit_tage.csv" },
];

function csv(zeilen: Array<Record<string, unknown>>): string {
  if (zeilen.length === 0) return "";
  const spalten = Array.from(new Set(zeilen.flatMap((z) => Object.keys(z))));
  const feld = (w: unknown): string => {
    if (w === null || w === undefined) return "";
    const s = typeof w === "object" ? JSON.stringify(w) : String(w);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return ["﻿" + spalten.join(";"), ...zeilen.map((z) => spalten.map((s) => feld(z[s])).join(";"))].join("\r\n");
}

export async function GET(anfrage: Request) {
  const sitzung = await sitzungLaden();
  if (!sitzung) return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  if (sitzung.rolle !== "inhaber" && sitzung.rolle !== "administrator") return NextResponse.json({ fehler: "Nur die Verwaltung exportiert." }, { status: 403 });
  rechtErzwingen(sitzung.rolle, "einstellungen", "lesen", sitzung.uebersteuerung);
  const mitDokumenten = new URL(anfrage.url).searchParams.get("dokumente") === "1";
  const supabase = await serverClient();
  const dateien: Array<{ name: string; daten: Buffer }> = [];
  const jetzt = new Date();
  const stempel = jetzt.toISOString().slice(0, 19).replace(/[:T]/g, "-");

  // CSV je Tabelle (RLS filtert auf den Mandanten)
  for (const t of CSV_TABELLEN) {
    const { data } = await supabase.from(t.tabelle).select(t.felder ?? "*").limit(50000);
    dateien.push({ name: `tabellen/${t.datei}`, daten: Buffer.from(csv((data ?? []) as unknown as Array<Record<string, unknown>>), "utf8") });
  }

  // OpenImmo-XML aller nicht geloeschten Objekte
  const [{ data: objekte }, { data: merkmale }, { data: branding }] = await Promise.all([
    supabase.from("objekte").select("*").is("geloescht_am", null).limit(5000),
    supabase.from("objekt_ausstattung").select("objekt_id, merkmal, wert").limit(100000),
    supabase.from("mandant_branding").select("firmenname, email, telefon").eq("mandant_id", sitzung.mandantId).maybeSingle(),
  ]);
  const xml = openImmoXml({
    objekte: ((objekte ?? []) as OpenImmoObjekt[]).map((o) => ({
      objekt: o,
      ausstattung: ((merkmale ?? []) as Array<{ objekt_id: string; merkmal: string; wert: unknown }>).filter((m) => m.objekt_id === (o as unknown as { id: string }).id) as unknown as Ausstattungsmerkmal[],
      modus: "NEU" as const,
    })),
    anbieter: { firmenname: (branding?.firmenname as string) || sitzung.mandantName, anbieternummer: null, openimmoAnid: null, email: (branding?.email as string | null) ?? null, telefon: (branding?.telefon as string | null) ?? null, ansprechpartner: sitzung.name },
    zeitstempel: jetzt.toISOString().slice(0, 19),
  });
  dateien.push({ name: "openimmo/openimmo-export.xml", daten: Buffer.from(xml, "utf8") });

  // Dateien: Objektdokumente und Bilder, bis zur Grenze
  let bytes = dateien.reduce((s, d) => s + d.daten.length, 0);
  const GRENZE = 400 * 1024 * 1024;
  let uebersprungen = 0;
  if (mitDokumenten) {
    const [{ data: doks }, { data: bilder }] = await Promise.all([
      supabase.from("objekt_dokumente").select("pfad, dateiname, objekt_id").limit(5000),
      supabase.from("objekt_bilder").select("pfad, titel, objekt_id").limit(10000),
    ]);
    const liste = [
      ...((doks ?? []) as Array<{ pfad: string; dateiname: string; objekt_id: string }>).map((d) => ({ bucket: DOKUMENT_BUCKET, pfad: d.pfad, name: `dokumente/${d.objekt_id}/${d.dateiname}` })),
      ...((bilder ?? []) as Array<{ pfad: string; titel: string | null; objekt_id: string }>).map((b) => ({ bucket: BILD_BUCKET, pfad: b.pfad, name: `bilder/${b.objekt_id}/${b.pfad.split("/").pop() ?? "bild"}` })),
    ];
    for (const d of liste) {
      if (bytes > GRENZE) { uebersprungen++; continue; }
      const { data } = await supabase.storage.from(d.bucket).download(d.pfad).catch(() => ({ data: null }));
      if (!data) { uebersprungen++; continue; }
      const buf = Buffer.from(await data.arrayBuffer());
      bytes += buf.length;
      dateien.push({ name: d.name, daten: buf });
    }
  }
  dateien.push({
    name: "LIESMICH.txt",
    daten: Buffer.from(
      `Datenexport ${sitzung.mandantName}\nErstellt: ${jetzt.toLocaleString("de-DE")} von ${sitzung.name}\n\n` +
      `tabellen/   CSV (Semikolon, UTF-8 mit BOM) je Tabelle\nopenimmo/   OpenImmo-XML aller Objekte\n` +
      (mitDokumenten ? `dokumente/, bilder/   Dateien je Objekt${uebersprungen ? ` (${uebersprungen} Dateien wegen der Größengrenze oder Fehlern ausgelassen)` : ""}\n` : "Dateien: mit ?dokumente=1 im Export enthalten\n"),
      "utf8",
    ),
  });
  await supabase.rpc("audit_schreiben", { p_aktion: "datenexport", p_ziel_art: "mandant", p_ziel_id: sitzung.mandantId, p_details: { dateien: dateien.length, bytes, mit_dokumenten: mitDokumenten } }).then(() => null, () => null);
  const archiv = zipPacken(dateien, jetzt);
  return new NextResponse(new Uint8Array(archiv), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="datenexport-${stempel}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
