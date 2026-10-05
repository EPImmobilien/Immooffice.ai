// ============================================================================
// Aus Datenbankzeilen werden Platzhalterwerte
// ----------------------------------------------------------------------------
// Der Renderer kennt die Datenbank nicht. Er bekommt eine flache Zuordnung
// "objekt.wohnflaeche" -> 112, und woher die 112 kommt, ist ihm gleich.
// Diese Datei ist die Uebersetzung dazwischen — und sie steht IM PAKET, weil
// beide Seiten sie brauchen: die Edge Function fuer das PDF und der Editor
// fuer die Vorschau. Zwei Uebersetzungen waeren zwei Exposes.
//
// Die SPALTENWERTE kopiert diese Datei nicht von Hand, sondern aus dem
// Katalog (felder.ts). Der Katalog sagt zu jedem Platzhalter, aus welcher
// Tabelle und Spalte er kommt; hier wird genau das gelesen. Damit kann eine
// neue Spalte nicht im Katalog stehen und hier fehlen.
//
// FEHLENDE WERTE werden nicht ersetzt. Keine 0, kein "-", kein leerer
// String: der Schluessel bleibt weg, und das Element, die Zeile oder die
// Seite entfaellt. CLAUDE.md verlangt das ausdruecklich — "keine erfundenen
// Objektdaten" heisst auch: kein "0 m²" fuer eine Flaeche, die niemand
// erfasst hat.
// ============================================================================

import { KATALOG } from "./felder";
import { rechnen } from "./rechnen";
import type { Annahmen } from "./rechnen";
import { formatiere, zahlDe } from "./werte";
import type { Daten } from "./werte";

/** Die Zeilen, aus denen ein Exposé entsteht. */
export type Quellen = {
  /** Die Zeile aus immobilien. */
  immobilie: Record<string, unknown>;
  /** firma_stammdaten des Standorts, der im Briefkopf steht. */
  firma?: Record<string, unknown> | null;
  /** profiles des zustaendigen Ansprechpartners. */
  ansprechpartner?: Record<string, unknown> | null;
  /** finanzierungs_annahmen des Mandanten. */
  annahmen?: Annahmen | null;
  /**
   * Bilder, die der Vorlage als Slot zur Verfuegung stehen: Schluessel
   * wie "bild.foto.3" -> Kennung des Bildes. Was die Kennung bedeutet,
   * entscheidet der Aufrufer; der Renderer gibt sie unveraendert an
   * zuPdf() weiter, und dort steht sie in der Bildzuordnung.
   */
  bilder?: Record<string, string>;
  /**
   * Welche dieser Bilder mit KI bearbeitet wurden — die Kennungen aus
   * `bilder`. Der Renderer kennzeichnet sie im PDF.
   *
   * Das steht ABSICHTLICH nicht im Feldkatalog: der Katalog sagt, was eine
   * Vorlage benutzen darf, und eine Pflichtkennzeichnung, die der
   * Vorlagenautor ansprechen (und damit umgehen) kann, ist keine.
   */
  ki_bilder?: string[];
  /** Fuer {{datum}}. Hereingegeben, damit der Test nicht von der Uhr abhaengt. */
  heute?: Date;
};

const LEER = (v: unknown): boolean =>
  v == null || (typeof v === "string" && v.trim() === "")
  || (Array.isArray(v) && v.length === 0);

function z(v: unknown): number | undefined {
  if (LEER(v)) return undefined;
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(n) ? n : undefined;
}

const text = (v: unknown): string | undefined =>
  LEER(v) ? undefined : String(v).trim();

function fuegen(teile: (string | undefined)[], trenner: string): string | undefined {
  const da = teile.map((t) => (t ?? "").trim()).filter(Boolean);
  return da.length ? da.join(trenner) : undefined;
}

/** Kauf oder Miete? Leeres Feld gilt als Kauf — so haelt es die Vorlage. */
function istKauf(immo: Record<string, unknown>): boolean {
  const v = String(immo["vertragsart"] ?? "").toLowerCase();
  if (!v) return true;
  return !/miet|vermiet|pacht/.test(v);
}

export function aufbereiten(q: Quellen): Daten {
  const immo = q.immobilie ?? {};
  const firma = q.firma ?? {};
  const ap = q.ansprechpartner ?? {};
  const d: Daten = {};

  // --- 1. Die Spaltenwerte, getrieben vom Katalog ---------------------------
  const zeilen: Record<string, Record<string, unknown>> = {
    immobilien: immo, profiles: ap, firma_stammdaten: firma,
  };
  for (const f of KATALOG) {
    if (!("tabelle" in f.quelle)) continue;
    const zeile = zeilen[f.quelle.tabelle];
    if (!zeile) continue;
    const roh = zeile[f.quelle.spalte];
    if (LEER(roh)) continue;
    d[f.schluessel] = roh;
  }

  // --- 2. Zusammengesetzte Textfelder --------------------------------------
  // Die Adresse nur, wenn sie freigegeben ist. adresse_freigeben=false
  // heisst: der Eigentuemer will die Hausnummer nicht im Expose sehen.
  // Dann entfaellt sie — und zwar hier, nicht erst im Satz, damit sie
  // auch nicht ueber einen anderen Platzhalter hereinkommt.
  const freigabe = immo["adresse_freigeben"];
  const mitAdresse = freigabe === undefined || freigabe === null || freigabe === true;
  if (!mitAdresse) { delete d["objekt.strasse"]; delete d["objekt.hausnummer"]; }
  const adresse = mitAdresse
    ? fuegen([text(immo["strasse"]), text(immo["hausnummer"])], " ")
    : undefined;
  if (adresse) d["objekt.adresse"] = adresse;
  const plzOrt = fuegen([text(immo["plz"]), text(immo["ort"])], " ");
  if (plzOrt) d["objekt.plz_ort"] = plzOrt;

  // Der Titel: entweder in festen Zeilen gepflegt (Studio setzt ihn in
  // 78 Punkt, da bricht nichts von selbst sinnvoll um) oder als eine
  // Zeile. Beides fuellt beide Formen, damit jede Vorlage etwas findet.
  const zeilenTitel = Array.isArray(immo["expose_titel_zeilen"])
    ? (immo["expose_titel_zeilen"] as unknown[]).map((t) => String(t).trim()).filter(Boolean)
    : [];
  const titel = text(immo["objekttitel"]) ?? text(immo["bezeichnung"]);
  if (zeilenTitel.length) {
    d["objekt.expose_titel_text"] = zeilenTitel.join("\n");
    d["objekt.titel_erste_zeile"] = zeilenTitel[0];
    if (zeilenTitel[1]) d["objekt.titel_zweite_zeile"] = zeilenTitel.slice(1).join(" ");
    if (!d["objekt.objekttitel"]) d["objekt.objekttitel"] = zeilenTitel.join(" ");
  } else if (titel) {
    d["objekt.expose_titel_text"] = titel;
    // Zweizeilig setzen, ohne zu raten: getrennt wird an einem Gedankenstrich
    // oder Komma, wenn es eines gibt — sonst steht alles in der ersten Zeile
    // und die zweite entfaellt.
    const m = titel.match(/^(.{6,}?)\s*[–—-]\s*(.+)$/) ?? titel.match(/^(.{6,}?),\s*(.+)$/);
    d["objekt.titel_erste_zeile"] = m ? m[1] : titel;
    if (m) d["objekt.titel_zweite_zeile"] = m[2];
  }

  // Der Untertitel: Zimmer, Flaeche, Lage — was davon da ist.
  const zimmer = z(immo["zimmer"]);
  const wohnflaeche = z(immo["wohnflaeche"]);
  const unter = fuegen([
    zimmer !== undefined ? `${zahlDe(zimmer, zimmer % 1 ? 1 : 0, true)} Zimmer` : undefined,
    wohnflaeche !== undefined ? `${zahlDe(wohnflaeche, 0, true)} m²` : undefined,
    text(immo["ortsteil"]) ?? text(immo["ort"]),
  ], "  ·  ");
  if (unter) d["objekt.untertitel"] = unter;

  // Der Prolog der Luxusvorlage ist KEIN eigenes Feld: er ist der erste
  // Absatz der Objektbeschreibung. Wer dort etwas anderes stehen haben
  // will, ueberschreibt das Element am Objekt (expose_overrides.texte) —
  // ein zweites Beschreibungsfeld zu pflegen waere doppelte Arbeit fuer
  // denselben Text.
  const beschreibung = text(immo["beschreibung_objekt"]);
  if (beschreibung) {
    const prolog = beschreibung.split(/\n\s*\n/)[0].trim();
    if (prolog) {
      d["objekt.expose_prolog"] = prolog;
      d["objekt.expose_prolog_initiale"] = prolog.slice(0, 1);
      d["objekt.expose_prolog_rest"] = prolog.slice(1);
    }
  }

  const stellplatzArt = text(immo["stellplatz_art"]);
  const stellplatzAnzahl = z(immo["stellplatz_anzahl"]);
  if (stellplatzArt || stellplatzAnzahl !== undefined) {
    d["objekt.stellplatz"] = stellplatzArt && stellplatzAnzahl !== undefined
      ? `${zahlDe(stellplatzAnzahl, 0)} × ${stellplatzArt}`
      : (stellplatzArt ?? zahlDe(stellplatzAnzahl!, 0));
  }

  const gueltig = text(immo["energie_gueltig_bis"]);
  if (gueltig) {
    const t = gueltig.split("T")[0].split("-");
    if (t.length === 3) d["objekt.energie_gueltig_kurz"] = `${t[1]}/${t[0]}`;
  }

  // --- 3. Preis und Miete ---------------------------------------------------
  const kauf = istKauf(immo);
  const preisZahl = kauf ? z(immo["angebotspreis"]) : z(immo["kaltmiete"]);
  if (immo["expose_preis_auf_anfrage"] === true) {
    d["objekt.preis"] = "auf Anfrage";
  } else if (preisZahl !== undefined) {
    d["objekt.preis"] = formatiere(preisZahl, "euro", 0);
  }
  const kalt = z(immo["kaltmiete"]);
  if (!kauf && kalt !== undefined) {
    const warm = kalt + (z(immo["nebenkosten"]) ?? 0) + (z(immo["heizkosten"]) ?? 0);
    if (warm > kalt) d["objekt.warmmiete"] = warm;
  }

  // --- 4. Die zusammengesetzten Listen -------------------------------------
  d["objekt.eckdaten"] = eckdaten(immo);
  d["objekt.fakten"] = fakten(immo, d);
  d["objekt.energie_angaben"] = energieAngaben(immo);
  for (const k of ["objekt.eckdaten", "objekt.fakten", "objekt.energie_angaben"]) {
    if (!(d[k] as unknown[]).length) delete d[k];
  }

  // --- 4b. Die Listen aus der Datenbank auf die Namen bringen, die die
  // Elemente lesen ----------------------------------------------------------
  // Diese Spalten gibt es laenger als den Baukasten, und sie tragen die
  // Namen, die die Oberflaeche vor ihm gewaehlt hat: ein Highlight heisst
  // dort {icon, zeile1, zeile2}, eine Entfernung {label, wert}. Umbenennen
  // in der Datenbank waere der falsche Weg — es gibt Objekte mit diesen
  // Daten, und der Export der Vorlage schreibt sie weiter so. Also wird
  // hier uebersetzt, an einer Stelle, mit den alten Namen daneben.
  d["objekt.expose_highlights"] = umbauen(immo["expose_highlights"], (e) => {
    const titel = text(e["titel"]) ?? text(e["zeile1"]);
    if (!titel) return undefined;
    return { titel, text: text(e["text"]) ?? text(e["zeile2"]) };
  });
  d["objekt.lage_distanzen"] = umbauen(immo["lage_distanzen"], (e) => {
    const name = text(e["ziel"]) ?? text(e["name"]) ?? text(e["label"]);
    if (!name) return undefined;
    // km als Zahl, wenn es eine gibt: nur damit kann das Element Balken
    // zeichnen. Aus "1,2 km" wird sie gelesen, aber nicht gerundet.
    const km = z(e["km"]) ?? kmAus(e["wert"]);
    return { ziel: name, km, wert: km === undefined ? text(e["wert"]) : undefined };
  });
  d["objekt.expose_wege"] = umbauen(immo["expose_wege"], (e) => {
    const ziel = text(e["ziel"]) ?? text(e["name"]) ?? text(e["label"]);
    if (!ziel) return undefined;
    return { ziel, fuss: z(e["fuss"]), rad: z(e["rad"]), auto: z(e["auto"]) };
  });
  d["objekt.raumaufteilung"] = umbauen(immo["raumaufteilung"], (e) => {
    const name = text(e["name"]) ?? text(e["raum"]) ?? text(e["bezeichnung"]);
    const flaeche = z(e["flaeche"]) ?? z(e["groesse"]) ?? z(e["qm"]);
    if (!name || flaeche === undefined) return undefined;
    return { name, flaeche, ebene: text(e["ebene"]) ?? text(e["geschoss"]) };
  });
  d["objekt.laufende_kosten"] = umbauen(immo["laufende_kosten"], (e) => {
    const name = text(e["name"]) ?? text(e["label"]) ?? text(e["posten"]);
    const betrag = z(e["betrag"]) ?? z(e["wert"]);
    if (!name || betrag === undefined) return undefined;
    return { name, betrag };
  });
  d["objekt.expose_ausstattung_gruppen"] = umbauen(
    immo["expose_ausstattung_gruppen"], (e) => {
      const titel = text(e["titel"]) ?? text(e["name"]);
      const punkte = Array.isArray(e["punkte"])
        ? (e["punkte"] as unknown[]).map((p) => String(p).trim()).filter(Boolean)
        : [];
      if (!titel || !punkte.length) return undefined;
      return { titel, punkte };
    });
  for (const k of ["objekt.expose_highlights", "objekt.lage_distanzen",
                   "objekt.expose_wege", "objekt.raumaufteilung",
                   "objekt.laufende_kosten", "objekt.expose_ausstattung_gruppen"]) {
    if (!(d[k] as unknown[]).length) delete d[k];
  }

  // --- 5. Firma -------------------------------------------------------------
  const firmaAdresse = fuegen([
    text(firma["strasse"]),
    fuegen([text(firma["plz"]), text(firma["ort"])], " "),
  ], ", ");
  if (firmaAdresse) d["firma.adresse"] = firmaAdresse;
  if (!d["firma.marken_name"] && text(firma["firma_name"])) {
    d["firma.marken_name"] = text(firma["firma_name"]);
  }
  const impressum = fuegen([
    fuegen([text(firma["registergericht"]), text(firma["hrb"])], " "),
    text(firma["ust_id"]) ? "USt-IdNr. " + text(firma["ust_id"]) : undefined,
    text(firma["geschaeftsfuehrer"]),
  ], "  ·  ");
  if (impressum) d["firma.impressum_zeile"] = impressum;

  // --- 6. Rechnung und Bilder ----------------------------------------------
  Object.assign(d, rechnen(immo, q.annahmen));
  for (const [k, v] of Object.entries(q.bilder ?? {})) {
    if (!LEER(v)) d[k] = v;
  }
  // Das Titelbild ist ein Bildslot wie die anderen, trotz seines Namens
  // im Katalog: steht in der Zuordnung eines, schlaegt es die Spalte.
  if (q.bilder && !LEER(q.bilder["objekt.hauptbild_url"])) {
    d["objekt.hauptbild_url"] = q.bilder["objekt.hauptbild_url"];
  }

  // Der QR-Code zeigt auf das Web-Expose, wenn eines hinterlegt ist, sonst
  // auf die Seite des Maklers. Ohne beides entfaellt er — ein QR-Code, der
  // ins Leere fuehrt, ist schlimmer als keiner.
  if (!d["objekt.expose_qr_url"]) {
    const web = text(firma["web"]);
    if (web) d["objekt.expose_qr_url"] = /^https?:\/\//i.test(web) ? web : "https://" + web;
  }

  const ki = (q.ki_bilder ?? []).filter((k) => !LEER(k));
  if (ki.length) d["objekt.ki_bilder"] = ki;

  const heute = q.heute ?? new Date();
  d["datum"] = `${String(heute.getDate()).padStart(2, "0")}.`
    + `${String(heute.getMonth() + 1).padStart(2, "0")}.${heute.getFullYear()}`;
  return d;
}

// ------------------------------------------------------------------ Listen
/**
 * Eine jsonb-Liste Eintrag fuer Eintrag umbauen. Gibt die Abbildung
 * `undefined` zurueck, faellt der Eintrag heraus — ein Raum ohne Flaeche
 * ist keine Zeile mit leerer Flaeche, sondern keine Zeile.
 */
function umbauen<T>(roh: unknown,
                    je: (e: Record<string, unknown>) => T | undefined): T[] {
  if (!Array.isArray(roh)) return [];
  const aus: T[] = [];
  for (const e of roh) {
    if (!e || typeof e !== "object") continue;
    const neu = je(e as Record<string, unknown>);
    if (neu !== undefined) aus.push(neu);
  }
  return aus;
}

/** "1,2 km" -> 1.2, "850 m" -> 0.85. Ohne Einheit: unveraendert. */
function kmAus(v: unknown): number | undefined {
  const s = text(v);
  if (!s) return undefined;
  const m = s.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return undefined;
  return /\bm\b/.test(s) && !/\bkm\b/.test(s) ? n / 1000 : n;
}

// ---------------------------------------------------------------- Eckdaten
/**
 * Die grossen Zahlen, als Wert, Einheit und Label.
 *
 * Die Reihenfolge ist fest und nicht nach Wichtigkeit sortierbar: die
 * Vorlage setzt sie in ein Gitter mit drei Spalten, und ein Objekt ohne
 * Grundstueck soll dieselbe Zeile fuellen wie eines mit. Darum fallen
 * fehlende Werte heraus und die uebrigen ruecken auf.
 */
function eckdaten(immo: Record<string, unknown>): { label: string; wert: unknown; einheit?: string }[] {
  const aus: { label: string; wert: unknown; einheit?: string }[] = [];
  const nimm = (label: string, roh: unknown, einheit?: string, stellen = 0) => {
    const n = z(roh);
    if (n === undefined) return;
    aus.push({ label, wert: zahlDe(n, n % 1 ? Math.max(stellen, 1) : stellen, true), einheit });
  };
  nimm("Wohnfläche", immo["wohnflaeche"], "m²");
  nimm("Grundstück", immo["grundstueck"], "m²");
  nimm("Zimmer", immo["zimmer"]);
  nimm("Schlafzimmer", immo["schlafzimmer"]);
  nimm("Bäder", immo["badezimmer"]);
  nimm("Baujahr", immo["baujahr"]);
  nimm("Nutzfläche", immo["nutzflaeche"], "m²");
  nimm("Etagen", immo["etagen_gesamt"]);
  return aus.slice(0, 6);
}

// ------------------------------------------------------------------ Fakten
/**
 * Die Angabenliste: Label und fertig formatierter Wert.
 *
 * Fertig formatiert, weil die Vorlage daraus eine Tabelle mit rechts
 * stehenden Werten setzt und dabei nicht wissen muss, ob dort eine
 * Flaeche, ein Jahr oder ein Text steht.
 */
function fakten(immo: Record<string, unknown>, d: Daten): { label: string; wert: string }[] {
  const aus: { label: string; wert: string }[] = [];
  // Die Nachkommastelle richtet sich nach dem Wert, nicht nach dem Feld:
  // "112,5 m²" soll so dastehen, "112 m²" ohne ",0". Eine feste Zahl von
  // Stellen macht aus einer der beiden Angaben eine falsche.
  const nimm = (label: string, roh: unknown, typ: "text" | "flaeche" | "zahl" | "jahr" | "euro" | "ja_nein") => {
    const n = z(roh);
    const stellen = n !== undefined && n % 1 ? 1 : 0;
    const v = formatiere(roh, typ, stellen);
    if (v === undefined) return;
    aus.push({ label, wert: v });
  };
  nimm("Objektart", immo["objektart"], "text");
  nimm("Wohnfläche", immo["wohnflaeche"], "flaeche");
  nimm("Nutzfläche", immo["nutzflaeche"], "flaeche");
  nimm("Grundstück", immo["grundstueck"], "flaeche");
  nimm("Zimmer", immo["zimmer"], "zahl");
  nimm("Schlafzimmer", immo["schlafzimmer"], "zahl");
  nimm("Badezimmer", immo["badezimmer"], "zahl");
  nimm("Etage", immo["etage"], "text");
  nimm("Etagen", immo["etagen_gesamt"], "zahl");
  nimm("Baujahr", immo["baujahr"], "jahr");
  nimm("Modernisierung", immo["modernisierung_jahr"], "jahr");
  nimm("Zustand", immo["zustand"], "text");
  nimm("Keller", immo["unterkellert"], "ja_nein");
  if (d["objekt.stellplatz"]) aus.push({ label: "Stellplätze", wert: String(d["objekt.stellplatz"]) });
  nimm("Heizung", immo["heizungsart"], "text");
  nimm("Energieträger", immo["energie_traeger"], "text");
  nimm("Verfügbar ab", immo["verfuegbar_ab"], "text");
  nimm("Hausgeld", immo["hausgeld"], "euro");
  return aus;
}

// ------------------------------------------------------------------ Energie
function energieAngaben(immo: Record<string, unknown>): { label: string; wert: string }[] {
  const aus: { label: string; wert: string }[] = [];
  const nimm = (label: string, roh: unknown, typ: "text" | "jahr" | "ja_nein") => {
    const v = formatiere(roh, typ);
    if (v === undefined) return;
    aus.push({ label, wert: v });
  };
  nimm("Ausweisart", immo["energieausweis_typ"], "text");
  const kennwert = z(immo["energie_kennwert"]);
  if (kennwert !== undefined) {
    aus.push({ label: "Energiekennwert", wert: `${zahlDe(kennwert, 1, true)} kWh/(m²a)` });
  }
  nimm("Effizienzklasse", immo["energie_klasse"], "text");
  nimm("Wesentl. Energieträger", immo["energie_traeger"], "text");
  nimm("Heizungsart", immo["heizungsart"], "text");
  nimm("Baujahr Heizung", immo["energie_baujahr_anlage"], "jahr");
  nimm("Warmwasser enthalten", immo["energie_warmwasser"], "ja_nein");
  const gueltig = text(immo["energie_gueltig_bis"]);
  if (gueltig) {
    const t = gueltig.split("T")[0].split("-");
    if (t.length === 3) aus.push({ label: "Gültig bis", wert: `${t[2]}.${t[1]}.${t[0]}` });
  }
  return aus;
}
