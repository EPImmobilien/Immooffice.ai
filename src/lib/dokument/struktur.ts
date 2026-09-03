/**
 * Gemeinsame Dokumentstruktur fuer PDF und Word: Titel, Abschnitte mit
 * Absaetzen, Tabellen und Unterschriftsfeldern. Vertraege, Protokolle und
 * Laufzettel werden zuerst in diese Struktur gebracht und dann gerendert —
 * so bleiben beide Ausgaben inhaltsgleich.
 */
export interface Unterschriftsfeld {
  bezeichnung: string;
  name: string;
  /** Data-URL (PNG) einer gezeichneten Unterschrift, sonst Linie */
  bild: string | null;
  zeit: string | null;
}

export interface Tabelle {
  spalten: string[];
  zeilen: string[][];
}

export interface Abschnitt {
  ueberschrift?: string;
  absaetze?: string[];
  tabelle?: Tabelle;
  unterschriften?: Unterschriftsfeld[];
  /** Seitenumbruch vor dem Abschnitt */
  neueSeite?: boolean;
}

export interface Dokument {
  titel: string;
  untertitel?: string;
  abschnitte: Abschnitt[];
  /** Kleingedruckter Hinweis am Ende */
  fussnote?: string;
}

export interface Briefkopf {
  firmenname: string;
  zeile2: string;
  zeile3: string;
  /** PNG/JPEG als Data-URL, optional */
  logo: string | null;
  farbePrimaer: string;
  farbeAkzent: string;
}

/** Ist die Zeile eine Ueberschrift („§ 3 Provision", „MAKLERVERTRAG", „Anlage:")? */
function istUeberschrift(zeile: string): boolean {
  const t = zeile.trim();
  if (t.length === 0 || t.length > 90) return false;
  if (/^§ ?\d+/.test(t)) return true;
  if (/^Anlage:/.test(t)) return true;
  // Reine Grossbuchstaben-Zeile (Titel), Klammern und Bindestriche erlaubt
  return /^[A-ZÄÖÜ][A-ZÄÖÜ0-9 /–-]+(?:\s*\([^)]*\))?$/.test(t) && !/[.:]$/.test(t);
}

/** Fliesstext eines Vertrags (mit „§ n"-Ueberschriften) in Abschnitte teilen. */
export function textZuDokument(titel: string, inhalt: string, fussnote?: string): Dokument {
  const zeilen = inhalt.replace(/\r/g, "").split("\n");
  const abschnitte: Abschnitt[] = [];
  let aktuell: Abschnitt = { absaetze: [] };
  const abschliessen = () => {
    if ((aktuell.absaetze?.length ?? 0) > 0 || aktuell.ueberschrift) abschnitte.push(aktuell);
  };
  for (const roh of zeilen) {
    const zeile = roh.trimEnd();
    if (istUeberschrift(zeile)) {
      abschliessen();
      aktuell = { ueberschrift: zeile.trim(), absaetze: [] };
      continue;
    }
    if (zeile.trim() === "") {
      if ((aktuell.absaetze?.length ?? 0) > 0 && aktuell.absaetze?.at(-1) !== "") aktuell.absaetze?.push("");
      continue;
    }
    aktuell.absaetze?.push(zeile);
  }
  abschliessen();
  for (const a of abschnitte) {
    a.absaetze = (a.absaetze ?? []).filter((z, i, arr) => !(z === "" && (i === arr.length - 1 || i === 0)));
  }
  return fussnote ? { titel, abschnitte, fussnote } : { titel, abschnitte };
}
