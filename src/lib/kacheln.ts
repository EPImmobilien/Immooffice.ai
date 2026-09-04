import type { SymbolName } from "@/components/Symbole";
import type { Modul } from "@/lib/auth/rechte";

/**
 * Kachel-Struktur der Anwendung — 1:1 nach der Startseite und den Modulseiten
 * der Referenz (docs/FUNKTIONSINVENTAR.md, E-2026-09-04-56).
 *
 * Die Startseite ist ein Kachel-Raster in fester Grundreihenfolge; jeder
 * Benutzer kann Reihenfolge und Sichtbarkeit anpassen (benutzer.kacheln).
 * Jede Modulseite ist wieder ein Kachel-Raster mit den Unterkacheln der
 * Referenz. Eine Kachel ohne Gegenstueck traegt einen Hinweis statt eines
 * Links — nichts wird versteckt, nichts vorgetaeuscht.
 *
 * Nicht uebernommen (Masterprompt, ersatzlos): Firmen-Cloud-Ablage,
 * Buerobildschirm, Liquiditaet, Provisionsrechner. Sie stehen als Hinweis
 * „nicht im Umfang" auf der jeweiligen Modulseite.
 */

export interface Startkachel {
  id: string;
  titel: string;
  untertitel: string;
  pfad: string;
  symbol: SymbolName;
  /** Rechte-Modul, das die Kachel sichtbar macht; null = fuer alle. */
  modul: Modul | null;
  /** Nur Inhaber und Administrator. */
  nurVerwaltung?: boolean;
}

export const STARTKACHELN: Startkachel[] = [
  { id: "immobilien", titel: "Immobilien", untertitel: "Bestand & Neubau", pfad: "/immobilien", symbol: "objekte", modul: "objekte" },
  { id: "kontakte", titel: "Adressbuch", untertitel: "Interessenten, Eigentümer, Notare", pfad: "/kontakte", symbol: "kontakte", modul: "kontakte" },
  { id: "marketing", titel: "Marketing", untertitel: "Logos & Vorlagen", pfad: "/marketing", symbol: "marketing", modul: "marketing" },
  { id: "verkauf", titel: "Verkauf", untertitel: "Verträge, Nachweise, Bewertung", pfad: "/verkauf", symbol: "vertraege", modul: "vertraege" },
  { id: "vermietung", titel: "Vermietung", untertitel: "Mietverträge & Protokolle", pfad: "/vermietung", symbol: "schluessel", modul: "vertraege" },
  { id: "schmiede", titel: "Exposé-Schmiede", untertitel: "KI-Texte für Objekte", pfad: "/exposes", symbol: "expose", modul: "exposes" },
  { id: "ki_agenten", titel: "KI-Agenten", untertitel: "Prüf-Agenten für Exposés & Verträge", pfad: "/ki-agenten", symbol: "ki", modul: "exposes" },
  { id: "dokumente", titel: "Dokumente", untertitel: "Ablage & Geschäftsbriefe", pfad: "/dokumente", symbol: "dokumente", modul: "objekte" },
  { id: "kalender", titel: "Termine", untertitel: "Besichtigungen & Co.", pfad: "/kalender", symbol: "kalender", modul: "kalender" },
  { id: "kundenbereich", titel: "Kundenbereich", untertitel: "Eigentümer & Käufer verwalten", pfad: "/kundenbereich", symbol: "kunden", modul: "portal" },
  { id: "todos", titel: "ToDos", untertitel: "Aufgaben, Nachfassen und Arbeitsketten", pfad: "/aufgaben", symbol: "aufgaben", modul: "kalender" },
  { id: "arbeitszeit", titel: "Arbeitszeit", untertitel: "Arbeitszeitkonto, Überstunden und Fehltage", pfad: "/arbeitszeit", symbol: "uhr", modul: null },
  { id: "werkzeuge", titel: "Werkzeuge", untertitel: "PDF bearbeiten, zusammenfügen, teilen", pfad: "/werkzeuge", symbol: "werkzeuge", modul: "objekte" },
  { id: "akquise", titel: "Akquise", untertitel: "Eigentümer-Leads, Pipeline & Automationen", pfad: "/akquise", symbol: "akquise", modul: "akquise" },
  { id: "admin", titel: "Admin-Bereich", untertitel: "Mitarbeiter verwalten", pfad: "/admin", symbol: "einstellungen", modul: "einstellungen" },
  { id: "finanzen", titel: "Finanzen", untertitel: "Rechnungen & Kennzahlen", pfad: "/finanzen", symbol: "finanzen", modul: "rechnungen" },
  { id: "rechnungen", titel: "Rechnungen", untertitel: "Eigene Rechnungen stellen", pfad: "/rechnungen", symbol: "abrechnung", modul: "rechnungen" },
  { id: "posteingang", titel: "Posteingang", untertitel: "E-Mails aus dem Postfach", pfad: "/postfach", symbol: "postfach", modul: "postfach" },
  { id: "bewerber", titel: "Bewerber", untertitel: "Einstellungstests verwalten", pfad: "/einstellungen/bewerber", symbol: "bewerber", modul: "einstellungen", nurVerwaltung: true },
];

export const STANDARD_REIHENFOLGE = STARTKACHELN.map((k) => k.id);

export interface KachelEinstellung {
  reihenfolge: string[];
  ausgeblendet: string[];
}

/** Liest die gespeicherte Einstellung tolerant — unbekannte Kacheln fallen weg, neue kommen hinten dazu. */
export function kachelEinstellungLesen(roh: unknown): KachelEinstellung {
  const o = (roh && typeof roh === "object" ? roh : {}) as Record<string, unknown>;
  const bekannt = new Set(STANDARD_REIHENFOLGE);
  const reihenfolge = (Array.isArray(o["reihenfolge"]) ? (o["reihenfolge"] as unknown[]) : []).filter((x): x is string => typeof x === "string" && bekannt.has(x));
  for (const id of STANDARD_REIHENFOLGE) if (!reihenfolge.includes(id)) reihenfolge.push(id);
  const ausgeblendet = (Array.isArray(o["ausgeblendet"]) ? (o["ausgeblendet"] as unknown[]) : []).filter((x): x is string => typeof x === "string" && bekannt.has(x));
  return { reihenfolge, ausgeblendet };
}

// ---------------------------------------------------------------------------
// Modulseiten mit Unterkacheln
// ---------------------------------------------------------------------------

export interface Modulkachel {
  titel: string;
  untertitel: string;
  pfad?: string;
  symbol: SymbolName;
  /** Ohne Link: „in Vorbereitung" (kommt) oder „nicht im Umfang" (Masterprompt). */
  hinweis?: "in Vorbereitung" | "nicht im Umfang" | "teilweise";
  /** Kurze Erklaerung zum Hinweis. */
  erklaerung?: string;
}

export interface Modulseite {
  titel: string;
  beschreibung: string;
  kacheln: Modulkachel[];
}

export const MODULSEITEN: Record<string, Modulseite> = {
  immobilien: {
    titel: "Immobilien",
    beschreibung: "Bestand und Neubau — alles, was zu einem Objekt gehört, hängt an seiner Akte.",
    kacheln: [
      { titel: "Bestandsimmobilien", untertitel: "Verkauf & Vermietung – zentrale Objektverwaltung", pfad: "/objekte", symbol: "objekte" },
      { titel: "Neubauprojekte", untertitel: "Projekt-Homepages, Einheiten & Kundenbereich", pfad: "/projekte", symbol: "wertermittlung" },
      { titel: "Objektaufnahme", untertitel: "Aufnahmebogen vor Ort — daraus entsteht das Objekt", pfad: "/aufnahmen", symbol: "aufgaben" },
      { titel: "Portalexport", untertitel: "OpenImmo für ImmoScout24, Immowelt, Kleinanzeigen", pfad: "/portale", symbol: "portale" },
      { titel: "Suchprofile", untertitel: "Gesuche der Interessenten gegen den Bestand", pfad: "/suchprofile", symbol: "suchprofile" },
    ],
  },
  verkauf: {
    titel: "Verkauf",
    beschreibung: "Vom Auftrag bis zur Übergabe: Verträge, Nachweise, Bewertung, Notar.",
    kacheln: [
      { titel: "Maklerverträge", untertitel: "Verkäufer-Aufträge erstellen", pfad: "/vertraege", symbol: "vertraege" },
      { titel: "Reservierungen", untertitel: "Neubau-Reservierungsvereinbarung", pfad: "/vermietung/reservierungen", symbol: "aufgaben" },
      { titel: "Objektnachweise", untertitel: "Käufer-Nachweise dokumentieren", pfad: "/vertraege/vorlage/objektnachweis", symbol: "expose" },
      { titel: "Objektbewertung", untertitel: "Einschätzungen erstellen", pfad: "/wertermittlung", symbol: "wertermittlung" },
      { titel: "Objektaufnahme", untertitel: "Aufnahmebogen vor Ort", pfad: "/aufnahmen", symbol: "objekte" },
      { titel: "Übergabeprotokolle", untertitel: "Schlüsselübergabe an Käufer", pfad: "/uebergaben", symbol: "schluessel" },
      { titel: "Notar-Laufzettel", untertitel: "Datenerfassung für Notartermin", pfad: "/notar", symbol: "dokumente" },
    ],
  },
  vermietung: {
    titel: "Vermietung",
    beschreibung: "Anfragen beantworten, Selbstauskunft einholen, Mietvertrag erstellen, Übergabe protokollieren.",
    kacheln: [
      { titel: "Mietanfragen", untertitel: "Anfragen mit Vorlagen beantworten", pfad: "/vermietung/anfragen", symbol: "postfach" },
      { titel: "Mietverträge", untertitel: "Mietverträge erfassen und drucken", pfad: "/vermietung/mietvertraege", symbol: "vertraege" },
      { titel: "Übergabeprotokolle", untertitel: "Ein- und Auszug mit Zählerständen", pfad: "/uebergaben", symbol: "schluessel" },
      { titel: "Reservierungen", untertitel: "Reservierungsvereinbarungen", pfad: "/vermietung/reservierungen", symbol: "aufgaben" },
      { titel: "Posteingang", untertitel: "E-Mails aus dem Postfach", pfad: "/postfach", symbol: "postfach" },
    ],
  },
  marketing: {
    titel: "Marketing",
    beschreibung: "Vorlagen für Social Media und Print, Bildbearbeitung, Ablage.",
    kacheln: [
      { titel: "Vorlagen", untertitel: "Social-Media-Posts erstellen", pfad: "/marketing#vorlagen", symbol: "marketing" },
      { titel: "Ablage", untertitel: "Marketing-Dateien verwalten", symbol: "dokumente", hinweis: "in Vorbereitung", erklaerung: "Kommt mit der zentralen Ablage (Paket Dokumente)." },
      { titel: "KI-Bildbearbeitung", untertitel: "Retusche, Himmel, Staging", pfad: "/werkzeuge/bild-editor", symbol: "ki" },
      { titel: "Print-Materialien", untertitel: "Visitenkarten, Flyer & Co.", pfad: "/marketing#print", symbol: "expose", hinweis: "teilweise", erklaerung: "Flyer und Postkarte vorhanden; Visitenkarten, Vorlagenverwaltung und Bestellung folgen." },
      { titel: "Bild-Editor", untertitel: "Zuschneiden, weichzeichnen, Text & Logo", pfad: "/werkzeuge/bild-editor", symbol: "werkzeuge" },
      { titel: "Bürobildschirm", untertitel: "Playlist für den Bildschirm im Laden", symbol: "portale", hinweis: "nicht im Umfang", erklaerung: "Laut Masterprompt nicht übernommen (Hardwareanbindung)." },
    ],
  },
  ki_agenten: {
    titel: "KI-Agenten",
    beschreibung: "Prüf-Agenten, die fertige Unterlagen vor dem Versand kontrollieren — Befunde, Ampel, Übernahme in die Akte.",
    kacheln: [
      { titel: "Exposé-Prüfer", untertitel: "Endkontrolle vor dem Versand — Ampel, Checkliste, Befunde", symbol: "ki", hinweis: "in Vorbereitung", erklaerung: "Nächstes Arbeitspaket (docs/STATUS.md)." },
      { titel: "Mietvertrags-Prüfer", untertitel: "Vollständigkeit, Klauseln, Fristen", symbol: "vertraege", hinweis: "in Vorbereitung", erklaerung: "Folgt nach dem Exposé-Prüfer." },
      { titel: "KI-Assistent", untertitel: "Fragen zu Objekten, Kontakten und Vorgängen", symbol: "ki", hinweis: "in Vorbereitung", erklaerung: "Schwebender Assistent im Mitarbeiterbereich." },
    ],
  },
  dokumente: {
    titel: "Dokumente",
    beschreibung: "Unterlagen je Objekt, Geschäftsbriefe im Briefpapier, zentrale Ablage.",
    kacheln: [
      { titel: "Objektunterlagen", untertitel: "Unterlagen hängen an der Objektakte", pfad: "/objekte", symbol: "dokumente" },
      { titel: "Geschäftsbriefe", untertitel: "Briefe im Briefpapier, PDF und Versand", pfad: "/briefe", symbol: "vertraege" },
      { titel: "Zentrale Ablage", untertitel: "Ablage nach Kategorien, Ordner-Upload, Suche", symbol: "dokumente", hinweis: "in Vorbereitung", erklaerung: "Kommt als eigenes Paket (Ablage ohne Fremd-Cloud)." },
    ],
  },
  finanzen: {
    titel: "Finanzen",
    beschreibung: "Rechnungen, Kennzahlen und Abrechnung.",
    kacheln: [
      { titel: "Rechnungen", untertitel: "Erstellen & verwalten", pfad: "/rechnungen", symbol: "abrechnung" },
      { titel: "Kennzahlen", untertitel: "Vermittelte Objekte, Erzielungsquote, Fakten", pfad: "/einstellungen/kennzahlen", symbol: "auswertungen" },
      { titel: "Abo und Credits", untertitel: "Tarif, Zusatznutzer, Guthaben", pfad: "/credits", symbol: "finanzen" },
      { titel: "Auswertungen", untertitel: "Bestand, Vermarktungsdauer, Abschlüsse", pfad: "/auswertungen", symbol: "auswertungen" },
      { titel: "Liquidität", untertitel: "Finanzübersicht & Cashflow", symbol: "finanzen", hinweis: "nicht im Umfang", erklaerung: "Laut Masterprompt nicht übernommen." },
      { titel: "Provisionen", untertitel: "Provisionsrechner", symbol: "finanzen", hinweis: "nicht im Umfang", erklaerung: "Laut Masterprompt nicht übernommen." },
    ],
  },
  admin: {
    titel: "Admin-Bereich",
    beschreibung: "Mitarbeiter, Stammdaten, Kennzahlen, Urlaub, Protokoll — nur für Inhaber und Administratoren.",
    kacheln: [
      { titel: "Mitarbeiter", untertitel: "Team, Rollen, Rechte, Einladungen", pfad: "/einstellungen#zugaenge", symbol: "kontakte" },
      { titel: "Stammdaten", untertitel: "Firmierung, Anschrift, Impressum, Erscheinungsbild", pfad: "/einstellungen", symbol: "einstellungen" },
      { titel: "Kennzahlen", untertitel: "Vermittelte Objekte, Erzielungsquote, Fakten", pfad: "/einstellungen/kennzahlen", symbol: "auswertungen" },
      { titel: "Bausteine", untertitel: "Textbausteine für Bewertung und Exposé", pfad: "/wertermittlung", symbol: "expose", hinweis: "teilweise", erklaerung: "Bausteine der Wertermittlung vorhanden; zentrale Verwaltung folgt." },
      { titel: "Finanzierung", untertitel: "Annahmen für Finanzierungsbeispiele", pfad: "/einstellungen/kennzahlen#finanzierung", symbol: "finanzen" },
      { titel: "Integrationen", untertitel: "onOffice, Propstack, FlowFact, Portale", pfad: "/einstellungen/integrationen", symbol: "portale" },
      { titel: "Urlaub", untertitel: "Anträge, Genehmigung, Kontingente", pfad: "/urlaub", symbol: "kalender" },
      { titel: "Aktivitäts-Log", untertitel: "Wer hat wann was geändert", pfad: "/einstellungen/protokoll", symbol: "aufgaben" },
      { titel: "Bewerber", untertitel: "Einstellungstests verwalten", pfad: "/einstellungen/bewerber", symbol: "bewerber" },
      { titel: "Postfächer", untertitel: "Postfächer des Unternehmens", pfad: "/einstellungen/postfaecher", symbol: "postfach" },
      { titel: "Schnittstelle", untertitel: "Schlüssel und Rückrufe der eigenen API", pfad: "/einstellungen/schnittstelle", symbol: "werkzeuge" },
    ],
  },
};
