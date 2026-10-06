// ============================================================================
// signatur-vorgang-starten (v22)
//   NEU v22 (Provisionsmodell Maklervertrag):
//     - vertrag.provisionsmodell: 'teilung' (Standard, wie bisher, § 656c) |
//       'verkaeufer' (nur Verkaeuferprovision, Kaeufer provisionsfrei) |
//       'kaeufer' (nur Kaeuferprovision, Verkaeufer provisionsfrei; das Feld
//       provision meint dann die Kaeuferprovision). Wirkt auf § 4a.
//   (v21: verkaeufer_typ mehrere + firma; v20: Objektnachweis-Unterschriften;
//    v19: Word-Layout; v18: Kaeufer + Verkaeufer; v17: reservierung)
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Mandantengrenze fuer Kennungen aus dem Anfragekoerper -----------------
// Diese Funktion prueft das JWT, arbeitet danach aber mit dem service_role —
// und fuer den gilt RLS nicht. Eine Kennung, die der Aufrufer mitschickt, ist
// damit ungeprueft: sie kann auf einen Satz eines anderen Mandanten zeigen.
//
// public.mandant_sichern() aus fork_14 zieht genau diese Grenze. Sie muss
// aber MIT DEM TOKEN DES AUFRUFERS gerufen werden — unter dem service_role
// laesst sie jeden durch (mandant_grenze_gilt() ist dort false, mit Absicht:
// Cron und Wartung haben keinen Mandanten). Deshalb ein zweiter Client, der
// nur den mitgebrachten Kopf weiterreicht.
//
// Ohne Anmeldekopf oder mit dem Dienstschluessel passiert nichts — das sind
// die internen Wege, und die sind nicht die Grenze, die hier gezogen wird.
async function immoMandantSichern(req: Request, paare: Array<[string, unknown]>): Promise<void> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return;
  const zuPruefen = paare.filter(([, id]) =>
    typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if (!zuPruefen.length) return;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  for (const [tabelle, id] of zuPruefen) {
    const { error } = await nutzer.rpc("mandant_sichern", { p_tabelle: tabelle, p_id: id });
    if (error) throw new Error("Kein Zugriff auf Daten eines anderen Mandanten.");
  }
}

// Wessen Mandant ist der Aufrufer? Fuer die Faelle, in denen nicht eine
// Kennung, sondern ein PFAD aus dem Anfragekoerper kommt — das erste
// Pfadsegment im Dateispeicher ist seit fork_09 die Mandantenkennung.
async function immoMandantDesAufrufers(req: Request): Promise<string | null> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return null;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  const { data: u } = await nutzer.auth.getUser(kopf.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return null;
  const { data: prof } = await nutzer.from("profiles").select("mandant_id").eq("id", u.user.id).maybeSingle();
  return prof?.mandant_id ? String(prof.mandant_id) : null;
}
import { PDFDocument, rgb, PageSizes, StandardFonts } from "npm:pdf-lib@1.17.1";

// Pflichtangabe. Fehlt sie, geht NICHTS hinaus: ein Rueckfall auf
// eine Adresse, die niemandem gehoert, sieht aus wie Betrieb, kommt
// aber nirgends an. Begruendung in docs/OFFEN.md.
function immoFehlt(was: string): never {
  throw new Error(was + " fehlt (siehe docs/SECRETS.md). Ohne diese " +
    "Angabe ginge eine Nachricht mit einer Adresse hinaus, die " +
    "niemandem gehoert \u2014 deshalb geht gar keine.");
}


let fontkitPromise: Promise<any> | null = null;
function ladeFontkit(): Promise<any> {
  if (!fontkitPromise) {
    fontkitPromise = import("npm:@pdf-lib/fontkit@1.1.1")
      .then((mod) => mod.default || mod)
      .catch((e) => {
        console.warn("fontkit konnte nicht geladen werden, falle auf StandardFonts zurueck:", e);
        return null;
      });
  }
  return fontkitPromise;
}

// --- Credits (fork_59) ---------------------------------------------------
// Die Abrechnung liegt als Beilage im Ordner dieser Funktion; die Quelle
// steht in supabase/eigene-beilagen/_credits/credits.ts. Sie reserviert
// VOR dem Vorgang und gibt bei einem Fehler von selbst zurueck.
import { kiAbrechnen, abgelehnt } from "./credits.ts";
import type { Abrechnung } from "./credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FONT_MONTSERRAT_REGULAR = "fonts/Montserrat-Regular.ttf";
const FONT_MONTSERRAT_BOLD    = "fonts/Montserrat-Bold.ttf";
const FONT_MARCELLUS          = "fonts/Marcellus-Regular.ttf";
const FONT_SCHREIBSCHRIFT     = "fonts/GreatVibes-Regular.ttf";
const LOGO_PFAD               = "logo.png";
const MAKLER_SIGNATUR_PFADE   = ["unterschrift.png"];

const CI = {
  // Hier standen bis zum 28.09.2026 die beiden Markenfarben der
  // Referenz, in Fliesskomma-Schreibweise. So hat das Neutralitaets-
  // Gate sie lange nicht gefunden; seit dem 06.10.2026 sucht es auch
  // diese Schreibweise (scripts/farben.py).
  blau: rgb(0.106, 0.165, 0.278),  // #1B2A47, Plattform-CI aus CLAUDE.md
  gold: rgb(0.710, 0.576, 0.310),  // #B5934F, dito
  text: rgb(0.08, 0.08, 0.08),
  mittelGrau: rgb(0.55, 0.55, 0.55),
  dunkelGrau: rgb(0.32, 0.32, 0.32),
  hellGrau: rgb(0.96, 0.96, 0.94),
};

const PORTAL_URL = Deno.env.get("PORTAL_URL") || immoFehlt("PORTAL_URL");
const GUELTIGKEIT_TAGE = 14;

function sanitizeGlyphs(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/\u2022/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, "\"")
    .replace(/[\u2013\u2014]/g, "-");
}

function asciiFallback(s: string): string {
  return s.replace(/[^\x20-\x7E\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df\u20ac\u00a7]/g, "");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function objektAdresseVon(vertrag: any): string {
  if (vertrag.objekt_adresse) return vertrag.objekt_adresse;
  const plzOrt = `${vertrag.objekt_plz || ""} ${vertrag.objekt_ort || ""}`.trim();
  return [vertrag.objekt_strasse, plzOrt].filter(Boolean).join(", ");
}

// Wie in vertrag-pdf: der Briefkopf kommt aus firma_stammdaten des
// Mandanten, und vertreter ist der wirkliche Geschaeftsfuehrer statt eines
// erfundenen Namens. Hier wiegt es doppelt: diese Funktion startet den
// SIGNATURVORGANG — was hier steht, unterschreibt der Kunde.
type ImmoStandort = { name: string; firma: string; strasse: string; plzOrt: string; stadt: string; vertreter: string; email: string; datenschutz: string };
const STANDORT_LEER: ImmoStandort = { name: "", firma: "", strasse: "", plzOrt: "", stadt: "", vertreter: "", email: "", datenschutz: "" };
async function immoStandort(db: any, mandant: unknown, slug: unknown): Promise<ImmoStandort> {
  if (typeof mandant !== "string" || !mandant) return STANDORT_LEER;
  let frage = db.from("firma_stammdaten")
    .select("firma_name, marken_name, strasse, plz, ort, email, geschaeftsfuehrer, slug, url_datenschutz")
    .eq("mandant_id", mandant).eq("aktiv", true);
  if (typeof slug === "string" && slug && slug !== "standard") frage = frage.eq("slug", slug);
  const { data } = await frage.order("sortierung", { ascending: true }).limit(1).maybeSingle();
  if (!data) return STANDORT_LEER;
  return {
    name: String(data.marken_name || data.firma_name || "").trim(),
    firma: String(data.firma_name || "").trim(),
    strasse: String(data.strasse || "").trim(),
    plzOrt: `${data.plz || ""} ${data.ort || ""}`.trim(),
    stadt: String(data.ort || "").trim(),
    vertreter: String(data.geschaeftsfuehrer || "").trim(),
    email: String(data.email || "").trim(),
    datenschutz: String(data.url_datenschutz || "").trim(),
  };
}
const STANDORTE: Record<string, ImmoStandort> = {
  standard: STANDORT_LEER,
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function formatMoneyDE(v: string | number): string {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[.\s\u20ac]/g, "").replace(",", "."));
  if (isNaN(n)) return String(v);
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " \u20ac";
}

function eurOhneSym(v: string | number): string {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[.\s\u20ac]/g, "").replace(",", "."));
  if (isNaN(n)) return String(v);
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " \u20ac";
}

function formatGermanDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${dt.getFullYear()}`;
}

function verkaeuferZeilen(vertrag: any): { titel: string; zeilen: string[] } {
  // 'erben' und 'mehrere' teilen sich die Personenliste in vertrag.erben.
  if ((vertrag.verkaeufer_typ === "erben" || vertrag.verkaeufer_typ === "mehrere") && Array.isArray(vertrag.erben) && vertrag.erben.length > 0) {
    const zeilen: string[] = [];
    vertrag.erben.forEach((e: any, idx: number) => {
      if (idx > 0) zeilen.push("");
      zeilen.push(e.name || "");
      if (e.strasse) zeilen.push(e.strasse);
      const plzOrt = `${e.plz || ""} ${e.ort || ""}`.trim();
      if (plzOrt) zeilen.push(plzOrt);
    });
    return { titel: vertrag.verkaeufer_typ === "erben" ? "Erbengemeinschaft - bestehend aus:" : "", zeilen };
  }
  // Firma als Verkaeuferin
  if (vertrag.verkaeufer_typ === "firma") {
    const zeilen: string[] = [];
    if (vertrag.verkaeufer_name) zeilen.push(vertrag.verkaeufer_name);
    if (vertrag.verkaeufer_vertreter) zeilen.push(`vertreten durch ${vertrag.verkaeufer_vertreter}`);
    if (vertrag.verkaeufer_register) zeilen.push(vertrag.verkaeufer_register);
    if (vertrag.verkaeufer_strasse) zeilen.push(vertrag.verkaeufer_strasse);
    const plzOrtF = `${vertrag.verkaeufer_plz || ""} ${vertrag.verkaeufer_ort || ""}`.trim();
    if (plzOrtF) zeilen.push(plzOrtF);
    return { titel: "", zeilen };
  }
  const prefix = vertrag.verkaeufer_typ === "eheleute" ? "Eheleute" :
                 vertrag.verkaeufer_typ === "herr" ? "Herr" :
                 vertrag.verkaeufer_typ === "frau" ? "Frau" : "";
  const zeilen: string[] = [];
  if (vertrag.verkaeufer_name) zeilen.push(vertrag.verkaeufer_name);
  if (vertrag.verkaeufer_strasse) zeilen.push(vertrag.verkaeufer_strasse);
  const plzOrt = `${vertrag.verkaeufer_plz || ""} ${vertrag.verkaeufer_ort || ""}`.trim();
  if (plzOrt) zeilen.push(plzOrt);
  return { titel: prefix, zeilen };
}

type Absatz = { text: string; bold?: boolean; heading?: boolean; size?: number; spaceAfter?: number; indent?: number; pageBreakBefore?: boolean };

// Statische AGB \u2014 identisch fuer Maklervertrag und Objektnachweis.
function buildAgbAbsaetze(standort: ImmoStandort, mitSalvatorischerKlausel: boolean): Absatz[] {
  const a: Absatz[] = [];
  a.push({ text: "Allgemeine Gesch\u00e4ftsbedingungen", heading: true, size: 16 });
  a.push({ text: "1. Geltungsbereich", bold: true });
  a.push({ text: `Mit der Inanspruchnahme von Leistungen der ${standort.name}, ${standort.firma} (nachfolgend \u201eMakler\") erkennt der Empf\u00e4nger eines Angebots (nachfolgend \u201eKunde\") die nachfolgenden Allgemeinen Gesch\u00e4ftsbedingungen an.` });
  a.push({ text: "Die Inanspruchnahme von Leistungen liegt insbesondere vor, wenn der Kunde mit dem Makler wegen eines angebotenen Objekts Kontakt aufnimmt, Informationen oder Unterlagen (z. B. Expos\u00e9) anfordert oder Besichtigungen vereinbart." });
  a.push({ text: "Unsere Angebote sind freibleibend und unverbindlich. Ein Zwischenverkauf bleibt vorbehalten." });
  a.push({ text: "2. Objektinformationen und Angebote", bold: true });
  a.push({ text: "Die in unseren Angeboten, Expos\u00e9s oder sonstigen Unterlagen enthaltenen Objektangaben beruhen auf Informationen, die uns vom Verk\u00e4ufer, Eigent\u00fcmer oder von Dritten zur Verf\u00fcgung gestellt wurden." });
  a.push({ text: "Eine Gew\u00e4hr f\u00fcr die Richtigkeit, Vollst\u00e4ndigkeit und Aktualit\u00e4t dieser Angaben wird nicht \u00fcbernommen. Der Makler ist nicht verpflichtet, die Angaben eigenst\u00e4ndig zu \u00fcberpr\u00fcfen." });
  a.push({ text: "Angaben zur Lage oder m\u00f6glichen Wertentwicklung beruhen gegebenenfalls auf \u00f6ffentlich zug\u00e4nglichen Quellen oder Markteinsch\u00e4tzungen und stellen keine Garantie f\u00fcr tats\u00e4chliche Entwicklungen dar." });
  a.push({ text: "Beh\u00f6rdliche Auflagen k\u00f6nnen Einfluss auf Planung, Nutzungsm\u00f6glichkeiten oder Fl\u00e4chenangaben haben." });
  a.push({ text: "Darstellungen von Geb\u00e4uden, Visualisierungen oder M\u00f6blierungen k\u00f6nnen beispielhaften Charakter haben und dienen ausschlie\u00dflich der Veranschaulichung." });
  a.push({ text: "\u00c4nderungen, Irrt\u00fcmer und Zwischenverkauf bleiben vorbehalten." });
  a.push({ text: "3. Kommunikationswege", bold: true });
  a.push({ text: "Der Kunde willigt ein, dass der Makler ihn im Zusammenhang mit der Bearbeitung seiner Anfrage und der Vermittlung von Immobilien telefonisch, per E-Mail oder auf vergleichbaren Kommunikationswegen kontaktieren darf." });
  a.push({ text: "Eine Nutzung der Kontaktdaten zu anderen Zwecken erfolgt nur im Rahmen der gesetzlichen Bestimmungen oder mit gesonderter Einwilligung des Kunden." });
  a.push({ text: "Die Einwilligung kann jederzeit mit Wirkung f\u00fcr die Zukunft widerrufen werden." });
  a.push({ text: "4. Haftung f\u00fcr die Bonit\u00e4t von Vertragsparteien", bold: true });
  a.push({ text: "Der Makler \u00fcbernimmt keine Haftung f\u00fcr die Bonit\u00e4t der vermittelten Vertragsparteien." });
  a.push({ text: "5. Provision", bold: true });
  a.push({ text: "Mit Abschluss eines notariellen Kaufvertrages \u00fcber das nachgewiesene oder vermittelte Objekt entsteht ein Provisionsanspruch des Maklers." });
  a.push({ text: "Sofern im Angebot oder Expos\u00e9 nichts Abweichendes angegeben ist, betr\u00e4gt die K\u00e4uferprovision 3,57 % des notariell beurkundeten Kaufpreises einschlie\u00dflich gesetzlicher Mehrwertsteuer." });
  a.push({ text: "Der Makler ist berechtigt, sowohl f\u00fcr den Verk\u00e4ufer als auch f\u00fcr den K\u00e4ufer entgeltlich t\u00e4tig zu werden, soweit dies gesetzlich zul\u00e4ssig ist." });
  a.push({ text: "6. Wirtschaftlich gleichwertige Gesch\u00e4fte", bold: true });
  a.push({ text: "Der Provisionsanspruch entsteht auch, wenn anstelle eines Kaufvertrages ein wirtschaftlich gleichwertiges Gesch\u00e4ft zustande kommt, das im Zusammenhang mit dem vom Makler nachgewiesenen oder vermittelten Objekt steht, insbesondere: Erwerb im Wege der Zwangsversteigerung, Erwerb von Gesellschaftsanteilen an einer objektbesitzenden Gesellschaft, sonstige wirtschaftlich vergleichbare Erwerbsvorg\u00e4nge." });
  a.push({ text: "7. Vorkenntnis", bold: true });
  a.push({ text: "Ist dem Kunden das vom Makler nachgewiesene Objekt bereits bekannt, hat er dies dem Makler unverz\u00fcglich, sp\u00e4testens innerhalb von f\u00fcnf Kalendertagen nach Zugang des Objektnachweises, unter Angabe der Quelle schriftlich oder in Textform mitzuteilen." });
  a.push({ text: "Unterbleibt ein entsprechender Hinweis, kann sich der Kunde auf eine Vorkenntnis nicht berufen." });
  a.push({ text: "8. Weitergabe von Informationen", bold: true });
  a.push({ text: "Die vom Makler \u00fcbermittelten Informationen, Unterlagen und Objektangaben sind ausschlie\u00dflich f\u00fcr den Kunden bestimmt. Eine Weitergabe an Dritte ist nur mit vorheriger Zustimmung des Maklers zul\u00e4ssig." });
  a.push({ text: "Gibt der Kunde die Informationen unberechtigt an Dritte weiter und kommt aufgrund dieser Weitergabe ein Kaufvertrag \u00fcber das Objekt zustande, ist der Kunde verpflichtet, dem Makler den hierdurch entstehenden Provisionsschaden zu ersetzen." });
  a.push({ text: "9. Datenschutz", bold: true });
  a.push({ text: "Die Erhebung, Speicherung und Verarbeitung personenbezogener Daten erfolgt im Rahmen der gesetzlichen Datenschutzbestimmungen." });
  if (standort.datenschutz) a.push({ text: `Weitere Informationen zur Datenverarbeitung sind in den Datenschutzhinweisen des Maklers abrufbar unter: ${standort.datenschutz}` });
  a.push({ text: "10. Haftungsbeschr\u00e4nkung", bold: true });
  a.push({ text: "Der Makler haftet f\u00fcr Sch\u00e4den des Kunden nur bei Vorsatz oder grober Fahrl\u00e4ssigkeit." });
  a.push({ text: "Bei einfacher Fahrl\u00e4ssigkeit haftet der Makler nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) und beschr\u00e4nkt auf den vertragstypischen, vorhersehbaren Schaden." });
  a.push({ text: "Die Haftungsbeschr\u00e4nkung gilt nicht bei Sch\u00e4den aus der Verletzung des Lebens, des K\u00f6rpers oder der Gesundheit sowie bei Anspr\u00fcchen nach dem Produkthaftungsgesetz." });
  a.push({ text: "11. Verj\u00e4hrung", bold: true });
  a.push({ text: "Schadensersatzanspr\u00fcche des Kunden gegen den Makler verj\u00e4hren innerhalb der gesetzlichen Verj\u00e4hrungsfristen." });
  a.push({ text: "12. Gerichtsstand und anwendbares Recht", bold: true });
  a.push({ text: "Es gilt das Recht der Bundesrepublik Deutschland." });
  a.push({ text: "Ist der Kunde Kaufmann, eine juristische Person des \u00f6ffentlichen Rechts oder ein \u00f6ffentlich-rechtliches Sonderverm\u00f6gen, ist Gerichtsstand f\u00fcr alle Streitigkeiten aus dem Vertragsverh\u00e4ltnis der Sitz des Maklers." });
  if (mitSalvatorischerKlausel) {
    a.push({ text: "13. Salvatorische Klausel", bold: true });
    a.push({ text: "Sollten einzelne Bestimmungen dieser Allgemeinen Gesch\u00e4ftsbedingungen ganz oder teilweise unwirksam oder undurchf\u00fchrbar sein oder werden, bleibt die Wirksamkeit der \u00fcbrigen Bestimmungen hiervon unber\u00fchrt." });
    a.push({ text: "Anstelle der unwirksamen Bestimmung gelten die gesetzlichen Vorschriften." });
  }
  return a;
}

function buildMaklervertragAbsaetze(vertrag: any, standort: ImmoStandort): Absatz[] {
  const { titel: verkTitel, zeilen: verkZeilen } = verkaeuferZeilen(vertrag);
  const preis = vertrag.angebotspreis ? formatMoneyDE(vertrag.angebotspreis) : "____________________________";
  const laufzeit = vertrag.laufzeit_monate || "6";
  const provision = vertrag.provision || "3,57";
  const provisionsmodell = vertrag.provisionsmodell || "teilung";
  const vermittlungText = vertrag.vertragsart === "vermietung"
    ? "Der Verk\u00e4ufer beauftragt den Immobilienmakler mit der Vermittlung der Vermietung der Immobilie:"
    : "Der Verk\u00e4ufer beauftragt den Immobilienmakler mit der Vermittlung der Immobilie:";
  const objektZeile = `${vertrag.objekt_bezeichnung ? vertrag.objekt_bezeichnung + " \u2013 " : ""}${objektAdresseVon(vertrag)}`;
  const eigentumAllein = vertrag.eigentum !== "mit";
  const verbraucherJa = vertrag.verbraucher !== "nein";
  const heute = new Date().toLocaleDateString("de-DE");

  const a: Absatz[] = [];
  a.push({ text: "Maklervertrag", heading: true, size: 24 });
  a.push({ text: `${standort.name} \u00b7 ${standort.firma}`, size: 9 });
  a.push({ text: "", spaceAfter: 6 });

  a.push({ text: "Zwischen", bold: true });
  if (verkTitel) a.push({ text: verkTitel });
  verkZeilen.forEach(z => a.push({ text: z }));
  a.push({ text: "- Verk\u00e4ufer -", size: 9 });
  a.push({ text: "und", bold: true });
  a.push({ text: standort.name });
  a.push({ text: standort.firma });
  a.push({ text: standort.strasse });
  a.push({ text: standort.plzOrt });
  a.push({ text: "- Immobilienmakler -", size: 9, spaceAfter: 10 });

  a.push({ text: "1. Immobilie", heading: true });
  a.push({ text: vermittlungText });
  a.push({ text: objektZeile, bold: true });
  a.push({ text: "und f\u00fcr diesen t\u00e4tig zu werden." });
  a.push({ text: `a. Als Angebotspreis wird f\u00fcr diese Immobilie festgesetzt: ${preis}` });
  a.push({ text: `b. Der Vertrag l\u00e4uft zun\u00e4chst f\u00fcr die Dauer von ${laufzeit} Monaten. Wird der Vertrag von dem Verk\u00e4ufer nicht innerhalb einer Frist von vier Wochen gek\u00fcndigt, verl\u00e4ngert sich der Maklervertrag um einen Monat. Die K\u00fcndigung des Vertrages bedarf der Textform.` });
  a.push({ text: "c. Dieser Maklervertrag gilt ab dem Tag und Datum der Unterzeichnung." });
  a.push({ text: "d. Zeitr\u00e4ume, in denen die Immobilie auf Wunsch des Auftraggebers nicht \u00f6ffentlich vermarktet wird, hemmen die Laufzeit dieses Maklervertrages. Die Vertragslaufzeit verl\u00e4ngert sich entsprechend um die Dauer der ausgesetzten Vermarktung.", spaceAfter: 10 });

  a.push({ text: "2. Pflichten des Immobilienmaklers", heading: true });
  a.push({ text: "a. Der Immobilienmakler verpflichtet sich, diesen Auftrag nachhaltig, intensiv und unter Einhaltung und Nutzung der bereitstehenden markt\u00fcblichen Vermarktungswege zu bearbeiten und die sich bietenden Abschlussgelegenheiten auszunutzen." });
  a.push({ text: "b. Der Immobilienmakler wird auf eigene Kosten Werbung f\u00fcr die Immobilie betreiben." });
  a.push({ text: "c. Der Immobilienmakler ist berechtigt, zur F\u00f6rderung der Vermarktung mit Maklerkollegen zusammenzuarbeiten und Gemeinschaftsgesch\u00e4fte abzuschlie\u00dfen. Ein Anspruch des Verk\u00e4ufers auf eine vorbezeichnete gemeinschaftliche Vermarktung besteht nicht. Der Verk\u00e4ufer stimmt f\u00fcr diesen Fall der Weitergabe der Objektdaten und weiteren Daten der Immobilie zu." });
  a.push({ text: "d. Der Immobilienmakler wird nach den Vorgaben des Verk\u00e4ufers die eingehenden Kaufangebote und Kaufinteressenten selektieren und die Konditionen, die diese zum Ankauf der Immobilie unterbreitet haben, an den Verk\u00e4ufer weitergeben." });
  a.push({ text: "e. Der Immobilienmakler verpflichtet sich die Immobilie erst mit dem Einverst\u00e4ndnis der Verk\u00e4ufer \u00f6ffentlich zu pr\u00e4sentieren (Online-Vermarktung \u00fcber Immobilienportale).", spaceAfter: 10 });

  a.push({ text: "3. Zusagen und Pflichten des Verk\u00e4ufers", heading: true });
  a.push({ text: "a. Der Verk\u00e4ufer ist" });
  a.push({ text: `${eigentumAllein ? "( x )" : "(   )"} alleiniger Eigent\u00fcmer der Immobilie und als solcher im Grundbuch eingetragen.` });
  a.push({ text: `${eigentumAllein ? "(   )" : "( x )"} Mit-Eigent\u00fcmer der Immobilie und sichert zu, von allen anderen Miteigent\u00fcmern der Immobilie bevollm\u00e4chtigt zu sein, diesen Maklervertrag abzuschlie\u00dfen. Der Verk\u00e4ufer verpflichtet sich f\u00fcr den Fall, dass einer der Miteigent\u00fcmer der Immobilie die erfolgreiche Arbeit des Immobilienmaklers vereiteln oder den Maklervertrag zur\u00fcckziehen oder in der Durchf\u00fchrung unm\u00f6glich machen sollte, den dem Immobilienmakler daraus entstehenden Schaden zu ersetzen und f\u00fcr die Nichterf\u00fcllung der verk\u00e4uferseitigen Pflichten aus diesem Vertrag einzustehen.` });
  a.push({ text: "b. Der Verk\u00e4ufer hat eine Vollmacht unterzeichnet, dass der Immobilienmakler alle erforderlichen Unterlagen einsehen und beschaffen darf. Au\u00dferdem erkl\u00e4rt der Verk\u00e4ufer, dass er dem Immobilienmakler alle f\u00fcr die erfolgreiche Vermittlung der Immobilie erforderlichen Unterlagen herausgibt und/oder bei der Beschaffung nach Kr\u00e4ften behilflich ist. Der Verk\u00e4ufer erm\u00f6glicht dem Immobilienmakler nach vorheriger Abstimmung Besichtigungen mit Kaufinteressenten." });
  a.push({ text: "c. Der Verk\u00e4ufer erteilt dem Immobilienmakler einen qualifizierten Alleinauftrag. W\u00e4hrend der Laufzeit dieses Vertrages wird der Verk\u00e4ufer keinen weiteren Immobilienmakler mit der Vermittlung der Immobilie beauftragen. Der Verk\u00e4ufer wird keine eigenen Vermarktungsbem\u00fchungen starten, insbesondere keine eigenen (digitalen) Anzeigen aufgeben oder in sonstiger Form seine Verkaufsabsicht durch ein \u00f6ffentliches Immobilienangebot bekunden. S\u00e4mtliche Kaufinteressenten, Immobilienmakler, Tippgeber oder entsprechende Dritte, die sich w\u00e4hrend der Laufzeit dieses Vertrages direkt an den Verk\u00e4ufer wenden, wird der Verk\u00e4ufer unverz\u00fcglich an den Immobilienmakler verweisen." });
  a.push({ text: "d. Der Immobilienmakler wird dem Verk\u00e4ufer nach der vollst\u00e4ndigen Objektaufnahme und Auswertung der bereit gestellten und beschafften Unterlagen das Expos\u00e9 zur Freizeichnung der dort get\u00e4tigten Angaben und \u00dcbereinstimmung mit den von dem Verk\u00e4ufer \u00fcber die Immobilie gemachten Angaben vorlegen, der Verk\u00e4ufer wird die Angaben sorgf\u00e4ltig \u00fcberpr\u00fcfen und dem Immobilienmakler etwaige Korrekturen aufgeben. Mit Freigabe des Expos\u00e9s best\u00e4tigt der Verk\u00e4ufer die Richtigkeit und Vollst\u00e4ndigkeit der darin enthaltenen Angaben. Der Immobilienmakler ist berechtigt, bei der Vermarktung auf die Vollst\u00e4ndigkeit und Richtigkeit der vom Verk\u00e4ufer get\u00e4tigten Angaben, Erkl\u00e4rungen, \u00fcbergebenen Unterlagen und des von ihm freigegebenen Expos\u00e9s zu vertrauen. Eine Pflicht zur eigenst\u00e4ndigen \u00dcberpr\u00fcfung dieser Angaben besteht nicht, es sei denn, es ist gesetzlich erforderlich." });
  a.push({ text: "e. Der Verk\u00e4ufer wird den Immobilienmakler unverz\u00fcglich von allen Umst\u00e4nden, die die Immobilie, die Vermarktung oder den Verkauf betreffen, in Kenntnis setzen. Das gilt insbesondere f\u00fcr Kaufinteressenten, die sich direkt mit dem Verk\u00e4ufer in Verbindung setzen, f\u00fcr eine \u00c4nderung oder die Zur\u00fcckstellung oder R\u00fccknahme der Verkaufsabsicht, die Beurkundung eines Kaufvertrages oder Ihre Absicht, die Immobilie zu einem anderen als den angenommenen Angebotspreis zu verkaufen." });
  a.push({ text: "f. Sollte der Verk\u00e4ufer einen notariellen Kaufvertrag abgeschlossen haben, verpflichtet er sich, dem Immobilienmakler die Konditionen des Verkaufs und die Vertragspartei zu \u00fcbermitteln, damit der Immobilienmakler eigene Anspr\u00fcche pr\u00fcfen und durchsetzen kann. Der Immobilienmakler wird bevollm\u00e4chtigt, zur Pr\u00fcfung seiner Anspr\u00fcche Grundbuchausz\u00fcge anzufordern. Der Verk\u00e4ufer verpflichtet sich hierzu, dem Immobilienmakler auf dessen Anforderungen, unverz\u00fcglich ausreichende Vollmacht zu erteilen.", spaceAfter: 10 });

  a.push({ text: "4. Verg\u00fctung", heading: true });
  if (provisionsmodell === "kaeufer") {
    a.push({ text: `a. Die T\u00e4tigkeit des Immobilienmaklers ist f\u00fcr den Verk\u00e4ufer provisionsfrei; eine Verk\u00e4ufer-Provision wird nicht erhoben. Der Immobilienmakler wird mit dem K\u00e4ufer einen provisionspflichtigen Maklervertrag \u00fcber eine K\u00e4ufer-Provision in H\u00f6he von ${provision}% inkl. 19% MwSt. vom beurkundeten Kaufpreis abschlie\u00dfen.` });
  } else if (provisionsmodell === "verkaeufer") {
    a.push({ text: `a. Der Verk\u00e4ufer ist bei Beurkundung eines Kaufvertrags \u00fcber die Immobilie zur Zahlung einer Verk\u00e4ufer-Provision in H\u00f6he von ${provision}% inkl. 19% MwSt. vom beurkundeten Kaufpreis verpflichtet. Die Verk\u00e4ufer-Provision ist verdient und f\u00e4llig mit der Beurkundung des notariellen Kaufvertrages. Sollte der beurkundete vom tats\u00e4chlichen Kaufpreis abweichen, ist der tats\u00e4chliche Kaufpreis ma\u00dfgeblich, soweit dies gesetzlich zul\u00e4ssig ist. F\u00fcr den K\u00e4ufer ist der Erwerb provisionsfrei; eine K\u00e4ufer-Provision wird nicht erhoben.` });
  } else {
    a.push({ text: `a. Der Verk\u00e4ufer ist bei Beurkundung eines Kaufvertrags \u00fcber die Immobilie zur Zahlung einer Verk\u00e4ufer-Provision in H\u00f6he von ${provision}% inkl. 19% MwSt. vom beurkundeten Kaufpreis verpflichtet. Die Verk\u00e4ufer-Provision ist verdient und f\u00e4llig mit der Beurkundung des notariellen Kaufvertrages. Sollte der beurkundete vom tats\u00e4chlichen Kaufpreis abweichen, ist der tats\u00e4chliche Kaufpreis ma\u00dfgeblich, soweit dies gesetzlich zul\u00e4ssig ist. Der Immobilienmakler wird mit dem K\u00e4ufer einen provisionspflichtigen Maklervertrag in gleicher Provisionsh\u00f6he abschlie\u00dfen (\u00a7 656c BGB).` });
  }
  a.push({ text: "b. Der Provisionsanspruch entsteht auch dann, wenn der Kaufvertrag nach Beendigung dieses Maklervertrages abgeschlossen wird, sofern der Vertrag auf die T\u00e4tigkeit des Immobilienmaklers w\u00e4hrend der Vertragslaufzeit zur\u00fcckzuf\u00fchren ist. Der Verk\u00e4ufer verpflichtet sich, dem Immobilienmakler den Abschluss eines Kaufvertrages unverz\u00fcglich mitzuteilen." });
  a.push({ text: "c. Der Provisionsanspruch entsteht auch, wenn anstelle eines Kaufvertrages ein wirtschaftlich vergleichbares Gesch\u00e4ft zustande kommt (z.B. Anteilskauf, Erbbaurecht, Pachtkauf etc.)." });
  a.push({ text: "d. Der Verk\u00e4ufer ist verpflichtet, dem Immobilienmakler Schadensersatz i. H. d. entgangenen Provision nach Abs. 4 lit. a, abz\u00fcglich ersparter Aufwendungen zu zahlen, wenn der Verk\u00e4ufer eine Pflicht gem\u00e4\u00df Abs. 3. lit. c. verletzt, indem er w\u00e4hrend der Vertragslaufzeit dieses Maklervertrags einen Kaufinteressenten nicht an den Immobilienmakler verweist, er ohne Einverst\u00e4ndnis des Immobilienmaklers einen anderen Immobilienmakler beauftragt oder er eigene Verkaufsbem\u00fchungen unternimmt und der Kaufvertrag innerhalb von 12 Monaten nach Beendigung dieses Maklervertrags zustande kommt." });
  a.push({ text: "e. Dem Immobilienmakler sind auf Verlangen des Immobilienmaklers tats\u00e4chlich angefallene, konkrete Aufwendungen nur dann zu ersetzen, wenn bei Beendigung des Maklervertrags ein Kaufvertrag nicht zustande gekommen ist oder ein Provisionsanspruch des Maklers nicht entsteht.", spaceAfter: 10 });

  a.push({ text: "5. Sonstige Vereinbarungen", heading: true });
  a.push({ text: "a. Das Geldw\u00e4schegesetz legt den Immobilienmaklerfirmen besondere Verpflichtungen auf. Der Verk\u00e4ufer stellt daher dem Immobilienmakler seinen Personalausweis zur Erf\u00fcllung dieser gesetzlichen Pflichten, der Anfertigung einer Fotokopie und Aufbewahrung nach dem Geldw\u00e4schegesetz zur Verf\u00fcgung. Der Immobilienmakler h\u00e4lt die Pflichten nach dem GwG ein." });
  a.push({ text: "b. Eine ausdr\u00fcckliche Einwilligung zur Verarbeitung der personenbezogenen Daten des Verk\u00e4ufers ist nach der DSGVO wegen dieses Vertrages nicht erforderlich. Der Immobilienmakler h\u00e4lt die Pflichten nach der DSGVO ein." });
  a.push({ text: "c. Der Verk\u00e4ufer erkl\u00e4rt:" });
  a.push({ text: `${verbraucherJa ? "( x )" : "(   )"} ich/wir verkaufen diese Immobilie als Verbraucher.` });
  a.push({ text: `${verbraucherJa ? "(   )" : "( x )"} ich/wir verkaufen diese Immobilie nicht als Verbraucher.` });
  a.push({ text: "Der Verk\u00e4ufer als Verbraucher erkl\u00e4rt, dass er mit Unterzeichnung dieses Vertrages die Widerrufsbelehrung und das Muster-Widerrufsformular des Immobilienmaklers ausgeh\u00e4ndigt bekommen hat." });
  a.push({ text: "d. Verbraucherinformation zur Online-Streitbeilegung gem. Art. 14 Abs. 1 ODR-VO: Die Europ\u00e4ische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit, die Sie hier finden: https://ec.europa.eu/consumers/odr. Wir sind nicht verpflichtet, an einem Streitbeilegungsverfahren teilzunehmen und nehmen daran auch nicht teil." });
  a.push({ text: "e. Erg\u00e4nzungen dieses Vertrages oder jegliche \u00c4nderungen der getroffenen Vereinbarungen bed\u00fcrfen der Textform; dies gilt auch f\u00fcr die Aufhebung des Formerfordernisses. F\u00fcr die K\u00fcndigung dieses Vertrages ist die Textform vereinbart." });
  a.push({ text: "f. Sollte eine der vorstehenden Bestimmungen ganz oder teilweise unwirksam oder undurchf\u00fchrbar sein oder werden, so wird hierdurch die Wirksamkeit der \u00fcbrigen Bestimmungen nicht ber\u00fchrt.", spaceAfter: 10 });

  a.push({ text: `${standort.stadt}, ${heute}`, spaceAfter: 20 });

  a.push({ text: "Widerrufsbelehrung", heading: true, size: 18 });
  a.push({ text: "Widerrufsrecht", bold: true });
  a.push({ text: "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gr\u00fcnden diesen Vertrag zu widerrufen. Die Widerrufsfrist betr\u00e4gt vierzehn Tage ab dem Tag des Vertragsabschlusses." });
  a.push({ text: "Um Ihr Widerrufsrecht auszu\u00fcben, m\u00fcssen Sie uns" });
  a.push({ text: standort.name });
  a.push({ text: standort.firma });
  a.push({ text: standort.strasse });
  a.push({ text: standort.plzOrt });
  if (standort.email) a.push({ text: standort.email });
  a.push({ text: "mittels einer eindeutigen Erkl\u00e4rung (z. B. ein mit der Post versandter Brief oder E-Mail) \u00fcber Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie k\u00f6nnen daf\u00fcr das beigef\u00fcgte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist." });
  a.push({ text: "Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung \u00fcber die Aus\u00fcbung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden." });
  a.push({ text: "Folgen des Widerrufs", bold: true });
  a.push({ text: "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschlie\u00dflich der Lieferkosten (mit Ausnahme der zus\u00e4tzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung, als die von uns angebotene, g\u00fcnstigste Standardlieferung gew\u00e4hlt haben), unverz\u00fcglich und sp\u00e4testens binnen vierzehn Tagen ab dem Tag zur\u00fcckzuzahlen, an dem die Mitteilung \u00fcber Ihren Widerruf dieses Vertrags bei uns eingegangen ist. F\u00fcr diese R\u00fcckzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der urspr\u00fcnglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdr\u00fccklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser R\u00fcckzahlung Entgelte berechnet." });
  a.push({ text: "Haben Sie verlangt, dass die Dienstleistung w\u00e4hrend der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Aus\u00fcbung des Widerrufsrechts hinsichtlich dieses Vertrages unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht." });
  a.push({ text: "Indem Sie diese Vereinbarung unterschreiben, best\u00e4tigen Sie, dass Sie die oben genannte Widerrufsbelehrung gelesen und verstanden haben." });
  a.push({ text: "Bitte beachten Sie, dass Ihr Widerrufsrecht erlischt, wenn wir auf Ihren ausdr\u00fccklichen Wunsch hin unsere Maklert\u00e4tigkeit vollst\u00e4ndig erbracht haben, bevor Sie von Ihrem Widerrufsrecht Gebrauch gemacht haben. Wir bitten Sie daher, Ihren Wunsch diesbez\u00fcglich unten zum Ausdruck zu bringen." });
  a.push({ text: `[ ] Ich stimme ausdr\u00fccklich zu, dass ${standort.name}; ${standort.firma}, vertreten durch ${standort.vertreter}, ${standort.strasse}, ${standort.plzOrt}, mit der Maklert\u00e4tigkeit beginnt, bevor die oben genannte Frist f\u00fcr die Aus\u00fcbung meines Widerrufsrechts abgelaufen ist, und bin mir bewusst, dass mein Widerrufsrecht vorzeitig erlischt. (Diese Zustimmung wird gesondert im Rahmen der elektronischen Unterschrift eingeholt.)` });
  a.push({ text: "Wir hoffen, Ihnen bald einen geeigneten K\u00e4ufer pr\u00e4sentieren zu k\u00f6nnen, und verbleiben" });
  a.push({ text: "mit freundlichen Gr\u00fc\u00dfen" });
  a.push({ text: standort.name });
  a.push({ text: standort.firma });
  a.push({ text: standort.vertreter, spaceAfter: 10 });
  a.push({ text: "Hiermit best\u00e4tigt der Verk\u00e4ufer, die Widerrufsbelehrung, das Muster-Widerrufsformular und die AGB erhalten zu haben." });
  a.push({ text: "Wir ben\u00f6tigen eine unterzeichnete Kopie dieses Schreibens und m\u00f6chten Sie h\u00f6flich bitten, uns dieses unverz\u00fcglich zur\u00fcckzusenden.", spaceAfter: 20 });

  a.push({ text: "Muster-Widerrufsformular", heading: true, size: 16 });
  a.push({ text: "(Wenn Sie den Vertrag widerrufen wollen, dann f\u00fcllen Sie bitte dieses Formular aus und senden es an uns zur\u00fcck.)" });
  a.push({ text: standort.name });
  a.push({ text: standort.firma });
  a.push({ text: standort.vertreter });
  a.push({ text: standort.strasse });
  a.push({ text: standort.plzOrt });
  if (standort.email) a.push({ text: standort.email });
  a.push({ text: "Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag \u00fcber die Erbringung der Maklerleistung" });
  a.push({ text: "Bestellt/erhalten am _______________" });
  a.push({ text: "Name:" });
  a.push({ text: "Anschrift:" });
  a.push({ text: "Unterschrift (bei Widerruf in Papierform, bei E-Mail nicht erforderlich)" });
  a.push({ text: "Datum:", spaceAfter: 20 });

  a.push(...buildAgbAbsaetze(standort, false));

  return a;
}

function buildVollmachtAbsaetze(vertrag: any, standort: ImmoStandort): Absatz[] {
  const { titel: verkTitel, zeilen: verkZeilen } = verkaeuferZeilen(vertrag);
  const objektZeilen: string[] = [];
  if (vertrag.objekt_bezeichnung) objektZeilen.push(vertrag.objekt_bezeichnung);
  if (vertrag.objekt_strasse) objektZeilen.push(vertrag.objekt_strasse);
  else if (vertrag.objekt_adresse) objektZeilen.push(vertrag.objekt_adresse);
  const objPlzOrt = `${vertrag.objekt_plz || ""} ${vertrag.objekt_ort || ""}`.trim();
  if (objPlzOrt) objektZeilen.push(objPlzOrt);
  const heute = new Date().toLocaleDateString("de-DE");

  const a: Absatz[] = [];
  a.push({ text: "Vollmacht", heading: true, size: 24, spaceAfter: 14 });
  a.push({ text: "Auftraggeber", bold: true });
  if (verkTitel) a.push({ text: verkTitel });
  verkZeilen.forEach(z => a.push({ text: z }));
  a.push({ text: "erteilt", bold: true, spaceAfter: 6 });
  a.push({ text: standort.name });
  a.push({ text: standort.firma });
  a.push({ text: standort.vertreter });
  a.push({ text: standort.strasse });
  a.push({ text: standort.plzOrt, spaceAfter: 6 });
  a.push({ text: "zu der Immobilie:", bold: true });
  objektZeilen.forEach(z => a.push({ text: z }));
  a.push({ text: "die Vollmacht zur:", bold: true, spaceAfter: 4 });
  [
    "Einsichtnahme in das Grundbuch und zur Anfertigung bzw. Einholung eines aktuellen Grundbuchauszuges",
    "Einsichtnahme in die Grundakte",
    "Einsichtnahme in die der Eintragung von vorhandenen Belastungen zugrunde liegenden Unterlagen bzw. Anforderung von Unterlagen, die im Grundbuch eingetragene Belastungen betreffen",
    "zur Einsichtnahme in das Kataster",
    "zur Einsichtnahme in das Baulastenverzeichnis",
    "zur Einsichtnahme in das Altlastenverzeichnis oder Altlastenkataster",
    "zur Einsichtnahme in die Bauakte und zur Anfertigung von Ausz\u00fcgen aus der Bauakte, sofern dies aus Sicht des Immobilienmaklers erforderlich ist",
    "zur Einsichtnahme in weitere beh\u00f6rdliche Akten",
    "zur Einsichtnahme von Akten im Zusammenhang mit Eintragungen in Abteilung III des Grundbuchs bzw. Anforderung von Unterlagen, Vertr\u00e4gen und zugrunde liegenden Vereinbarungen, die Eintragungen in Abteilung III des Grundbuchs betreffen.",
    "Sonstiges",
  ].forEach(t => a.push({ text: `-  ${t}`, indent: 14 }));
  a.push({ text: "Die Vollmacht erstreckt sich auch auf die schriftliche Anforderung von Ausz\u00fcgen aus den genannten Akten und Registern. Der Auftraggeber erteilt dem Makler zudem die Vollmacht, bei einem Notar den Notarvertrag in dem Moment anzufordern, wenn die beiden Parteien des notariellen Kaufvertrages hinreichend bestimmt sind.", spaceAfter: 4 });
  a.push({ text: "Mit der \u00dcbermittlung der personenbezogenen Daten an die jeweiligen Stellen erkl\u00e4rt sich der Auftraggeber einverstanden." });
  a.push({ text: "Die Vollmacht gilt f\u00fcr das Maklerb\u00fcro, so dass auch die Mitarbeitenden des Maklerb\u00fcros diese Vollmacht nutzen d\u00fcrfen." });
  a.push({ text: "Der Immobilienmakler darf keine Untervollmacht an weitere Maklerb\u00fcros erteilen." });
  a.push({ text: "Der Immobilienmakler darf externen Dienstleister Untervollmacht zur Beantragung der o.g. Unterlagen erteilen.", spaceAfter: 14 });
  a.push({ text: `Datum: ${heute}` });

  return a;
}

// ---- Reservierungsvereinbarung (Neubau) \u2014 Text identisch zum PDF-Export ----
function immoCiFarbe(hex: unknown, ersatz: any) {
  if (typeof hex !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return ersatz;
  return rgb(parseInt(hex.slice(1, 3), 16) / 255,
             parseInt(hex.slice(3, 5), 16) / 255,
             parseInt(hex.slice(5, 7), 16) / 255);
}

function buildReservierungAbsaetze(res: any, firma: any): Absatz[] {
  const objektart = res.objektart === "haus" ? "Haus" :
                    res.objektart === "reihenhaus" ? "Reihenhaus" :
                    res.objektart === "gewerbe" ? "Gewerbeeinheit" :
                    "Eigentumswohnung";
  const kaeuferLabel = res.kaeufer_typ === "eheleute" ? "Eheleute" :
                       res.kaeufer_typ === "gbr" ? "GbR" : "";
  const projektTeil = res.projektname ? ` des Projektes \u201e${res.projektname}"` : "";
  const flaeche = res.wohnflaeche_m2 ? ` mit ca. ${Number(res.wohnflaeche_m2).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m\u00b2 Wohnfl\u00e4che` : "";
  const frist = res.zahlungsfrist_werktage || 5;

  const a: Absatz[] = [];
  a.push({ text: "Reservierungsvereinbarung", heading: true, size: 24 });
  a.push({ text: "", spaceAfter: 6 });
  a.push({ text: "zwischen" });
  a.push({ text: "Makler:", bold: true });
  a.push({ text: firma.firma_name });
  a.push({ text: firma.strasse });
  a.push({ text: `${firma.plz} ${firma.ort}` });
  if (firma.geschaeftsfuehrer) a.push({ text: `vertreten durch Gesch\u00e4ftsf\u00fchrer ${firma.geschaeftsfuehrer}` });
  a.push({ text: `(im Folgenden \u201eMakler" genannt)`, size: 9, spaceAfter: 8 });
  a.push({ text: "und" });
  a.push({ text: "K\u00e4ufer:", bold: true });
  if (kaeuferLabel) a.push({ text: kaeuferLabel });
  a.push({ text: res.kaeufer_name || "" });
  if (res.kaeufer_strasse) a.push({ text: res.kaeufer_strasse });
  const kPlzOrt = `${res.kaeufer_plz || ""} ${res.kaeufer_ort || ""}`.trim();
  if (kPlzOrt) a.push({ text: kPlzOrt });
  a.push({ text: `(im Folgenden \u201eK\u00e4ufer" genannt)`, size: 9, spaceAfter: 12 });

  a.push({ text: "1. Gegenstand der Reservierung", heading: true });
  a.push({ text: "Der K\u00e4ufer reserviert verbindlich folgende Immobilie:" });
  a.push({ text: `${objektart} ${res.wohneinheit_nr || ""}${res.etage ? ` im ${res.etage}` : ""}${flaeche}${projektTeil},` });
  a.push({ text: `gelegen in ${res.objekt_strasse}, ${res.objekt_plz} ${res.objekt_ort},` });
  a.push({ text: `Kaufpreis: ${eurOhneSym(Number(res.kaufpreis))}`, bold: true, spaceAfter: 10 });

  a.push({ text: "2. Rechtscharakter", heading: true });
  a.push({ text: "Diese Vereinbarung ist kein Kaufvertrag im Sinne von \u00a7 311b BGB. Sie begr\u00fcndet keinen Rechtsanspruch auf Abschluss eines Kaufvertrages.", spaceAfter: 10 });

  a.push({ text: "3. Reservierungsdauer", heading: true });
  a.push({ text: `Die Reservierung gilt bis zum ${formatGermanDate(res.reservierungsdauer_bis)}. Legt der K\u00e4ufer vor Ablauf dieser Frist einen schriftlichen Finanzierungsnachweis vor, verl\u00e4ngert sich die Reservierungsdauer automatisch bis zum Tag des notariellen Kaufvertragsabschlusses, l\u00e4ngstens jedoch bis zu 8 Wochen nach Vorlage des Finanzierungsnachweises, sofern nicht schriftlich eine andere Frist vereinbart wird.`, spaceAfter: 10 });

  a.push({ text: "4. Pflichten des K\u00e4ufers", heading: true });
  a.push({ text: "Der K\u00e4ufer verpflichtet sich, bis zum Ende des Reservierungszeitraumes einen schriftlichen Finanzierungsnachweis (z. B. Finanzierungsbest\u00e4tigung einer Bank) vorzulegen. Der K\u00e4ufer verpflichtet sich zudem, den Makler unverz\u00fcglich schriftlich zu informieren, sobald feststeht, dass er die Immobilie nicht erwerben wird \u2013 auch vor Ablauf der Frist. In diesem Fall endet die Reservierung vorzeitig.", spaceAfter: 10 });

  a.push({ text: "5. Pflichten des Maklers und Verk\u00e4ufers", heading: true });
  a.push({ text: "Der Makler und der Eigent\u00fcmer verpflichten sich, w\u00e4hrend der Reservierungsdauer mit keinem anderen Interessenten \u00fcber die genannte Immobilie zu verhandeln oder diese anzubieten.", spaceAfter: 10 });

  a.push({ text: "6. Reservierungsgeb\u00fchr", heading: true });
  a.push({ text: `Zur Best\u00e4tigung des Kaufinteresses zahlt der K\u00e4ufer an den Makler eine Reservierungsgeb\u00fchr in H\u00f6he von ${eurOhneSym(Number(res.reservierungsgebuehr_brutto))} inkl. MwSt.` });
  a.push({ text: `- Zahlung f\u00e4llig innerhalb von ${frist} Werktagen nach Unterzeichnung dieser Vereinbarung`, indent: 6 });
  a.push({ text: "Der Makler stellt hier\u00fcber eine ordnungsgem\u00e4\u00dfe Rechnung aus.", spaceAfter: 10 });

  a.push({ text: "7. R\u00fcckzahlung der Reservierungsgeb\u00fchr", heading: true });
  a.push({ text: `Sollte der Kaufvertrag nicht zustande kommen, wird die Reservierungsgeb\u00fchr innerhalb von ${frist} Werktagen nach schriftlicher Mitteilung des K\u00e4ufers in voller H\u00f6he auf ein vom K\u00e4ufer benanntes Konto zur\u00fcckerstattet. Dies gilt auch, wenn der Kauf aus Gr\u00fcnden des Verk\u00e4ufers oder Maklers nicht zustande kommt.`, spaceAfter: 10 });

  a.push({ text: "8. Schlussbestimmungen", heading: true });
  a.push({ text: "\u00c4nderungen und Erg\u00e4nzungen dieser Vereinbarung bed\u00fcrfen der Schriftform. Sollte eine Bestimmung dieser Vereinbarung ganz oder teilweise unwirksam sein oder werden, bleibt die Wirksamkeit der \u00fcbrigen Bestimmungen unber\u00fchrt.", spaceAfter: 10 });

  a.push({ text: "9. R\u00fccktrittsrecht des Verk\u00e4ufers/Maklers", heading: true });
  a.push({ text: "Der Verk\u00e4ufer bzw. Makler ist berechtigt, von dieser Reservierungsvereinbarung zur\u00fcckzutreten, wenn" });
  a.push({ text: "- der K\u00e4ufer innerhalb der Frist keinen ausreichenden Finanzierungsnachweis erbringt,", indent: 6 });
  a.push({ text: "- der K\u00e4ufer seinen vertraglichen Pflichten aus dieser Vereinbarung nicht nachkommt, oder", indent: 6 });
  a.push({ text: "- unvorhersehbare Umst\u00e4nde eintreten, die den Verkauf der Immobilie unm\u00f6glich machen (z. B. h\u00f6here Gewalt, beh\u00f6rdliche Untersagung, Rechtsstreitigkeiten bez\u00fcglich der Immobilie).", indent: 6 });
  a.push({ text: "Im Falle eines R\u00fccktritts durch den Verk\u00e4ufer/Makler wird die geleistete Reservierungsgeb\u00fchr vollst\u00e4ndig zur\u00fcckerstattet. Weitere Anspr\u00fcche des K\u00e4ufers bestehen nicht.", spaceAfter: 14 });

  a.push({ text: `${res.ort_unterzeichnung || ""}, ${formatGermanDate(res.datum_unterzeichnung) || new Date().toLocaleDateString("de-DE")}` });

  return a;
}

function kaeuferListe(objektnachweis: any): any[] {
  let kaeufer = Array.isArray(objektnachweis.kaeufer) ? objektnachweis.kaeufer.filter((k: any) => k && (k.nachname || k.vorname)) : [];
  if (kaeufer.length === 0 && objektnachweis.k1_nachname) {
    kaeufer = [{
      anrede: objektnachweis.k1_anrede || "Frau", vorname: objektnachweis.k1_vorname || "", nachname: objektnachweis.k1_nachname || "",
      strasse: objektnachweis.k1_strasse || "", plz: objektnachweis.k1_plz || "", ort: objektnachweis.k1_ort || "",
      geburt: objektnachweis.k1_geburt || "", staat: objektnachweis.k1_staat || "Deutsch", ausweis: objektnachweis.k1_ausweis || "",
    }];
    if (objektnachweis.k2_nachname) {
      kaeufer.push({
        anrede: objektnachweis.k2_anrede || "Herr", vorname: objektnachweis.k2_vorname || "", nachname: objektnachweis.k2_nachname || "",
        strasse: objektnachweis.k2_strasse || "", plz: objektnachweis.k2_plz || "", ort: objektnachweis.k2_ort || "",
        geburt: objektnachweis.k2_geburt || "", staat: objektnachweis.k2_staat || "Deutsch", ausweis: objektnachweis.k2_ausweis || "",
      });
    }
  }
  if (kaeufer.length === 0) {
    kaeufer = [{ anrede: "Frau", vorname: "", nachname: "", strasse: "", plz: "", ort: "", geburt: "", staat: "Deutsch", ausweis: "" }];
  }
  return kaeufer;
}

// ---- Objektnachweis, Teil 1: Nachweis + Reservierung. Direkt darunter kommen
//      die Unterschriften. Widerruf und AGB folgen als Anlagen.
function buildObjektnachweisHauptteil(objektnachweis: any, standort: ImmoStandort, verkaeuferNamen: string[]): Absatz[] {
  const kaeufer = kaeuferListe(objektnachweis);
  const heute = new Date().toLocaleDateString("de-DE");
  const angebotsdatum = objektnachweis.angebotsdatum ? formatGermanDate(objektnachweis.angebotsdatum) : heute;
  const objektAdresse = objektnachweis.objekt_adresse
    || `${objektnachweis.objekt_strasse || ""}${(objektnachweis.objekt_plz || objektnachweis.objekt_ort) ? ` in ${objektnachweis.objekt_plz || ""} ${objektnachweis.objekt_ort || ""}`.trim() : ""}`.trim();
  const kaufpreis = objektnachweis.kaufpreis ? formatMoneyDE(objektnachweis.kaufpreis) : "____________________________";
  const provision = objektnachweis.provision || "2,00";
  const notarZeile = objektnachweis.notar_name
    ? (objektnachweis.notar_adresse ? `${objektnachweis.notar_name}, ${objektnachweis.notar_adresse}` : objektnachweis.notar_name)
    : "__________________________________________";

  const anredeZeile = kaeufer
    .map((k: any) => `${k.anrede === "Herr" ? "Herr" : "Frau"} ${[k.vorname, k.nachname].filter(Boolean).join(" ")}`.trim())
    .join(" und ");

  const a: Absatz[] = [];

  a.push({ text: `${standort.name} \u00b7 ${standort.firma} \u00b7 ${standort.strasse} \u00b7 ${standort.plzOrt}`, size: 8, spaceAfter: 14 });
  a.push({ text: "Nachweis des Objekts, Reservierung und die Widerrufsbelehrung", heading: true, size: 13, spaceAfter: 6 });
  a.push({ text: `${standort.stadt}, den ${heute}`, size: 10, spaceAfter: 12 });

  a.push({ text: anredeZeile ? `Sehr geehrte(r) ${anredeZeile},` : "Sehr geehrte Damen und Herren,", spaceAfter: 8 });
  a.push({ text: `wir freuen uns, Sie bei der Abwicklung Ihres Kaufangebotes vom ${angebotsdatum} unterst\u00fctzen zu k\u00f6nnen. Das Kaufinteresse bezieht sich auf Folgendes:` });
  a.push({ text: `${objektnachweis.objekt_bezeichnung ? objektnachweis.objekt_bezeichnung + " \u2013 " : ""}${objektAdresse} zu einem Kaufpreis von ${kaufpreis}.`, bold: true, spaceAfter: 10 });

  a.push({ text: "Als Immobilienmaklerunternehmen sind wir gem\u00e4\u00df den Vorschriften des Geldw\u00e4schegesetzes dazu verpflichtet, die Identit\u00e4t unseres Vertragspartners zu ermitteln und zu \u00fcberpr\u00fcfen.", spaceAfter: 8 });

  kaeufer.forEach((k: any, idx: number) => {
    if (idx > 0) a.push({ text: "", spaceAfter: 4 });
    a.push({ text: `Name/Vorname: ${k.nachname || ""}, ${k.vorname || ""}` });
    a.push({ text: `Anschrift: ${k.strasse || ""}, ${`${k.plz || ""} ${k.ort || ""}`.trim()}` });
    a.push({ text: `Ort und Datum der Geburt: ${k.geburt || `${k.geburtsort || ""}${k.geburtsort && k.geburtsdatum ? ", " : ""}${k.geburtsdatum || ""}`}` });
    a.push({ text: `Staatsangeh\u00f6rigkeit: ${k.staat || "Deutsch"}` });
    a.push({ text: `Ausweis- oder Reisepassnummer: ${k.ausweis || ""}`, spaceAfter: 6 });
  });

  a.push({ text: "[x] Hiermit \u00fcberreichen wir eine Kopie des Ausweises oder Reisepasses." });
  a.push({ text: "[x] Wir handeln im eigenen Namen", spaceAfter: 10 });

  if (verkaeuferNamen.length > 0) {
    a.push({ text: "Verk\u00e4uferseite", bold: true });
    a.push({ text: "Der Nachweis wird zugleich der Verk\u00e4uferseite zur Kenntnis und Gegenzeichnung vorgelegt:" });
    verkaeuferNamen.forEach(n => a.push({ text: `-  ${n}`, indent: 14 }));
    a.push({ text: "Mit ihrer Unterschrift best\u00e4tigt die Verk\u00e4uferseite, dass die vorgenannten Kaufinteressenten ihr durch den Makler nachgewiesen wurden.", spaceAfter: 10 });
  }

  a.push({ text: `Der K\u00e4ufer ist bei Beurkundung eines Kaufvertrags \u00fcber die Immobilie zur Zahlung einer Provision in H\u00f6he von ${provision}%, zzgl. gesetzlicher MwSt., vom beurkundeten Kaufpreis verpflichtet. Die Provision ist verdient und f\u00e4llig mit der Beurkundung des notariellen Kaufvertrages. Sollte der beurkundete vom tats\u00e4chlichen Kaufpreis abweichen, ist der tats\u00e4chliche Kaufpreis ma\u00dfgeblich, soweit dies gesetzlich zul\u00e4ssig ist.` });
  a.push({ text: `Gleichzeitig beauftragen die K\u00e4ufer das Maklerb\u00fcro \u2013 ${standort.name}; ${standort.firma}; das Notariat ${notarZeile} namens und in Vollmacht des K\u00e4ufers einen Kaufvertragsentwurf anfertigen zu lassen und einen Beurkundungstermin abzustimmen. Das Maklerb\u00fcro ist bevollm\u00e4chtigt, hilfsweise ein anderes Notariat zu beaufragen.` });
  a.push({ text: "Der K\u00e4ufer tr\u00e4gt die Kosten des Notars f\u00fcr die Erstellung eines Kaufvertragsentwurfs, sofern er den Notar selbst oder \u00fcber den Makler in seinem Auftrag mit der Erstellung des Entwurfs beauftragt hat. Dem K\u00e4ufer ist bewusst, dass er die Kosten des Notariats grunds\u00e4tzlich auch dann zu tragen hat, wenn ein Kaufvertragsschluss ausbleibt." });
  a.push({ text: "Dies gilt nicht, wenn der Kaufvertrag aus Gr\u00fcnden nicht zustande kommt, die aus der Sph\u00e4re des Verk\u00e4ufers stammen (z.B. fehlende Unterlagen, rechtliche Hindernisse, Abbruch der Vermarktung). In diesem Fall tr\u00e4gt der Verk\u00e4ufer die Kosten der notariellen Entwurfserstellung." });
  a.push({ text: "Die Parteien vereinbaren, dass der Makler unter keinen Umst\u00e4nden f\u00fcr die mit der Beauftragung des Notars verbundenen Kosten aufkommt." });
  a.push({ text: "Der K\u00e4ufer best\u00e4tigt, dass ihm die angebotene Immobilie sowie die Person des Verk\u00e4ufers bislang nicht bekannt waren. Etwaige Vorkenntnisse sind dem Makler unverz\u00fcglich mitzuteilen. Die Verpflichtung zur Zahlung der Provision bleibt unber\u00fchrt, sofern die T\u00e4tigkeit des Maklers f\u00fcr den Abschluss des Kaufvertrages zumindest miturs\u00e4chlich geworden oder f\u00f6rderlich gewesen ist." });
  a.push({ text: "Der K\u00e4ufer bem\u00fcht sich, innerhalb von 14 Tagen eine Finanzierungsbest\u00e4tigung vorzulegen." });
  a.push({ text: "Sollte eine der vorstehenden Bestimmungen ganz oder teilweise unwirksam oder undurchf\u00fchrbar sein oder werden, so wird hierdurch die Wirksamkeit der \u00fcbrigen Bestimmungen nicht ber\u00fchrt.", spaceAfter: 8 });

  a.push({ text: "\u00dcber Ihr Widerrufsrecht informieren wir Sie in der beigef\u00fcgten Widerrufsbelehrung; das Muster-Widerrufsformular und unsere Allgemeinen Gesch\u00e4ftsbedingungen sind diesem Schreiben als Anlagen beigef\u00fcgt.", spaceAfter: 14 });

  a.push({ text: "mit freundlichen Gr\u00fc\u00dfen" });
  a.push({ text: standort.name });
  a.push({ text: standort.firma, spaceAfter: 14 });

  // Ort/Datum-Zeile direkt ueber den Unterschriften (wie im Word-Dokument)
  a.push({ text: `${standort.stadt}, den ${heute}`, spaceAfter: 6 });

  return a;
}

// ---- Objektnachweis, Anlage 1: Widerrufsbelehrung + Muster-Widerrufsformular
function buildObjektnachweisWiderruf(standort: ImmoStandort): Absatz[] {
  const a: Absatz[] = [];
  a.push({ text: "Anlage 1 \u2013 Widerrufsbelehrung", heading: true, size: 13, pageBreakBefore: true });
  a.push({ text: "Widerrufsrecht", bold: true });
  a.push({ text: "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gr\u00fcnden diesen Vertrag zu widerrufen. Die Widerrufsfrist betr\u00e4gt vierzehn Tage ab dem Tag des Vertragsabschlusses." });
  a.push({ text: "Um Ihr Widerrufsrecht auszu\u00fcben, m\u00fcssen Sie uns" });
  a.push({ text: standort.name });
  a.push({ text: standort.firma });
  a.push({ text: standort.strasse });
  a.push({ text: standort.plzOrt });
  if (standort.email) a.push({ text: standort.email });
  a.push({ text: "mittels einer eindeutigen Erkl\u00e4rung (z. B. ein mit der Post versandter Brief oder E-Mail) \u00fcber Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie k\u00f6nnen daf\u00fcr das beigef\u00fcgte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist." });
  a.push({ text: "Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung \u00fcber die Aus\u00fcbung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden." });
  a.push({ text: "Folgen des Widerrufs", bold: true });
  a.push({ text: "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschlie\u00dflich der Lieferkosten (mit Ausnahme der zus\u00e4tzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, g\u00fcnstigste Standardlieferung gew\u00e4hlt haben), unverz\u00fcglich und sp\u00e4testens binnen vierzehn Tagen ab dem Tag zur\u00fcckzuzahlen, an dem die Mitteilung \u00fcber Ihren Widerruf dieses Vertrags bei uns eingegangen ist. F\u00fcr diese R\u00fcckzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der urspr\u00fcnglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdr\u00fccklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser R\u00fcckzahlung Entgelte berechnet." });
  a.push({ text: "Haben Sie verlangt, dass die Dienstleistung w\u00e4hrend der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Aus\u00fcbung des Widerrufsrechts hinsichtlich dieses Vertrages unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht." });
  a.push({ text: "Indem Sie diese Vereinbarung unterschreiben, best\u00e4tigen Sie, dass Sie die oben genannte Widerrufsbelehrung gelesen und verstanden haben." });
  a.push({ text: "Bitte beachten Sie, dass Ihr Widerrufsrecht erlischt, wenn wir auf Ihren ausdr\u00fccklichen Wunsch hin unsere Maklert\u00e4tigkeit vollst\u00e4ndig erbracht haben, bevor Sie von Ihrem Widerrufsrecht Gebrauch gemacht haben." });
  a.push({ text: `[ ] Ich stimme ausdr\u00fccklich zu, dass ${standort.name}; ${standort.firma}, vertreten durch ${standort.vertreter}, ${standort.strasse}, ${standort.plzOrt}, mit der Maklert\u00e4tigkeit beginnt, bevor die oben genannte Frist f\u00fcr die Aus\u00fcbung meines Widerrufsrechts abgelaufen ist, und bin mir bewusst, dass mein Widerrufsrecht vorzeitig erlischt. (Diese Zustimmung wird gesondert im Rahmen der elektronischen Unterschrift eingeholt.)`, spaceAfter: 10 });
  a.push({ text: "Hiermit best\u00e4tigt der K\u00e4ufer, die Widerrufsbelehrung, das Muster-Widerrufsformular und die AGB erhalten zu haben.", spaceAfter: 12 });

  a.push({ text: "Anlage 2 \u2013 Muster-Widerrufsformular", heading: true, size: 13, pageBreakBefore: true });
  a.push({ text: "(Wenn Sie den Vertrag widerrufen wollen, dann f\u00fcllen Sie bitte dieses Formular aus und senden es an uns zur\u00fcck.)" });
  a.push({ text: standort.name });
  a.push({ text: standort.firma });
  a.push({ text: standort.vertreter });
  a.push({ text: standort.strasse });
  a.push({ text: standort.plzOrt });
  if (standort.email) a.push({ text: standort.email });
  a.push({ text: "Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag \u00fcber die Erbringung der Maklerleistung" });
  a.push({ text: "Bestellt/erhalten am _______________" });
  a.push({ text: "Name:" });
  a.push({ text: "Anschrift:" });
  a.push({ text: "Unterschrift (bei Widerruf in Papierform, bei E-Mail nicht erforderlich)" });
  a.push({ text: "Datum:", spaceAfter: 12 });

  return a;
}

function buildObjektnachweisAgb(standort: ImmoStandort): Absatz[] {
  const agb = buildAgbAbsaetze(standort, true);
  agb[0] = { text: "Anlage 3 \u2013 Allgemeine Gesch\u00e4ftsbedingungen", heading: true, size: 13, pageBreakBefore: true };
  return agb;
}

const DOKUMENT_TYPEN = ["maklervertrag", "vollmacht", "objektnachweis", "reservierung"];
const QUELLTABELLE: Record<string, string> = {
  maklervertrag: "vertraege",
  vollmacht: "vertraege",
  objektnachweis: "objektnachweise",
  reservierung: "reservierungen_neubau",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Die Reservierung muss auch im Fehlerfall erreichbar sein — in dieser
  // Funktion fuehrt JEDER Fehler ueber einen throw in denselben catch.
  let credits: Abrechnung | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData?.user) throw new Error("Nicht authentifiziert.");
    const aktuellerUserId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    // --- Storage: Pfade tragen den Mandanten als erstes Segment -----------
    // Gleiche Bauart wie die Huelle der Oberflaeche. Sie steht IM Handler und
    // nicht auf Modulebene: eine Mandantenvariable auf Modulebene ueberlebt in
    // Deno die Anfrage und traegt den Mandanten des einen Aufrufers in den
    // naechsten. Genau das waere ein Leck statt einer Trennung.
    // Solange immoMandant null ist, bleibt jeder Pfad unveraendert — die
    // Funktion verhaelt sich dann wie bisher.
    let immoMandant: string | null = null;
    const immoSetzeMandant = (m: unknown) => { immoMandant = (typeof m === "string" && m) ? m : null; };
    // Schriften sind Plattform-Gut, kein Mandanten-Branding. Sie liegen im
    // Wurzelverzeichnis des Eimers unter fonts/. Fehlt eine, wird sie beim
    // ersten Bedarf von ihrer Quelle geholt und dort abgelegt — danach nie
    // wieder. Ein Mandant, der eine eigene Hausschrift hochlaedt, legt sie
    // unter {mandant}/fonts/… und uebersteuert damit die der Plattform.
    const IMMO_SCHRIFTEN: Record<string, string> = {
      "fonts/Montserrat-Regular.ttf":        "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Regular.ttf",
      "fonts/Montserrat-Bold.ttf":           "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Bold.ttf",
      "fonts/Montserrat-Light.ttf":          "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Light.ttf",
      "fonts/Montserrat-Medium.ttf":         "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Medium.ttf",
      "fonts/Montserrat-SemiBold.ttf":       "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBold.ttf",
      "fonts/Montserrat-Italic.ttf":         "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Italic.ttf",
      "fonts/Montserrat-SemiBoldItalic.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBoldItalic.ttf",
      "fonts/Marcellus-Regular.ttf":         "https://raw.githubusercontent.com/google/fonts/main/ofl/marcellus/Marcellus-Regular.ttf",
      "fonts/GreatVibes-Regular.ttf":        "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf",
    };
    {
      const immoEcht = admin.storage.from.bind(admin.storage);
      const immoVorne = (pf: unknown): unknown =>
        (typeof pf !== "string" || !pf || !immoMandant) ? pf
          : (pf === immoMandant || pf.startsWith(immoMandant + "/") ? pf : immoMandant + "/" + pf);
      const immoViele = (pf: unknown): unknown => Array.isArray(pf) ? pf.map(immoVorne) : immoVorne(pf);
      (admin.storage as any).from = (eimer: string) => {
        const api: any = immoEcht(eimer);
        const h: any = Object.create(api);
        for (const n of ["upload", "remove", "createSignedUrl",
                         "createSignedUrls", "getPublicUrl", "info", "exists"]) {
          if (typeof api[n] === "function") h[n] = (pf: unknown, ...r: unknown[]) => api[n](immoViele(pf), ...r);
        }
        // Lesen in drei Stufen: die Datei des Mandanten, sonst die der
        // Plattform, sonst — bei einer Schrift — einmal von der Quelle.
        // Geschrieben wird dabei nur ins Wurzelverzeichnis und nur eine
        // Schrift; Mandantendateien kann diese Stufe nicht anfassen.
        if (typeof api.download === "function") h.download = async (pf: unknown, ...r: unknown[]) => {
          const hole = async (p: unknown) => {
            try { return await api.download(p, ...r); } catch (e) { return { data: null, error: e }; }
          };
          const erst = await hole(immoViele(pf));
          if (erst?.data) return erst;
          if (typeof pf === "string" && immoMandant) {
            const zweit = await hole(pf);
            if (zweit?.data) return zweit;
          }
          if (eimer === "branding-assets" && typeof pf === "string" && IMMO_SCHRIFTEN[pf]) {
            try {
              const a = await fetch(IMMO_SCHRIFTEN[pf]);
              if (a.ok) {
                const roh = new Uint8Array(await a.arrayBuffer());
                try { await api.upload(pf, roh, { contentType: "font/ttf", upsert: true }); }
                catch (_e) { /* beim naechsten Mal wieder */ }
                console.log("Schrift nachgeladen:", pf, roh.byteLength);
                return { data: new Blob([roh]), error: null };
              }
            } catch (e) { console.warn("Schrift nicht erreichbar:", pf, String(e)); }
          }
          return erst;
        };
        if (typeof api.list === "function") {
          h.list = (pf?: string, ...r: unknown[]) => api.list(pf ? (immoVorne(pf) as string) : (immoMandant ?? pf), ...r);
        }
        for (const n of ["move", "copy"]) {
          if (typeof api[n] === "function") h[n] = (a: unknown, b: unknown, ...r: unknown[]) => api[n](immoVorne(a), immoVorne(b), ...r);
        }
        return h;
      };
    }

    const { data: profil } = await admin.from("profiles").select("*").eq("id", aktuellerUserId).maybeSingle();
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) {
      throw new Error("Nur Makler duerfen Signatur-Vorgaenge starten.");
    }

    const body = await req.json();
    immoSetzeMandant((await admin.from("profiles").select("mandant_id").eq("id", aktuellerUserId).maybeSingle()).data?.mandant_id);
    const vertragId = (body.vertrag_id || "").toString().trim();
    await immoMandantSichern(req, [["vertraege", vertragId], ["objektnachweise", vertragId]]);
    const dokumentTyp = (body.dokument_typ || "").toString().trim();
    const begleittext = (body.begleittext || "").toString();
    const mailBetreffCustom = (body.mail_betreff || "").toString().trim();
    const mailTextCustom = (body.mail_text || "").toString();
    const empfaengerEingabe: Array<{ name?: string; email?: string }> = Array.isArray(body.empfaenger) ? body.empfaenger : [];
    const verkaeuferEingabe: Array<{ name?: string; email?: string }> = Array.isArray(body.verkaeufer) ? body.verkaeufer : [];
    if (!vertragId) throw new Error("vertrag_id ist Pflicht.");
    if (!DOKUMENT_TYPEN.includes(dokumentTyp)) throw new Error("dokument_typ muss 'maklervertrag', 'vollmacht', 'objektnachweis' oder 'reservierung' sein.");

    // --- Credits reservieren, bevor der Vorgang entsteht ---------------
    // Erst hier, nicht frueher: eine Anfrage, die schon an der Form
    // scheitert, soll kein Reservieren-und-Freigeben im Ledger
    // hinterlassen. Und nicht spaeter: ab hier wird geschrieben,
    // hochgeladen und verschickt. Geprueft wird dabei auch das Abo —
    // ein gesperrter Mandant startet keinen Signaturvorgang.
    const abr = await kiAbrechnen(req, "signatur_vorgang", vertragId);
    if (!abr.ok) return abgelehnt(abr, corsHeaders);
    credits = abr;

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pruefe = (liste: Array<{ name?: string; email?: string }>, bezeichnung: string, pflicht: boolean) => {
      const p = liste
        .map(e => ({ name: (e.name || "").toString().trim(), email: (e.email || "").toString().trim().toLowerCase() }))
        .filter(e => e.email || e.name);
      if (p.length === 0) {
        if (pflicht) throw new Error(`Bitte mindestens eine Person unter "${bezeichnung}" mit Name und E-Mail-Adresse angeben.`);
        return p;
      }
      const ohneName = p.find(x => !x.name || x.name.length < 2);
      if (ohneName) throw new Error(`Bitte f\u00fcr jede Person unter "${bezeichnung}" einen vollst\u00e4ndigen Namen angeben \u2014 der Name erscheint am Unterschriftsfeld.`);
      const ohneEmail = p.find(x => !x.email);
      if (ohneEmail) throw new Error(`Bitte f\u00fcr "${ohneEmail.name}" eine E-Mail-Adresse angeben.`);
      const ungueltig = p.find(x => !emailRe.test(x.email));
      if (ungueltig) throw new Error(`Ungueltige E-Mail-Adresse: ${ungueltig.email}`);
      return p;
    };

    const personen = pruefe(empfaengerEingabe, dokumentTyp === "objektnachweis" ? "K\u00e4ufer" : "Empf\u00e4nger", true);
    const verkaeufer = dokumentTyp === "objektnachweis" ? pruefe(verkaeuferEingabe, "Verk\u00e4ufer", false) : [];

    const doppelt = verkaeufer.find(v => personen.some(k => k.email === v.email));
    if (doppelt) throw new Error(`Die E-Mail-Adresse ${doppelt.email} ist gleichzeitig als K\u00e4ufer und als Verk\u00e4ufer eingetragen.`);

    const quelltabelle = QUELLTABELLE[dokumentTyp];
    const { data: vertrag, error: vErr } = await admin.from(quelltabelle).select("*").eq("id", vertragId).maybeSingle();
    if (vErr) throw vErr;
    if (!vertrag) throw new Error(dokumentTyp === "objektnachweis" ? "Objektnachweis nicht gefunden." : dokumentTyp === "reservierung" ? "Reservierungsvereinbarung nicht gefunden." : "Vertrag nicht gefunden.");

    // Firma-Stammdaten fuer Reservierungsvereinbarung
    let firma: any = null;
    if (dokumentTyp === "reservierung") {
      if (vertrag.absender_firma_id) {
        const { data } = await admin.from("firma_stammdaten").select("*").eq("id", vertrag.absender_firma_id).maybeSingle();
        firma = data;
      }
      if (!firma) {
        const { data } = await admin.from("firma_stammdaten").select("*")
          .eq("mandant_id", immoMandant).order("sortierung").limit(1).maybeSingle();
        firma = data;
      }
      if (!firma) throw new Error("Firma-Stammdaten fehlen.");

      // Die CI des Mandanten, sonst die der Plattform.
      const ciBlau = immoCiFarbe(firma.ci_primaer, CI.blau);
      const ciGold = immoCiFarbe(firma.ci_akzent, CI.gold);
      if (!vertrag.kaufpreis || !vertrag.reservierungsgebuehr_brutto || !vertrag.reservierungsdauer_bis) {
        throw new Error("Bitte zuerst Kaufpreis, Reservierungsgeb\u00fchr und Reservierungsdauer in der Vereinbarung ausf\u00fcllen.");
      }
    }

    const { data: bestehend } = await admin
      .from("signatur_vorgaenge")
      .select("id, status")
      .eq("vertrag_id", vertragId)
      .eq("dokument_typ", dokumentTyp)
      .in("status", ["offen", "wartet_kaeufer", "wartet_eigentuemer", "wartet_makler", "abgeschlossen"])
      .maybeSingle();
    if (bestehend) {
      throw new Error(
        bestehend.status === "abgeschlossen"
          ? "Dieses Dokument wurde bereits unterschrieben."
          : "Es laeuft bereits ein Signatur-Vorgang fuer dieses Dokument."
      );
    }

    const inklVollmacht = dokumentTyp === "maklervertrag" && !!vertrag.vollmacht_mitgenerieren;
    const wordLayout = dokumentTyp === "objektnachweis";

    // ---- Fonts + Logo laden ----
    const pdf = await PDFDocument.create();

    let fontRegular: any, fontBold: any, fontHeadline: any, fontSchreibschrift: any = null;
    let nutztCustomFonts = false;
    try {
      const [rRes, bRes, mRes, sRes] = await Promise.allSettled([
        admin.storage.from("branding-assets").download(FONT_MONTSERRAT_REGULAR),
        admin.storage.from("branding-assets").download(FONT_MONTSERRAT_BOLD),
        admin.storage.from("branding-assets").download(FONT_MARCELLUS),
        admin.storage.from("branding-assets").download(FONT_SCHREIBSCHRIFT),
      ]);
      if (rRes.status === "fulfilled" && rRes.value.data && bRes.status === "fulfilled" && bRes.value.data) {
        const fontkit = await ladeFontkit();
        if (fontkit) {
          pdf.registerFontkit(fontkit);
          fontRegular = await pdf.embedFont(await rRes.value.data.arrayBuffer(), { subset: false });
          fontBold = await pdf.embedFont(await bRes.value.data.arrayBuffer(), { subset: false });
          fontHeadline = (mRes.status === "fulfilled" && mRes.value.data)
            ? await pdf.embedFont(await mRes.value.data.arrayBuffer(), { subset: false })
            : fontBold;
          if (sRes.status === "fulfilled" && sRes.value.data) {
            try {
              fontSchreibschrift = await pdf.embedFont(await sRes.value.data.arrayBuffer(), { subset: false });
            } catch (se) { console.warn("Schreibschrift konnte nicht eingebettet werden:", se); }
          }
          nutztCustomFonts = true;
        }
      }
    } catch (e) {
      console.warn("Font-Einbettung fehlgeschlagen, falle auf Helvetica zurueck:", e);
    }
    if (!nutztCustomFonts) {
      fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
      fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      fontHeadline = fontBold;
    }
    const fix = (s: string) => sanitizeGlyphs(s);

    let embeddedLogo: any = null;
    try {
      const { data: logoBlob } = await admin.storage.from("branding-assets").download(LOGO_PFAD);
      if (logoBlob) embeddedLogo = await pdf.embedPng(await logoBlob.arrayBuffer());
    } catch (e) { console.warn("Logo-Einbettung fehlgeschlagen:", e); }

    // Vorunterzeichnete Makler-Signatur: Bild bevorzugt, sonst Schreibschrift.
    let maklerSignatur: any = null;
    for (const pfad of MAKLER_SIGNATUR_PFADE) {
      try {
        const { data: sigBlob } = await admin.storage.from("branding-assets").download(pfad);
        if (sigBlob) {
          maklerSignatur = await pdf.embedPng(await sigBlob.arrayBuffer());
          break;
        }
      } catch (_e) { /* naechsten Pfad probieren */ }
    }
    if (!maklerSignatur) console.warn("Kein Makler-Signaturbild gefunden \u2014 verwende Schreibschrift-Fallback.");

    const standort = await immoStandort(admin, vertrag.mandant_id, vertrag.standort);
    // Ein Dokument, das unterschrieben werden soll, braucht einen
    // Aussteller. Fehlt er, entsteht kein Vorgang.
    if (!standort.firma || !standort.vertreter) {
      return antwort({ ok: false, fehler: "Fuer diesen Mandanten fehlen Firmenname oder Geschaeftsfuehrer in den Stammdaten. Ohne beides wird kein Signaturvorgang gestartet." }, 400);
    }
    const titel = dokumentTyp === "maklervertrag"
      ? (inklVollmacht ? "Maklervertrag & Vollmacht" : "Maklervertrag")
      : dokumentTyp === "objektnachweis"
      ? "Objektnachweis"
      : dokumentTyp === "reservierung"
      ? "Reservierungsvereinbarung"
      : "Vollmacht";

    // ---- Seiten-Flow-Renderer ----
    const margin = wordLayout ? 62 : 50;
    const pageWidth = PageSizes.A4[0];
    const pageHeight = PageSizes.A4[1];
    const maxTextWidth = pageWidth - 2 * margin;
    const kopfAbstand = 44;
    let pageIndex = 0;
    let page = pdf.addPage(PageSizes.A4);
    let y = pageHeight - margin;
    let frischeSeite = true;

    const zeichneKopf = () => {
      if (!embeddedLogo) return;
      const logoH = wordLayout ? 30 : 40;
      const logoW = logoH * (embeddedLogo.width / embeddedLogo.height);
      page.drawImage(embeddedLogo, {
        x: pageWidth - margin - logoW,
        y: pageHeight - margin - logoH + (wordLayout ? 0 : 10),
        width: logoW, height: logoH,
      });
    };

    const neueSeite = () => {
      page = pdf.addPage(PageSizes.A4);
      pageIndex++;
      y = pageHeight - margin;
      frischeSeite = true;
      if (wordLayout) {
        zeichneKopf();
        if (embeddedLogo) y = pageHeight - margin - kopfAbstand;
      }
    };

    const seitenumbruch = () => { if (!frischeSeite) neueSeite(); };

    const fontKey = new Map<any, string>();
    let fontKeyZaehler = 0;
    const widthCache = new Map<string, number>();
    const sicherBreite = (font: any, text: string, size: number): number => {
      try {
        return font.widthOfTextAtSize(text, size);
      } catch (_e) {
        return font.widthOfTextAtSize(asciiFallback(text), size);
      }
    };
    const wortBreite = (font: any, wort: string, size: number): number => {
      let fk = fontKey.get(font);
      if (!fk) { fk = String(++fontKeyZaehler); fontKey.set(font, fk); }
      const key = `${fk}|${size}|${wort}`;
      let w = widthCache.get(key);
      if (w === undefined) {
        w = sicherBreite(font, wort, size);
        widthCache.set(key, w);
      }
      return w;
    };

    const drawSicher = (text: string, opts: any) => {
      try {
        page.drawText(text, opts);
      } catch (e) {
        console.warn("drawText fehlgeschlagen, verwende ASCII-Fallback:", e);
        try { page.drawText(asciiFallback(text), opts); } catch (_e2) { /* aufgeben */ }
      }
    };

    const wrapText = (text: string, font: any, size: number, maxWidth: number): string[] => {
      const words = (text || "").split(/\s+/).filter(Boolean);
      const spaceW = wortBreite(font, " ", size);
      const lines: string[] = [];
      let current: string[] = [];
      let currentW = 0;
      for (const w of words) {
        const wW = wortBreite(font, w, size);
        if (current.length > 0 && currentW + spaceW + wW > maxWidth) {
          lines.push(current.join(" "));
          current = [w];
          currentW = wW;
        } else {
          currentW = current.length > 0 ? currentW + spaceW + wW : wW;
          current.push(w);
        }
      }
      if (current.length > 0) lines.push(current.join(" "));
      return lines;
    };

    const drawBlocksatz = (line: string, font: any, size: number, x: number, yy: number, maxWidth: number, color: any) => {
      const words = line.split(" ").filter(Boolean);
      if (words.length < 2) { drawSicher(line, { x, y: yy, size, font, color }); return; }
      const wortSumme = words.reduce((s, w) => s + wortBreite(font, w, size), 0);
      const spaceW = wortBreite(font, " ", size);
      const luecke = (maxWidth - wortSumme) / (words.length - 1);
      if (luecke <= 0 || luecke > spaceW * 2.8) { drawSicher(line, { x, y: yy, size, font, color }); return; }
      let cx = x;
      for (const w of words) {
        drawSicher(w, { x: cx, y: yy, size, font, color });
        cx += wortBreite(font, w, size) + luecke;
      }
    };

    // Erste Seite: Kopf
    if (wordLayout) {
      zeichneKopf();
      if (embeddedLogo) y = pageHeight - margin - kopfAbstand;
    } else if (embeddedLogo) {
      const logoH = 40;
      const logoW = logoH * (embeddedLogo.width / embeddedLogo.height);
      page.drawImage(embeddedLogo, { x: pageWidth - margin - logoW, y: y - logoH + 10, width: logoW, height: logoH });
    }

    const drawAbsaetze = (liste: Absatz[]) => {
      for (const abs of liste) {
        if (abs.pageBreakBefore) seitenumbruch();
        const size = abs.size || (abs.heading ? (wordLayout ? 11 : 15) : 10);
        const font = abs.bold || abs.heading ? fontBold : fontRegular;
        const color = (wordLayout || !abs.heading) ? CI.text : ciGold;
        const indent = abs.indent || 0;
        const lineHeight = size * (wordLayout ? 1.4 : 1.35);
        const textFixed = fix(abs.text);
        const breite = maxTextWidth - indent;
        const lines = textFixed === "" ? [""] : wrapText(textFixed, font, size, breite);
        if (wordLayout && abs.heading && !frischeSeite) y -= 6;
        const blocksatz = wordLayout && !abs.heading && !abs.bold && indent === 0 && lines.length > 1;
        lines.forEach((line, li) => {
          if (y < margin + lineHeight + (wordLayout ? 18 : 0)) neueSeite();
          const letzte = li === lines.length - 1;
          if (blocksatz && !letzte) {
            drawBlocksatz(line, font, size, margin + indent, y, breite, color);
          } else {
            drawSicher(line, { x: margin + indent, y, size, font, color });
          }
          frischeSeite = false;
          y -= lineHeight;
        });
        y -= (abs.spaceAfter !== undefined ? abs.spaceAfter : (wordLayout ? 6 : 4));
      }
    };

    // ---- Unterschriftsfelder ----
    const unterschriftPositionen: Array<{ dokument: string; rolle: string; email: string; name: string; seite: number; x: number; y: number; breite: number; hoehe: number }> = [];
    const rollenLabel = (dokument: string, rolle: string) => {
      if (rolle === "makler") return "Makler";
      if (rolle === "kaeufer") return "K\u00e4ufer";
      if (dokument === "objektnachweis") return "Verk\u00e4ufer";
      return "Auftraggeber";
    };
    const feldHoehe = wordLayout ? 90 : 55;
    // Platz unter der Linie: Namenszeile (-13) + Zeitstempel (-27) -> 34 + Luft
    const unterBlock = wordLayout ? 50 : 45;
    const drawUnterschriftenFelder = (dokument: string, unterzeichner: Array<{ name: string; email: string; rolle: string }>) => {
      const blockHoehe = feldHoehe + unterBlock;
      const benoetigt = 40 + Math.ceil(unterzeichner.length / 2) * blockHoehe;
      if (y < margin + benoetigt) neueSeite();
      y -= 14;
      drawSicher(fix("Unterschriften"), {
        x: margin, y, size: wordLayout ? 11 : 13,
        font: wordLayout ? fontBold : fontHeadline,
        color: wordLayout ? CI.text : ciBlau,
      });
      frischeSeite = false;
      y -= (wordLayout ? 18 : 10);
      const feldBreite = (maxTextWidth - 24) / 2;
      const startY = y;
      let maxRow = 0;
      unterzeichner.forEach((u, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        maxRow = Math.max(maxRow, row);
        const bx = margin + col * (feldBreite + 24);
        const boxTop = startY - row * blockHoehe;
        const boxBottom = boxTop - feldHoehe;
        if (wordLayout) {
          page.drawLine({
            start: { x: bx, y: boxBottom },
            end: { x: bx + feldBreite, y: boxBottom },
            thickness: 0.8, color: CI.mittelGrau,
          });
        } else {
          page.drawRectangle({ x: bx, y: boxBottom, width: feldBreite, height: feldHoehe, borderColor: CI.mittelGrau, borderWidth: 0.8, color: rgb(1, 1, 1) });
        }
        const label = `${u.name} (${rollenLabel(dokument, u.rolle)})`;
        drawSicher(fix(label), { x: bx, y: boxBottom - 13, size: 9, font: fontRegular, color: CI.dunkelGrau });
        unterschriftPositionen.push({ dokument, rolle: u.rolle, email: u.email, name: u.name, seite: pageIndex, x: bx, y: boxBottom, breite: feldBreite, hoehe: feldHoehe });
      });
      y = startY - maxRow * blockHoehe - feldHoehe - unterBlock;
    };

    // ---- Makler: IMMER vorunterzeichnet (Bild, sonst Schreibschrift) ----
    const drawMaklerVorunterzeichnet = () => {
      if (y < margin + feldHoehe + 80) neueSeite();
      y -= 6;
      drawSicher(fix("F\u00fcr den Makler"), {
        x: margin, y, size: 11,
        font: wordLayout ? fontBold : fontHeadline,
        color: wordLayout ? CI.text : ciBlau,
      });
      frischeSeite = false;
      y -= (wordLayout ? 16 : 8);
      const feldBreite = (maxTextWidth - 24) / 2;
      const boxBottom = y - feldHoehe;
      if (wordLayout) {
        page.drawLine({
          start: { x: margin, y: boxBottom },
          end: { x: margin + feldBreite, y: boxBottom },
          thickness: 0.8, color: CI.mittelGrau,
        });
      } else {
        page.drawRectangle({ x: margin, y: boxBottom, width: feldBreite, height: feldHoehe, borderColor: CI.mittelGrau, borderWidth: 0.8, color: rgb(1, 1, 1) });
      }

      if (maklerSignatur) {
        const pad = 6;
        const maxW = feldBreite - 2 * pad;
        const maxH = feldHoehe - 2 * pad;
        const scale = Math.min(maxW / maklerSignatur.width, maxH / maklerSignatur.height);
        page.drawImage(maklerSignatur, {
          x: margin + pad, y: boxBottom + pad,
          width: maklerSignatur.width * scale, height: maklerSignatur.height * scale,
        });
      } else {
        // Fallback: Name in Schreibschrift auf die Linie setzen.
        const sigFont = fontSchreibschrift || fontHeadline || fontBold;
        let sigSize = 30;
        while (sigSize > 14 && sicherBreite(sigFont, standort.vertreter, sigSize) > feldBreite - 16) sigSize -= 1;
        drawSicher(standort.vertreter, {
          x: margin + 8, y: boxBottom + 10, size: sigSize, font: sigFont, color: ciBlau,
        });
      }

      const heute = new Date().toLocaleDateString("de-DE");
      drawSicher(fix(`${standort.vertreter} (Makler)`), {
        x: margin, y: boxBottom - 13, size: 9, font: fontRegular, color: CI.dunkelGrau,
      });
      drawSicher(fix(`${standort.name} \u00b7 ${standort.firma} \u2014 vorunterzeichnet am ${heute}`), {
        x: margin, y: boxBottom - 27, size: 9, font: fontRegular, color: CI.dunkelGrau,
      });
      y = boxBottom - 48;
    };

    const auftraggeberRolle = dokumentTyp === "objektnachweis" ? "kaeufer"
      : dokumentTyp === "reservierung" ? "kaeufer"
      : "eigentuemer";
    const auftraggeberUnterzeichner = personen.map(p => ({ name: p.name, email: p.email, rolle: auftraggeberRolle }));
    const verkaeuferUnterzeichner = verkaeufer.map(p => ({ name: p.name, email: p.email, rolle: "eigentuemer" }));
    const maklerUnterzeichner = { name: profil.name || "Makler", email: (profil.email || "").toLowerCase(), rolle: "makler" };

    if (dokumentTyp === "maklervertrag") {
      drawAbsaetze(buildMaklervertragAbsaetze(vertrag, standort));
      drawUnterschriftenFelder("maklervertrag", [...auftraggeberUnterzeichner, maklerUnterzeichner]);
      if (inklVollmacht) {
        neueSeite();
        drawAbsaetze(buildVollmachtAbsaetze(vertrag, standort));
        drawUnterschriftenFelder("vollmacht", auftraggeberUnterzeichner);
      }
    } else if (dokumentTyp === "vollmacht") {
      drawAbsaetze(buildVollmachtAbsaetze(vertrag, standort));
      drawUnterschriftenFelder("vollmacht", auftraggeberUnterzeichner);
    } else if (dokumentTyp === "reservierung") {
      drawAbsaetze(buildReservierungAbsaetze(vertrag, firma));
      drawUnterschriftenFelder("reservierung", [...auftraggeberUnterzeichner, maklerUnterzeichner]);
    } else {
      // Objektnachweis (Word-Layout):
      //   Nachweis + Reservierung -> UNTERSCHRIFTEN -> Anlage 1 Widerruf
      //   -> Anlage 2 Musterformular -> Anlage 3 AGB
      drawAbsaetze(buildObjektnachweisHauptteil(vertrag, standort, verkaeufer.map(v => v.name)));
      drawUnterschriftenFelder("objektnachweis", [...auftraggeberUnterzeichner, ...verkaeuferUnterzeichner]);
      drawMaklerVorunterzeichnet();
      drawAbsaetze(buildObjektnachweisWiderruf(standort));
      drawAbsaetze(buildObjektnachweisAgb(standort));
    }

    // ---- Fusszeile mit Seitenzahl (nur Word-Layout) ----
    if (wordLayout) {
      const alleSeiten = pdf.getPages();
      alleSeiten.forEach((p: any, i: number) => {
        const t = `Seite ${i + 1} von ${alleSeiten.length}`;
        const w = sicherBreite(fontRegular, t, 8);
        try {
          p.drawText(t, { x: (pageWidth - w) / 2, y: 30, size: 8, font: fontRegular, color: CI.mittelGrau });
        } catch (_e) { /* Fusszeile ist optional */ }
      });
    }

    const pdfBytes = await pdf.save();
    const hash = await sha256Hex(pdfBytes);

    // ---- signatur_vorgang anlegen ----
    const jetzt = new Date();
    const ablaufAm = new Date(jetzt.getTime() + GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000);
    const startStatus = dokumentTyp === "objektnachweis" ? "wartet_kaeufer" : "wartet_eigentuemer";

    const { data: vorgang, error: vorgangErr } = await admin.from("signatur_vorgaenge").insert({
      created_by: aktuellerUserId,
      vertrag_id: vertragId,
      dokument_typ: dokumentTyp,
      status: startStatus,
      versendet_am: jetzt.toISOString(),
      ablauf_am: ablaufAm.toISOString(),
      begleittext: mailTextCustom.trim() ? mailTextCustom : begleittext,
      inkl_vollmacht: inklVollmacht,
      unterschrift_positionen: unterschriftPositionen,
    }).select().single();
    if (vorgangErr) throw new Error(`Vorgang konnte nicht angelegt werden: ${vorgangErr.message}`);

    const pdfPfad = `${vertragId}/signatur-${vorgang.id}-unsigned.pdf`;
    const { error: uploadErr } = await admin.storage.from("maklervertraege-pdf").upload(pdfPfad, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploadErr) throw new Error(`PDF-Upload fehlgeschlagen: ${uploadErr.message}`);

    await admin.from("signatur_vorgaenge").update({
      unsigned_pdf_pfad: pdfPfad,
      unsigned_pdf_hash: hash,
    }).eq("id", vorgang.id);

    await admin.from("signatur_events").insert({
      vorgang_id: vorgang.id, event_typ: "vorgang_erstellt",
      details: {
        dokument_typ: dokumentTyp, vertrag_id: vertragId, ersteller: profil.name,
        inkl_vollmacht: inklVollmacht, mail_text_angepasst: !!mailTextCustom.trim(),
        anzahl_kaeufer: personen.length, anzahl_verkaeufer: verkaeufer.length,
        verkaeufer_typ: vertrag.verkaeufer_typ || null,
        provisionsmodell: vertrag.provisionsmodell || null,
        makler_vorunterzeichnet: dokumentTyp === "objektnachweis",
        makler_signatur_bild: dokumentTyp === "objektnachweis" ? !!maklerSignatur : null,
        layout: wordLayout ? "word" : "standard",
      },
    });

    if (dokumentTyp === "reservierung") {
      await admin.from("reservierungen_neubau").update({ status: "versendet" })
        .eq("id", vertragId).eq("status", "entwurf");
    }

    const empfaengerEintraege: any[] = personen.map((p: any) => ({
      vorgang_id: vorgang.id,
      email: p.email,
      anzeigename: p.name || p.email,
      rolle: auftraggeberRolle,
      reihenfolge: 1,
      status: "eingeladen",
      eingeladen_am: jetzt.toISOString(),
    }));

    for (const v of verkaeuferUnterzeichner) {
      empfaengerEintraege.push({
        vorgang_id: vorgang.id,
        email: v.email,
        anzeigename: v.name || v.email,
        rolle: "eigentuemer",
        reihenfolge: 2,
        status: "wartend",
        eingeladen_am: null,
      });
    }

    if (dokumentTyp === "maklervertrag" || dokumentTyp === "reservierung") {
      empfaengerEintraege.push({
        vorgang_id: vorgang.id,
        user_id: aktuellerUserId,
        email: profil.email || "",
        anzeigename: profil.name || "Makler",
        rolle: "makler",
        reihenfolge: 2,
        status: "wartend",
        eingeladen_am: null,
      });
    }

    const { data: createdEmpfaenger, error: empfErr } = await admin
      .from("signatur_empfaenger")
      .insert(empfaengerEintraege)
      .select();
    if (empfErr) throw new Error(`Empfaenger konnten nicht angelegt werden: ${empfErr.message}`);

    const { data: postfach } = await admin
      .from("mail_postfaecher")
      .select("id")
      .eq("benutzer_id", aktuellerUserId)
      .eq("aktiv", true)
      .order("standard_zum_senden", { ascending: false })
      .order("ist_standard", { ascending: false })
      .limit(1)
      .maybeSingle();

    const reihenfolge1 = (createdEmpfaenger || []).filter((e: any) => e.reihenfolge === 1);
    let versandFehler = 0;

    const objektText = dokumentTyp === "reservierung"
      ? ([vertrag.projektname, vertrag.wohneinheit_nr].filter(Boolean).join(" ") || objektAdresseVon(vertrag) || "Ihre Immobilie")
      : (objektAdresseVon(vertrag) || vertrag.objekt_bezeichnung || "Ihre Immobilie");
    const belehrungsHinweis = (dokumentTyp === "vollmacht" || dokumentTyp === "reservierung")
      ? "- Bitte lesen Sie das Dokument vollst\u00e4ndig, bevor Sie unterschreiben."
      : "- Bitte lesen Sie das Dokument einschlie\u00dflich der Widerrufsbelehrung vollst\u00e4ndig, bevor Sie unterschreiben.";
    const artikelAkk = dokumentTyp === "reservierung" ? "die" : "den";
    const artikelPoss = dokumentTyp === "reservierung" ? "Ihre" : "Ihr";

    const absenderName = dokumentTyp === "reservierung" && firma ? firma.firma_name : `${standort.name}\n${standort.firma}`;
    const absenderAdresse = dokumentTyp === "reservierung" && firma
      ? `${firma.strasse ? firma.strasse + "\n" : ""}${firma.plz || ""} ${firma.ort || ""}`.trim()
      : `${standort.strasse ? standort.strasse + "\n" : ""}${standort.plzOrt}`;

    const abschlussHinweis = (dokumentTyp === "objektnachweis" && verkaeufer.length > 0)
      ? `- Nach Ihrer Unterschrift wird das Dokument der Verk\u00e4uferseite zur Gegenzeichnung vorgelegt. Sobald alle unterschrieben haben, erhalten Sie das fertige PDF automatisch per E-Mail.\n`
      : `- Nach Unterzeichnung durch alle Beteiligten erhalten Sie das fertige Dokument automatisch als PDF per E-Mail.\n`;

    const standardMailText = `Guten Tag [Name],\n\n`
      + `anbei erhalten Sie ${artikelAkk} ${titel} f\u00fcr ${objektText} zur elektronischen Unterschrift.\n\n`
      + `\u00dcber Ihren pers\u00f6nlichen Link k\u00f6nnen Sie das Dokument in Ruhe vollst\u00e4ndig lesen und anschlie\u00dfend direkt online unterschreiben:\n\n`
      + `[Link]\n\n`
      + (begleittext ? `${begleittext}\n\n` : "")
      + `Wichtige Hinweise:\n`
      + `- Der Link ist ${GUELTIGKEIT_TAGE} Tage g\u00fcltig und ausschlie\u00dflich f\u00fcr Sie bestimmt. Bitte leiten Sie ihn nicht weiter.\n`
      + `${belehrungsHinweis}\n`
      + abschlussHinweis
      + `\nF\u00fcr R\u00fcckfragen stehen wir Ihnen selbstverst\u00e4ndlich gerne zur Verf\u00fcgung.\n\n`
      + `Mit freundlichen Gr\u00fc\u00dfen\n${profil.name}\n\n`
      + `${absenderName}\n${absenderAdresse}`;

    const mailVorlage = mailTextCustom.trim() ? mailTextCustom : standardMailText;
    const betreffVorlage = mailBetreffCustom
      || `${artikelPoss} ${titel} zur elektronischen Unterschrift \u2013 ${dokumentTyp === "reservierung" ? objektText : (vertrag.objekt_bezeichnung || objektAdresseVon(vertrag) || "")}`;

    if (!postfach) {
      for (const e of reihenfolge1) {
        await admin.from("signatur_events").insert({
          vorgang_id: vorgang.id, empfaenger_id: e.id, event_typ: "mail_fehlgeschlagen",
          details: { email: e.email, error: "Kein aktives Mail-Postfach fuer diesen Nutzer gefunden." },
        });
        versandFehler++;
      }
    } else {
      for (const e of reihenfolge1) {
        const link = `${PORTAL_URL}/?signatur=${e.token}`;
        const betreff = betreffVorlage.split("[Name]").join(e.anzeigename);
        let text = mailVorlage.split("[Name]").join(e.anzeigename);
        text = text.includes("[Link]")
          ? text.split("[Link]").join(link)
          : `${text}\n\nIhr pers\u00f6nlicher Signatur-Link:\n${link}`;

        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/mail-senden`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": authHeader,
              "apikey": Deno.env.get("SUPABASE_ANON_KEY")!,
            },
            body: JSON.stringify({ postfach_id: postfach.id, an: e.email, an_name: e.anzeigename, betreff, text }),
          });
          const mailData = await resp.json();
          if (!mailData.ok) throw new Error(mailData.error || "unbekannter Mail-Fehler");
          await admin.from("signatur_events").insert({
            vorgang_id: vorgang.id, empfaenger_id: e.id, event_typ: "mail_gesendet",
            details: { email: e.email, mail_text_angepasst: !!mailTextCustom.trim() },
          });
        } catch (mailErr) {
          console.error(`Mail an ${e.email} fehlgeschlagen:`, mailErr);
          await admin.from("signatur_events").insert({
            vorgang_id: vorgang.id, empfaenger_id: e.id, event_typ: "mail_fehlgeschlagen",
            details: { email: e.email, error: String(mailErr instanceof Error ? mailErr.message : mailErr) },
          });
          versandFehler++;
        }
      }
    }

    // Gebucht wird erst, wenn der Vorgang steht und die Links heraus
    // sind. Ein Anbieterpreis faellt hier nicht an — die Signatur ist
    // eigene Leistung, keine eingekaufte.
    await abr.buchen(null, dokumentTyp);

    return jsonResponse({
      ok: true,
      credits: abr.credits,
      vorgang_id: vorgang.id,
      empfaenger_anzahl: empfaengerEintraege.length,
      kaeufer_anzahl: personen.length,
      verkaeufer_anzahl: verkaeufer.length,
      makler_vorunterzeichnet: dokumentTyp === "objektnachweis",
      makler_signatur_quelle: dokumentTyp === "objektnachweis" ? (maklerSignatur ? "bild" : "schreibschrift") : null,
      layout: wordLayout ? "word" : "standard",
      mail_versand_fehler: versandFehler,
      pdf_pfad: pdfPfad,
      inkl_vollmacht: inklVollmacht,
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("signatur-vorgang-starten:", meldung);
    // Was reserviert war, geht zurueck. CLAUDE.md: fehlgeschlagene
    // Auftraege geben reservierte Credits automatisch frei.
    if (credits) await credits.freigeben("Abbruch: " + meldung);
    return jsonResponse({ ok: false, error: meldung });
  }
});
