// ============================================================================
// vertrag-pdf (v2)
//   Layout an die Word-Vorlage angeglichen, damit PDF- und Word-Download
//   identisch aussehen:
//   - Durchgehend schwarzer Text, einheitliche Schriftgroesse (10pt),
//     Ueberschriften fett in gleicher Groesse (kein Gold, keine Grosstitel)
//   - Blocksatz wie in Word (Woerter werden je Zeile auf die volle Breite
//     verteilt; letzte Zeile eines Absatzes linksbuendig)
//   - Logo oben rechts auf JEDER Seite
//   - Seitenumbruch vor Widerrufsbelehrung, Muster-Widerrufsformular und AGB
//   - Unterschriften als Linien mit Beschriftung (Ort/Datum + Firmenblock/
//     Unterschrift Verkaeufer) statt Kaesten — wie im Word-Dokument
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

let fontkitPromise: Promise<any> | null = null;
function ladeFontkit(): Promise<any> {
  if (!fontkitPromise) {
    fontkitPromise = import("npm:@pdf-lib/fontkit@1.1.1")
      .then((mod) => mod.default || mod)
      .catch(() => null);
  }
  return fontkitPromise;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FONT_MONTSERRAT_REGULAR = "fonts/Montserrat-Regular.ttf";
const FONT_MONTSERRAT_BOLD    = "fonts/Montserrat-Bold.ttf";
const LOGO_PFAD               = "logo.png";

const SCHWARZ = rgb(0.05, 0.05, 0.05);
const GRAU = rgb(0.45, 0.45, 0.45);

function sanitizeGlyphs(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/•/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, "\"")
    .replace(/[\u2013\u2014]/g, "-");
}
function asciiFallback(s: string): string {
  return s.replace(/[^\x20-\x7EäöüÄÖÜß€§]/g, "");
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

// Die Vorlage trug die drei Standorte der Referenz hier als Tabelle. Sie ist
// beim Neutralisieren geleert worden, und damit entstand der Maklervertrag
// OHNE Briefkopf (docs/OFFEN.md, Punkt 3). Jetzt kommen die Werte aus
// firma_stammdaten des Mandanten, dem der Vertrag gehoert.
//
// vertreter: der gesetzliche Vertreter, der den Vertrag zeichnet. Hier stand
// ein ERFUNDENER Name — in einem Maklervertrag, in der Zustimmungsklausel
// ("vertreten durch ...") und unter der Unterschrift. CLAUDE.md verbietet
// erfundene Daten; ein erfundener Vertreter in einem Vertrag ist davon der
// schwerste Fall.
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

function formatMoneyDE(v: string | number): string {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[.\s€]/g, "").replace(",", "."));
  if (isNaN(n)) return String(v);
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";
}

function verkaeuferZeilen(vertrag: any): { titel: string; zeilen: string[] } {
  if (vertrag.verkaeufer_typ === "erben" && Array.isArray(vertrag.erben) && vertrag.erben.length > 0) {
    const zeilen: string[] = [];
    vertrag.erben.forEach((e: any, idx: number) => {
      if (idx > 0) zeilen.push("");
      zeilen.push(e.name || "");
      if (e.strasse) zeilen.push(e.strasse);
      const plzOrt = `${e.plz || ""} ${e.ort || ""}`.trim();
      if (plzOrt) zeilen.push(plzOrt);
    });
    return { titel: "Erbengemeinschaft - bestehend aus:", zeilen };
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

// Absatz-Optionen: heading = fett (gleiche Groesse wie Fliesstext, wie Word);
// pageBreak = neue Seite vor diesem Absatz; noJustify = linksbuendig lassen.
type Absatz = { text: string; bold?: boolean; heading?: boolean; size?: number; spaceAfter?: number; spaceBefore?: number; indent?: number; pageBreak?: boolean; noJustify?: boolean };

function buildAgbAbsaetze(standort: ImmoStandort, mitSalvatorischerKlausel: boolean): Absatz[] {
  const a: Absatz[] = [];
  a.push({ text: "Allgemeine Geschäftsbedingungen", heading: true, pageBreak: true, spaceAfter: 8 });
  a.push({ text: "1. Geltungsbereich", bold: true, spaceAfter: 2 });
  a.push({ text: `Mit der Inanspruchnahme von Leistungen der ${standort.name}, ${standort.firma} (nachfolgend „Makler") erkennt der Empfänger eines Angebots (nachfolgend „Kunde") die nachfolgenden Allgemeinen Geschäftsbedingungen an.` });
  a.push({ text: "Die Inanspruchnahme von Leistungen liegt insbesondere vor, wenn der Kunde mit dem Makler wegen eines angebotenen Objekts Kontakt aufnimmt, Informationen oder Unterlagen (z. B. Exposé) anfordert oder Besichtigungen vereinbart." });
  a.push({ text: "Unsere Angebote sind freibleibend und unverbindlich. Ein Zwischenverkauf bleibt vorbehalten.", spaceAfter: 8 });
  a.push({ text: "2. Objektinformationen und Angebote", bold: true, spaceAfter: 2 });
  a.push({ text: "Die in unseren Angeboten, Exposés oder sonstigen Unterlagen enthaltenen Objektangaben beruhen auf Informationen, die uns vom Verkäufer, Eigentümer oder von Dritten zur Verfügung gestellt wurden." });
  a.push({ text: "Eine Gewähr für die Richtigkeit, Vollständigkeit und Aktualität dieser Angaben wird nicht übernommen. Der Makler ist nicht verpflichtet, die Angaben eigenständig zu überprüfen." });
  a.push({ text: "Angaben zur Lage oder möglichen Wertentwicklung beruhen gegebenenfalls auf öffentlich zugänglichen Quellen oder Markteinschätzungen und stellen keine Garantie für tatsächliche Entwicklungen dar." });
  a.push({ text: "Behördliche Auflagen können Einfluss auf Planung, Nutzungsmöglichkeiten oder Flächenangaben haben." });
  a.push({ text: "Darstellungen von Gebäuden, Visualisierungen oder Möblierungen können beispielhaften Charakter haben und dienen ausschließlich der Veranschaulichung." });
  a.push({ text: "Änderungen, Irrtümer und Zwischenverkauf bleiben vorbehalten.", spaceAfter: 8 });
  a.push({ text: "3. Kommunikationswege", bold: true, spaceAfter: 2 });
  a.push({ text: "Der Kunde willigt ein, dass der Makler ihn im Zusammenhang mit der Bearbeitung seiner Anfrage und der Vermittlung von Immobilien telefonisch, per E-Mail oder auf vergleichbaren Kommunikationswegen kontaktieren darf." });
  a.push({ text: "Eine Nutzung der Kontaktdaten zu anderen Zwecken erfolgt nur im Rahmen der gesetzlichen Bestimmungen oder mit gesonderter Einwilligung des Kunden." });
  a.push({ text: "Die Einwilligung kann jederzeit mit Wirkung für die Zukunft widerrufen werden.", spaceAfter: 8 });
  a.push({ text: "4. Haftung für die Bonität von Vertragsparteien", bold: true, spaceAfter: 2 });
  a.push({ text: "Der Makler übernimmt keine Haftung für die Bonität der vermittelten Vertragsparteien.", spaceAfter: 8 });
  a.push({ text: "5. Provision", bold: true, spaceAfter: 2 });
  a.push({ text: "Mit Abschluss eines notariellen Kaufvertrages über das nachgewiesene oder vermittelte Objekt entsteht ein Provisionsanspruch des Maklers." });
  a.push({ text: "Sofern im Angebot oder Exposé nichts Abweichendes angegeben ist, beträgt die Käuferprovision 3,57 % des notariell beurkundeten Kaufpreises einschließlich gesetzlicher Mehrwertsteuer." });
  a.push({ text: "Der Makler ist berechtigt, sowohl für den Verkäufer als auch für den Käufer entgeltlich tätig zu werden, soweit dies gesetzlich zulässig ist.", spaceAfter: 8 });
  a.push({ text: "6. Wirtschaftlich gleichwertige Geschäfte", bold: true, spaceAfter: 2 });
  a.push({ text: "Der Provisionsanspruch entsteht auch, wenn anstelle eines Kaufvertrages ein wirtschaftlich gleichwertiges Geschäft zustande kommt, das im Zusammenhang mit dem vom Makler nachgewiesenen oder vermittelten Objekt steht, insbesondere: Erwerb im Wege der Zwangsversteigerung, Erwerb von Gesellschaftsanteilen an einer objektbesitzenden Gesellschaft, sonstige wirtschaftlich vergleichbare Erwerbsvorgänge.", spaceAfter: 8 });
  a.push({ text: "7. Vorkenntnis", bold: true, spaceAfter: 2 });
  a.push({ text: "Ist dem Kunden das vom Makler nachgewiesene Objekt bereits bekannt, hat er dies dem Makler unverzüglich, spätestens innerhalb von fünf Kalendertagen nach Zugang des Objektnachweises, unter Angabe der Quelle schriftlich oder in Textform mitzuteilen." });
  a.push({ text: "Unterbleibt ein entsprechender Hinweis, kann sich der Kunde auf eine Vorkenntnis nicht berufen.", spaceAfter: 8 });
  a.push({ text: "8. Weitergabe von Informationen", bold: true, spaceAfter: 2 });
  a.push({ text: "Die vom Makler übermittelten Informationen, Unterlagen und Objektangaben sind ausschließlich für den Kunden bestimmt. Eine Weitergabe an Dritte ist nur mit vorheriger Zustimmung des Maklers zulässig." });
  a.push({ text: "Gibt der Kunde die Informationen unberechtigt an Dritte weiter und kommt aufgrund dieser Weitergabe ein Kaufvertrag über das Objekt zustande, ist der Kunde verpflichtet, dem Makler den hierdurch entstehenden Provisionsschaden zu ersetzen.", spaceAfter: 8 });
  a.push({ text: "9. Datenschutz", bold: true, spaceAfter: 2 });
  a.push({ text: "Die Erhebung, Speicherung und Verarbeitung personenbezogener Daten erfolgt im Rahmen der gesetzlichen Datenschutzbestimmungen." });
  if (standort.datenschutz) a.push({ text: `Weitere Informationen zur Datenverarbeitung sind in den Datenschutzhinweisen des Maklers abrufbar unter: ${standort.datenschutz}`, spaceAfter: 8 });
  a.push({ text: "10. Haftungsbeschränkung", bold: true, spaceAfter: 2 });
  a.push({ text: "Der Makler haftet für Schäden des Kunden nur bei Vorsatz oder grober Fahrlässigkeit." });
  a.push({ text: "Bei einfacher Fahrlässigkeit haftet der Makler nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) und beschränkt auf den vertragstypischen, vorhersehbaren Schaden." });
  a.push({ text: "Die Haftungsbeschränkung gilt nicht bei Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie bei Ansprüchen nach dem Produkthaftungsgesetz.", spaceAfter: 8 });
  a.push({ text: "11. Verjährung", bold: true, spaceAfter: 2 });
  a.push({ text: "Schadensersatzansprüche des Kunden gegen den Makler verjähren innerhalb der gesetzlichen Verjährungsfristen.", spaceAfter: 8 });
  a.push({ text: "12. Gerichtsstand und anwendbares Recht", bold: true, spaceAfter: 2 });
  a.push({ text: "Es gilt das Recht der Bundesrepublik Deutschland." });
  a.push({ text: "Ist der Kunde Kaufmann, eine juristische Person des öffentlichen Rechts oder ein öffentlich-rechtliches Sondervermögen, ist Gerichtsstand für alle Streitigkeiten aus dem Vertragsverhältnis der Sitz des Maklers.", spaceAfter: 8 });
  if (mitSalvatorischerKlausel) {
    a.push({ text: "13. Salvatorische Klausel", bold: true, spaceAfter: 2 });
    a.push({ text: "Sollten einzelne Bestimmungen dieser Allgemeinen Geschäftsbedingungen ganz oder teilweise unwirksam oder undurchführbar sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen hiervon unberührt." });
    a.push({ text: "Anstelle der unwirksamen Bestimmung gelten die gesetzlichen Vorschriften." });
  }
  return a;
}

function buildMaklervertragAbsaetze(vertrag: any, standort: ImmoStandort): Absatz[] {
  const { titel: verkTitel, zeilen: verkZeilen } = verkaeuferZeilen(vertrag);
  const preis = vertrag.angebotspreis ? formatMoneyDE(vertrag.angebotspreis) : "____________________________";
  const laufzeit = vertrag.laufzeit_monate || "6";
  const provision = vertrag.provision || "3,57";
  const vermittlungText = vertrag.vertragsart === "vermietung"
    ? "Der Verkäufer beauftragt den Immobilienmakler mit der Vermittlung der Vermietung der Immobilie:"
    : "Der Verkäufer beauftragt den Immobilienmakler mit der Vermittlung der Immobilie:";
  const objektZeile = `${vertrag.objekt_bezeichnung ? vertrag.objekt_bezeichnung + " - " : ""}${objektAdresseVon(vertrag)}`;
  const eigentumAllein = vertrag.eigentum !== "mit";
  const verbraucherJa = vertrag.verbraucher !== "nein";

  const a: Absatz[] = [];
  a.push({ text: "Maklervertrag", heading: true, spaceAfter: 14 });

  a.push({ text: "Zwischen", bold: true, noJustify: true });
  if (verkTitel) a.push({ text: verkTitel, noJustify: true });
  verkZeilen.forEach(z => a.push({ text: z, noJustify: true }));
  a.push({ text: "- Verkäufer -", noJustify: true, spaceAfter: 8 });
  a.push({ text: "und", bold: true, noJustify: true });
  a.push({ text: standort.name, noJustify: true });
  a.push({ text: standort.firma, noJustify: true });
  a.push({ text: standort.strasse, noJustify: true });
  a.push({ text: standort.plzOrt, noJustify: true });
  a.push({ text: "- Immobilienmakler -", noJustify: true, spaceAfter: 14 });

  a.push({ text: "1. Immobilie", heading: true, spaceAfter: 4 });
  a.push({ text: vermittlungText });
  a.push({ text: objektZeile, bold: true, noJustify: true });
  a.push({ text: "und für diesen tätig zu werden." });
  a.push({ text: `a. Als Angebotspreis wird für diese Immobilie festgesetzt: ${preis}` });
  a.push({ text: `b. Der Vertrag läuft zunächst für die Dauer von ${laufzeit} Monaten. Wird der Vertrag von dem Verkäufer nicht innerhalb einer Frist von vier Wochen gekündigt, verlängert sich der Maklervertrag um einen Monat. Die Kündigung des Vertrages bedarf der Textform.` });
  a.push({ text: "c. Dieser Maklervertrag gilt ab dem Tag und Datum der Unterzeichnung." });
  a.push({ text: "d. Zeiträume, in denen die Immobilie auf Wunsch des Auftraggebers nicht öffentlich vermarktet wird, hemmen die Laufzeit dieses Maklervertrages. Die Vertragslaufzeit verlängert sich entsprechend um die Dauer der ausgesetzten Vermarktung.", spaceAfter: 12 });

  a.push({ text: "2. Pflichten des Immobilienmaklers", heading: true, spaceAfter: 4 });
  a.push({ text: "a. Der Immobilienmakler verpflichtet sich, diesen Auftrag nachhaltig, intensiv und unter Einhaltung und Nutzung der bereitstehenden marktüblichen Vermarktungswege zu bearbeiten und die sich bietenden Abschlussgelegenheiten auszunutzen." });
  a.push({ text: "b. Der Immobilienmakler wird auf eigene Kosten Werbung für die Immobilie betreiben." });
  a.push({ text: "c. Der Immobilienmakler ist berechtigt, zur Förderung der Vermarktung mit Maklerkollegen zusammenzuarbeiten und Gemeinschaftsgeschäfte abzuschließen. Ein Anspruch des Verkäufers auf eine vorbezeichnete gemeinschaftliche Vermarktung besteht nicht. Der Verkäufer stimmt für diesen Fall der Weitergabe der Objektdaten und weiteren Daten der Immobilie zu." });
  a.push({ text: "d. Der Immobilienmakler wird nach den Vorgaben des Verkäufers die eingehenden Kaufangebote und Kaufinteressenten selektieren und die Konditionen, die diese zum Ankauf der Immobilie unterbreitet haben, an den Verkäufer weitergeben." });
  a.push({ text: "e. Der Immobilienmakler verpflichtet sich die Immobilie erst mit dem Einverständnis der Verkäufer öffentlich zu präsentieren (Online-Vermarktung über Immobilienportale).", spaceAfter: 12 });

  a.push({ text: "3. Zusagen und Pflichten des Verkäufers", heading: true, spaceAfter: 4 });
  a.push({ text: "a. Der Verkäufer ist" });
  a.push({ text: `${eigentumAllein ? "( x )" : "(   )"} alleiniger Eigentümer der Immobilie und als solcher im Grundbuch eingetragen.` });
  a.push({ text: `${eigentumAllein ? "(   )" : "( x )"} Mit-Eigentümer der Immobilie und sichert zu, von allen anderen Miteigentümern der Immobilie bevollmächtigt zu sein, diesen Maklervertrag abzuschließen. Der Verkäufer verpflichtet sich für den Fall, dass einer der Miteigentümer der Immobilie die erfolgreiche Arbeit des Immobilienmaklers vereiteln oder den Maklervertrag zurückziehen oder in der Durchführung unmöglich machen sollte, den dem Immobilienmakler daraus entstehenden Schaden zu ersetzen und für die Nichterfüllung der verkäuferseitigen Pflichten aus diesem Vertrag einzustehen.` });
  a.push({ text: "b. Der Verkäufer hat eine Vollmacht unterzeichnet, dass der Immobilienmakler alle erforderlichen Unterlagen einsehen und beschaffen darf. Außerdem erklärt der Verkäufer, dass er dem Immobilienmakler alle für die erfolgreiche Vermittlung der Immobilie erforderlichen Unterlagen herausgibt und/oder bei der Beschaffung nach Kräften behilflich ist. Der Verkäufer ermöglicht dem Immobilienmakler nach vorheriger Abstimmung Besichtigungen mit Kaufinteressenten." });
  a.push({ text: "c. Der Verkäufer erteilt dem Immobilienmakler einen qualifizierten Alleinauftrag. Während der Laufzeit dieses Vertrages wird der Verkäufer keinen weiteren Immobilienmakler mit der Vermittlung der Immobilie beauftragen. Der Verkäufer wird keine eigenen Vermarktungsbemühungen starten, insbesondere keine eigenen (digitalen) Anzeigen aufgeben oder in sonstiger Form seine Verkaufsabsicht durch ein öffentliches Immobilienangebot bekunden. Sämtliche Kaufinteressenten, Immobilienmakler, Tippgeber oder entsprechende Dritte, die sich während der Laufzeit dieses Vertrages direkt an den Verkäufer wenden, wird der Verkäufer unverzüglich an den Immobilienmakler verweisen." });
  a.push({ text: "d. Der Immobilienmakler wird dem Verkäufer nach der vollständigen Objektaufnahme und Auswertung der bereit gestellten und beschafften Unterlagen das Exposé zur Freizeichnung der dort getätigten Angaben und Übereinstimmung mit den von dem Verkäufer über die Immobilie gemachten Angaben vorlegen, der Verkäufer wird die Angaben sorgfältig überprüfen und dem Immobilienmakler etwaige Korrekturen aufgeben. Mit Freigabe des Exposés bestätigt der Verkäufer die Richtigkeit und Vollständigkeit der darin enthaltenen Angaben. Der Immobilienmakler ist berechtigt, bei der Vermarktung auf die Vollständigkeit und Richtigkeit der vom Verkäufer getätigten Angaben, Erklärungen, übergebenen Unterlagen und des von ihm freigegebenen Exposés zu vertrauen. Eine Pflicht zur eigenständigen Überprüfung dieser Angaben besteht nicht, es sei denn, es ist gesetzlich erforderlich." });
  a.push({ text: "e. Der Verkäufer wird den Immobilienmakler unverzüglich von allen Umständen, die die Immobilie, die Vermarktung oder den Verkauf betreffen, in Kenntnis setzen. Das gilt insbesondere für Kaufinteressenten, die sich direkt mit dem Verkäufer in Verbindung setzen, für eine Änderung oder die Zurückstellung oder Rücknahme der Verkaufsabsicht, die Beurkundung eines Kaufvertrages oder Ihre Absicht, die Immobilie zu einem anderen als den angenommenen Angebotspreis zu verkaufen." });
  a.push({ text: "f. Sollte der Verkäufer einen notariellen Kaufvertrag abgeschlossen haben, verpflichtet er sich, dem Immobilienmakler die Konditionen des Verkaufs und die Vertragspartei zu übermitteln, damit der Immobilienmakler eigene Ansprüche prüfen und durchsetzen kann. Der Immobilienmakler wird bevollmächtigt, zur Prüfung seiner Ansprüche Grundbuchauszüge anzufordern. Der Verkäufer verpflichtet sich hierzu, dem Immobilienmakler auf dessen Anforderungen, unverzüglich ausreichende Vollmacht zu erteilen.", spaceAfter: 12 });

  a.push({ text: "4. Vergütung", heading: true, spaceAfter: 4 });
  a.push({ text: `a. Der Verkäufer ist bei Beurkundung eines Kaufvertrags über die Immobilie zur Zahlung einer Verkäufer-Provision in Höhe von ${provision}% inkl. 19% MwSt. vom beurkundeten Kaufpreis verpflichtet. Die Verkäufer-Provision ist verdient und fällig mit der Beurkundung des notariellen Kaufvertrages. Sollte der beurkundete vom tatsächlichen Kaufpreis abweichen, ist der tatsächliche Kaufpreis maßgeblich, soweit dies gesetzlich zulässig ist. Der Immobilienmakler wird mit dem Käufer einen provisionspflichtigen Maklervertrag in gleicher Provisionshöhe abschließen (§ 656c BGB).` });
  a.push({ text: "b. Der Provisionsanspruch entsteht auch dann, wenn der Kaufvertrag nach Beendigung dieses Maklervertrages abgeschlossen wird, sofern der Vertrag auf die Tätigkeit des Immobilienmaklers während der Vertragslaufzeit zurückzuführen ist. Der Verkäufer verpflichtet sich, dem Immobilienmakler den Abschluss eines Kaufvertrages unverzüglich mitzuteilen." });
  a.push({ text: "c. Der Provisionsanspruch entsteht auch, wenn anstelle eines Kaufvertrages ein wirtschaftlich vergleichbares Geschäft zustande kommt (z.B. Anteilskauf, Erbbaurecht, Pachtkauf etc.)." });
  a.push({ text: "d. Der Verkäufer ist verpflichtet, dem Immobilienmakler Schadensersatz i. H. d. entgangenen Provision nach Abs. 4 lit. a, abzüglich ersparter Aufwendungen zu zahlen, wenn der Verkäufer eine Pflicht gemäß Abs. 3. lit. c. verletzt, indem er während der Vertragslaufzeit dieses Maklervertrags einen Kaufinteressenten nicht an den Immobilienmakler verweist, er ohne Einverständnis des Immobilienmaklers einen anderen Immobilienmakler beauftragt oder er eigene Verkaufsbemühungen unternimmt und der Kaufvertrag innerhalb von 12 Monaten nach Beendigung dieses Maklervertrags zustande kommt." });
  a.push({ text: "e. Dem Immobilienmakler sind auf Verlangen des Immobilienmaklers tatsächlich angefallene, konkrete Aufwendungen nur dann zu ersetzen, wenn bei Beendigung des Maklervertrags ein Kaufvertrag nicht zustande gekommen ist oder ein Provisionsanspruch des Maklers nicht entsteht.", spaceAfter: 12 });

  a.push({ text: "5. Sonstige Vereinbarungen", heading: true, spaceAfter: 4 });
  a.push({ text: "a. Das Geldwäschegesetz legt den Immobilienmaklerfirmen besondere Verpflichtungen auf. Der Verkäufer stellt daher dem Immobilienmakler seinen Personalausweis zur Erfüllung dieser gesetzlichen Pflichten, der Anfertigung einer Fotokopie und Aufbewahrung nach dem Geldwäschegesetz zur Verfügung. Der Immobilienmakler hält die Pflichten nach dem GwG ein." });
  a.push({ text: "b. Eine ausdrückliche Einwilligung zur Verarbeitung der personenbezogenen Daten des Verkäufers ist nach der DSGVO wegen dieses Vertrages nicht erforderlich. Der Immobilienmakler hält die Pflichten nach der DSGVO ein." });
  a.push({ text: "c. Der Verkäufer erklärt:" });
  a.push({ text: `${verbraucherJa ? "( x )" : "(   )"} ich/wir verkaufen diese Immobilie als Verbraucher.` });
  a.push({ text: `${verbraucherJa ? "(   )" : "( x )"} ich/wir verkaufen diese Immobilie nicht als Verbraucher.` });
  a.push({ text: "Der Verkäufer als Verbraucher erklärt, dass er mit Unterzeichnung dieses Vertrages die Widerrufsbelehrung und das Muster-Widerrufsformular des Immobilienmaklers ausgehändigt bekommen hat." });
  a.push({ text: "d. Verbraucherinformation zur Online-Streitbeilegung gem. Art. 14 Abs. 1 ODR-VO: Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit, die Sie hier finden: https://ec.europa.eu/consumers/odr. Wir sind nicht verpflichtet, an einem Streitbeilegungsverfahren teilzunehmen und nehmen daran auch nicht teil." });
  a.push({ text: "e. Ergänzungen dieses Vertrages oder jegliche Änderungen der getroffenen Vereinbarungen bedürfen der Textform; dies gilt auch für die Aufhebung des Formerfordernisses. Für die Kündigung dieses Vertrages ist die Textform vereinbart." });
  a.push({ text: "f. Sollte eine der vorstehenden Bestimmungen ganz oder teilweise unwirksam oder undurchführbar sein oder werden, so wird hierdurch die Wirksamkeit der übrigen Bestimmungen nicht berührt.", spaceAfter: 12 });

  return a;
}

function buildWiderrufAbsaetze(standort: ImmoStandort): Absatz[] {
  const a: Absatz[] = [];
  a.push({ text: "Widerrufsbelehrung", heading: true, pageBreak: true, spaceAfter: 8 });
  a.push({ text: "Widerrufsrecht", bold: true, spaceAfter: 2 });
  a.push({ text: "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.", spaceAfter: 8 });
  a.push({ text: "Um Ihr Widerrufsrecht auszuüben, müssen Sie uns" });
  a.push({ text: standort.name, noJustify: true });
  a.push({ text: standort.firma, noJustify: true });
  a.push({ text: standort.strasse, noJustify: true });
  a.push({ text: standort.plzOrt, noJustify: true });
  a.push({ text: "info@immooffice.example", noJustify: true });
  a.push({ text: "mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist." });
  a.push({ text: "Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.", spaceAfter: 8 });
  a.push({ text: "Folgen des Widerrufs", bold: true, spaceAfter: 2 });
  a.push({ text: "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung, als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet." });
  a.push({ text: "Haben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrages unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.", spaceAfter: 8 });
  a.push({ text: "Indem Sie diese Vereinbarung unterschreiben, bestätigen Sie, dass Sie die oben genannte Widerrufsbelehrung gelesen und verstanden haben." });
  a.push({ text: "Bitte beachten Sie, dass Ihr Widerrufsrecht erlischt, wenn wir auf Ihren ausdrücklichen Wunsch hin unsere Maklertätigkeit vollständig erbracht haben, bevor Sie von Ihrem Widerrufsrecht Gebrauch gemacht haben. Wir bitten Sie daher, Ihren Wunsch diesbezüglich unten zum Ausdruck zu bringen.", spaceAfter: 8 });
  a.push({ text: `[ ] Ich stimme ausdrücklich zu, dass ${standort.name}; ${standort.firma}, vertreten durch ${standort.vertreter}, ${standort.strasse}, ${standort.plzOrt}, mit der Maklertätigkeit beginnt, bevor die oben genannte Frist für die Ausübung meines Widerrufsrechts abgelaufen ist, und bin mir bewusst, dass mein Widerrufsrecht vorzeitig erlischt.`, spaceAfter: 8 });
  a.push({ text: "Wir hoffen, Ihnen bald einen geeigneten Käufer präsentieren zu können, und verbleiben" });
  a.push({ text: "mit freundlichen Grüßen", noJustify: true });
  a.push({ text: standort.name, noJustify: true });
  a.push({ text: standort.firma, noJustify: true });
  a.push({ text: standort.vertreter, noJustify: true, spaceAfter: 10 });
  a.push({ text: "Hiermit bestätigt der Verkäufer, die Widerrufsbelehrung, das Muster-Widerrufsformular und die AGB erhalten zu haben." });
  a.push({ text: "Wir benötigen eine unterzeichnete Kopie dieses Schreibens und möchten Sie höflich bitten, uns dieses unverzüglich zurückzusenden.", spaceAfter: 10 });
  return a;
}

function buildMusterWiderrufAbsaetze(standort: ImmoStandort): Absatz[] {
  const a: Absatz[] = [];
  a.push({ text: "Muster-Widerrufsformular", heading: true, pageBreak: true, spaceAfter: 8 });
  a.push({ text: "(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden es an uns zurück.)", spaceAfter: 8 });
  a.push({ text: standort.name, noJustify: true });
  a.push({ text: standort.firma, noJustify: true });
  a.push({ text: standort.vertreter, noJustify: true });
  a.push({ text: standort.strasse, noJustify: true });
  a.push({ text: standort.plzOrt, noJustify: true });
  a.push({ text: standort.email, noJustify: true, spaceAfter: 8 });
  a.push({ text: "Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über die Erbringung der Maklerleistung", spaceAfter: 8 });
  a.push({ text: "Bestellt/erhalten am _______________", noJustify: true, spaceAfter: 8 });
  a.push({ text: "Name:", noJustify: true, spaceAfter: 8 });
  a.push({ text: "Anschrift:", noJustify: true, spaceAfter: 8 });
  a.push({ text: "Unterschrift (bei Widerruf in Papierform, bei E-Mail nicht erforderlich)", noJustify: true, spaceAfter: 8 });
  a.push({ text: "Datum:", noJustify: true, spaceAfter: 8 });
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
  a.push({ text: "Vollmacht", heading: true, spaceAfter: 14 });
  a.push({ text: "Auftraggeber", bold: true, noJustify: true });
  if (verkTitel) a.push({ text: verkTitel, noJustify: true });
  verkZeilen.forEach(z => a.push({ text: z, noJustify: true }));
  a.push({ text: "erteilt", bold: true, noJustify: true, spaceBefore: 6 });
  a.push({ text: standort.name, noJustify: true });
  a.push({ text: standort.firma, noJustify: true });
  a.push({ text: standort.vertreter, noJustify: true });
  a.push({ text: standort.strasse, noJustify: true });
  a.push({ text: standort.plzOrt, noJustify: true, spaceAfter: 6 });
  a.push({ text: "zu der Immobilie:", bold: true, noJustify: true });
  objektZeilen.forEach(z => a.push({ text: z, noJustify: true }));
  a.push({ text: "die Vollmacht zur:", bold: true, noJustify: true, spaceAfter: 4 });
  [
    "Einsichtnahme in das Grundbuch und zur Anfertigung bzw. Einholung eines aktuellen Grundbuchauszuges",
    "Einsichtnahme in die Grundakte",
    "Einsichtnahme in die der Eintragung von vorhandenen Belastungen zugrunde liegenden Unterlagen bzw. Anforderung von Unterlagen, die im Grundbuch eingetragene Belastungen betreffen",
    "zur Einsichtnahme in das Kataster",
    "zur Einsichtnahme in das Baulastenverzeichnis",
    "zur Einsichtnahme in das Altlastenverzeichnis oder Altlastenkataster",
    "zur Einsichtnahme in die Bauakte und zur Anfertigung von Auszügen aus der Bauakte, sofern dies aus Sicht des Immobilienmaklers erforderlich ist",
    "zur Einsichtnahme in weitere behördliche Akten",
    "zur Einsichtnahme von Akten im Zusammenhang mit Eintragungen in Abteilung III des Grundbuchs bzw. Anforderung von Unterlagen, Verträgen und zugrunde liegenden Vereinbarungen, die Eintragungen in Abteilung III des Grundbuchs betreffen.",
    "Sonstiges",
  ].forEach(t => a.push({ text: `-  ${t}`, indent: 14 }));
  a.push({ text: "Die Vollmacht erstreckt sich auch auf die schriftliche Anforderung von Auszügen aus den genannten Akten und Registern. Der Auftraggeber erteilt dem Makler zudem die Vollmacht, bei einem Notar den Notarvertrag in dem Moment anzufordern, wenn die beiden Parteien des notariellen Kaufvertrages hinreichend bestimmt sind.", spaceBefore: 4 });
  a.push({ text: "Mit der Übermittlung der personenbezogenen Daten an die jeweiligen Stellen erklärt sich der Auftraggeber einverstanden." });
  a.push({ text: "Die Vollmacht gilt für das Maklerbüro, so dass auch die Mitarbeitenden des Maklerbüros diese Vollmacht nutzen dürfen." });
  a.push({ text: "Der Immobilienmakler darf keine Untervollmacht an weitere Maklerbüros erteilen." });
  a.push({ text: "Der Immobilienmakler darf externen Dienstleister Untervollmacht zur Beantragung der o.g. Unterlagen erteilen.", spaceAfter: 14 });
  a.push({ text: `Datum: ${heute}`, noJustify: true });

  return a;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData?.user) throw new Error("Nicht authentifiziert.");

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
    const { data: profil } = await admin.from("profiles").select("*").eq("id", userData.user.id).maybeSingle(); immoSetzeMandant(profil?.mandant_id);
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) {
      throw new Error("Keine Berechtigung.");
    }

    const body = await req.json();
    const vertragId = (body.vertrag_id || "").toString().trim();
    await immoMandantSichern(req, [["vertraege", vertragId]]);
    const dokumentTyp = (body.dokument_typ || "maklervertrag").toString().trim();
    if (!vertragId) throw new Error("vertrag_id ist Pflicht.");
    if (!["maklervertrag", "vollmacht"].includes(dokumentTyp)) throw new Error("dokument_typ muss 'maklervertrag' oder 'vollmacht' sein.");

    const { data: vertrag, error: vErr } = await admin.from("vertraege").select("*").eq("id", vertragId).maybeSingle();
    if (vErr) throw vErr;
    if (!vertrag) throw new Error("Vertrag nicht gefunden.");

    const inklVollmacht = dokumentTyp === "maklervertrag"
      && (body.inkl_vollmacht !== undefined ? !!body.inkl_vollmacht : !!vertrag.vollmacht_mitgenerieren);

    // ---- Fonts + Logo ----
    const pdf = await PDFDocument.create();
    let fontRegular: any, fontBold: any;
    let nutztCustomFonts = false;
    try {
      const [rRes, bRes] = await Promise.allSettled([
        admin.storage.from("branding-assets").download(FONT_MONTSERRAT_REGULAR),
        admin.storage.from("branding-assets").download(FONT_MONTSERRAT_BOLD),
      ]);
      if (rRes.status === "fulfilled" && rRes.value.data && bRes.status === "fulfilled" && bRes.value.data) {
        const fontkit = await ladeFontkit();
        if (fontkit) {
          pdf.registerFontkit(fontkit);
          fontRegular = await pdf.embedFont(await rRes.value.data.arrayBuffer(), { subset: false });
          fontBold = await pdf.embedFont(await bRes.value.data.arrayBuffer(), { subset: false });
          nutztCustomFonts = true;
        }
      }
    } catch (_e) { /* Fallback unten */ }
    if (!nutztCustomFonts) {
      fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
      fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    }
    const fix = (s: string) => sanitizeGlyphs(s);

    let embeddedLogo: any = null;
    try {
      const { data: logoBlob } = await admin.storage.from("branding-assets").download(LOGO_PFAD);
      if (logoBlob) embeddedLogo = await pdf.embedPng(await logoBlob.arrayBuffer());
    } catch (_e) { /* Logo optional */ }

    const standort = await immoStandort(admin, vertrag.mandant_id, vertrag.standort);
    // Ein Maklervertrag ohne Briefkopf und ohne zeichnenden Vertreter darf
    // nicht zu einem Kunden. Lieber eine klare Meldung als ein Dokument,
    // das im Streitfall keinen Aussteller hat.
    if (!standort.firma || !standort.vertreter) {
      return antwort({ ok: false, fehler: "Fuer diesen Mandanten fehlen Firmenname oder Geschaeftsfuehrer in den Stammdaten. Ohne beides wird kein Maklervertrag erzeugt." }, 400);
    }

    // ---- Seiten-Renderer im Word-Layout ----
    const margin = 56;
    const pageWidth = PageSizes.A4[0];
    const pageHeight = PageSizes.A4[1];
    const maxTextWidth = pageWidth - 2 * margin;
    let page: any;
    let y = 0;

    // Logo oben rechts auf jeder Seite (wie die Kopfzeile im Word-Dokument)
    const zeichneKopf = () => {
      if (!embeddedLogo) return;
      const logoH = 42;
      const logoW = logoH * (embeddedLogo.width / embeddedLogo.height);
      page.drawImage(embeddedLogo, { x: pageWidth - margin - logoW, y: pageHeight - margin - logoH + 14, width: logoW, height: logoH });
    };
    const neueSeite = () => {
      page = pdf.addPage(PageSizes.A4);
      zeichneKopf();
      y = pageHeight - margin - (embeddedLogo ? 52 : 0);
    };
    neueSeite();

    const fontKey = new Map<any, string>();
    let fontKeyZaehler = 0;
    const widthCache = new Map<string, number>();
    const sicherBreite = (font: any, text: string, size: number): number => {
      try { return font.widthOfTextAtSize(text, size); }
      catch (_e) { return font.widthOfTextAtSize(asciiFallback(text), size); }
    };
    const wortBreite = (font: any, wort: string, size: number): number => {
      let fk = fontKey.get(font);
      if (!fk) { fk = String(++fontKeyZaehler); fontKey.set(font, fk); }
      const key = `${fk}|${size}|${wort}`;
      let w = widthCache.get(key);
      if (w === undefined) { w = sicherBreite(font, wort, size); widthCache.set(key, w); }
      return w;
    };
    // Zeilen als Wort-Arrays (fuer Blocksatz)
    const wrapWords = (text: string, font: any, size: number, maxWidth: number): string[][] => {
      const words = (text || "").split(/\s+/).filter(Boolean);
      const spaceW = wortBreite(font, " ", size);
      const lines: string[][] = [];
      let current: string[] = [];
      let currentW = 0;
      for (const w of words) {
        const wW = wortBreite(font, w, size);
        if (current.length > 0 && currentW + spaceW + wW > maxWidth) {
          lines.push(current); current = [w]; currentW = wW;
        } else {
          currentW = current.length > 0 ? currentW + spaceW + wW : wW;
          current.push(w);
        }
      }
      if (current.length > 0) lines.push(current);
      return lines;
    };
    const drawTextSicher = (t: string, x: number, size: number, font: any, color: any) => {
      try { page.drawText(t, { x, y, size, font, color }); }
      catch (_e) { page.drawText(asciiFallback(t), { x, y, size, font, color }); }
    };

    const drawAbsaetze = (liste: Absatz[]) => {
      for (const abs of liste) {
        if (abs.pageBreak) neueSeite();
        if (abs.spaceBefore) y -= abs.spaceBefore;
        const size = abs.size || 10;
        const font = abs.bold || abs.heading ? fontBold : fontRegular;
        const color = SCHWARZ;
        const indent = abs.indent || 0;
        const lineHeight = size * 1.45;
        const textFixed = fix(abs.text);
        const zeilen = textFixed === "" ? [[]] : wrapWords(textFixed, font, size, maxTextWidth - indent);
        const spaceW = wortBreite(font, " ", size);
        for (let zi = 0; zi < zeilen.length; zi++) {
          const words = zeilen[zi];
          if (y < margin + lineHeight) neueSeite();
          const istLetzteZeile = zi === zeilen.length - 1;
          const zeileText = words.join(" ");
          const zeileBreite = words.reduce((s, w) => s + wortBreite(font, w, size), 0) + spaceW * Math.max(0, words.length - 1);
          const luecke = (maxTextWidth - indent) - zeileBreite;
          // Blocksatz wie Word: alle Zeilen ausser der letzten des Absatzes;
          // nicht bei sehr kurzen Zeilen (verhindert riesige Wortluecken)
          const blocksatz = !abs.noJustify && !abs.heading && !istLetzteZeile
            && words.length > 1 && luecke > 0 && luecke < spaceW * words.length * 3;
          if (blocksatz) {
            const extra = luecke / (words.length - 1);
            let x = margin + indent;
            for (const w of words) {
              drawTextSicher(w, x, size, font, color);
              x += wortBreite(font, w, size) + spaceW + extra;
            }
          } else {
            drawTextSicher(zeileText, margin + indent, size, font, color);
          }
          y -= lineHeight;
        }
        y -= (abs.spaceAfter !== undefined ? abs.spaceAfter : 4);
      }
    };

    // Unterschriften-Zeilen wie im Word-Dokument: Linie mit Beschriftung darunter,
    // zwei Spalten (links Makler-Seite, rechts Verkaeufer-Seite)
    const drawUnterschriftZeile = (spalten: Array<string[]>) => {
      const spaltBreite = (maxTextWidth - 60) / 2;
      const maxLabels = Math.max(...spalten.map(s => s.length));
      const benoetigt = 60 + maxLabels * 13;
      if (y < margin + benoetigt) neueSeite();
      y -= 44; // Platz fuer die handschriftliche Unterschrift
      spalten.forEach((labels, i) => {
        const x0 = margin + i * (spaltBreite + 60);
        page.drawLine({ start: { x: x0, y: y }, end: { x: x0 + spaltBreite, y: y }, thickness: 0.8, color: SCHWARZ });
        labels.forEach((l, li) => {
          try { page.drawText(fix(l), { x: x0, y: y - 13 - li * 12, size: 9, font: fontRegular, color: SCHWARZ }); }
          catch (_e) { page.drawText(asciiFallback(fix(l)), { x: x0, y: y - 13 - li * 12, size: 9, font: fontRegular, color: SCHWARZ }); }
        });
      });
      y -= 16 + maxLabels * 12;
    };

    const heute = new Date().toLocaleDateString("de-DE");

    if (dokumentTyp === "maklervertrag") {
      drawAbsaetze(buildMaklervertragAbsaetze(vertrag, standort));
      // Ort/Datum + Unterschriftenzeilen wie im Word-Dokument
      drawAbsaetze([{ text: `${standort.stadt}, ${heute}`, noJustify: true, spaceAfter: 6 }]);
      drawUnterschriftZeile([["Ort, Datum"], ["Ort, Datum"]]);
      drawUnterschriftZeile([
        [standort.name, standort.firma, standort.vertreter],
        ["Unterschrift Verkäufer"],
      ]);
      drawAbsaetze(buildWiderrufAbsaetze(standort));
      drawUnterschriftZeile([["Unterschrift Verkäufer"], []]);
      drawAbsaetze(buildMusterWiderrufAbsaetze(standort));
      drawAbsaetze(buildAgbAbsaetze(standort, false));
      if (inklVollmacht) {
        neueSeite();
        drawAbsaetze(buildVollmachtAbsaetze(vertrag, standort));
        drawUnterschriftZeile([["Unterschrift Auftraggeber"], []]);
      }
    } else {
      drawAbsaetze(buildVollmachtAbsaetze(vertrag, standort));
      drawUnterschriftZeile([["Unterschrift Auftraggeber"], []]);
    }

    const pdfBytes = await pdf.save();

    let bin = "";
    const chunk = 8192;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      bin += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
    }
    const pdfBase64 = btoa(bin);

    const safe = (s: string) => (s || "").replace(/[^A-Za-z0-9äöüÄÖÜß]+/g, "_").replace(/^_+|_+$/g, "") || "Dokument";
    const objekt = safe(vertrag.objekt_strasse || vertrag.objekt_adresse || vertrag.objekt_bezeichnung || "Objekt");
    const titelDatei = dokumentTyp === "maklervertrag"
      ? (inklVollmacht ? "Maklervertrag_Vollmacht" : "Maklervertrag")
      : "Vollmacht";
    const dateiname = `${titelDatei}_${objekt}.pdf`;

    return jsonResponse({ ok: true, pdf_base64: pdfBase64, dateiname });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("vertrag-pdf:", meldung);
    return jsonResponse({ ok: false, error: meldung });
  }
});
