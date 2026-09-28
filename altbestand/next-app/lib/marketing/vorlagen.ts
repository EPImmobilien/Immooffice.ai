import { Fluss, umbrechen, xmlText } from "./layout";

/**
 * Marketing-Vorlagen (Master-Prompt Abschnitt 12).
 *
 * Bewusst ein deterministischer Vorlagen-Ansatz: Das Layout entsteht aus
 * festen Regeln, nicht aus einem Bildmodell. Abschnitt 12 verlangt das
 * ausdruecklich — Bild-KI erzeugt zwar hübsche Flächen, setzt Text aber
 * unzuverlaessig, und ein Verkaufsschild mit verrutschtem Preis ist wertlos.
 *
 * Bild-KI ist damit nicht ausgeschlossen; sie liefert spaeter Bildinhalte,
 * nicht das Layout.
 */

export type FormatSchluessel =
  | "instagram_post"
  | "instagram_story"
  | "verkaufsschild"
  | "flyer_a5"
  | "objektanzeige"
  | "postkarte";

export interface MarketingFormat {
  schluessel: FormatSchluessel;
  name: string;
  hinweis: string;
  /** Zeichenflaeche in Punkten; 1 pt entspricht bei 300 dpi 4,17 px. */
  breite: number;
  hoehe: number;
  /** Fuer die Anzeige: gerundetes Seitenverhaeltnis. */
  verhaeltnis: string;
  /** Druckerzeugnis oder Bildschirm — steuert Anschnitt und Auflösung. */
  art: "digital" | "druck";
}

export const FORMATE: MarketingFormat[] = [
  {
    schluessel: "instagram_post",
    name: "Instagram-Post",
    hinweis: "Quadratisch, für den Feed",
    breite: 1080,
    hoehe: 1080,
    verhaeltnis: "1:1",
    art: "digital",
  },
  {
    schluessel: "instagram_story",
    name: "Instagram-Story",
    hinweis: "Hochformat, bildschirmfüllend",
    breite: 1080,
    hoehe: 1920,
    verhaeltnis: "9:16",
    art: "digital",
  },
  {
    schluessel: "verkaufsschild",
    name: "Verkaufsschild",
    hinweis: "Für Fenster und Bauzaun, A3 hoch",
    breite: 842,
    hoehe: 1191,
    verhaeltnis: "A3",
    art: "druck",
  },
  {
    schluessel: "flyer_a5",
    name: "Flyer A5",
    hinweis: "Handzettel und Auslage",
    breite: 420,
    hoehe: 595,
    verhaeltnis: "A5",
    art: "druck",
  },
  {
    schluessel: "objektanzeige",
    name: "Objektanzeige",
    hinweis: "Quer, für Portale und Print",
    breite: 1200,
    hoehe: 628,
    verhaeltnis: "1,91:1",
    art: "digital",
  },
  {
    schluessel: "postkarte",
    name: "Postkarte",
    hinweis: "Akquise im Umfeld, A6 quer",
    breite: 595,
    hoehe: 420,
    verhaeltnis: "A6",
    art: "druck",
  },
];

export function formatFinden(schluessel: string): MarketingFormat | undefined {
  return FORMATE.find((f) => f.schluessel === schluessel);
}

export interface MarketingInhalt {
  kopfzeile: string;
  titel: string;
  ort: string;
  eckdaten: { bezeichnung: string; wert: string }[];
  preis: string;
  preisLabel: string;
  firmenname: string;
  kontakt: string;
  farbePrimaer: string;
  farbeAkzent: string;
  /** Sichtbarer Hinweis, wenn KI im Spiel war (Abschnitt 10). */
  kiHinweis?: string;
}

/**
 * Erzeugt das Motiv als SVG.
 *
 * SVG statt Rasterbild: Das Ergebnis bleibt in jeder Groesse scharf, laesst
 * sich im Browser anzeigen und serverseitig unveraendert in PDF oder PNG
 * ueberfuehren — und ist textbasiert, also im Repository nachvollziehbar.
 *
 * Hoch- und Querformat bekommen unterschiedliche Aufteilungen. Im Querformat
 * uebereinander zu stapeln, laesst zu wenig Hoehe fuer den Textblock; dort
 * steht das Bild deshalb links und der Text rechts daneben.
 */
export function motivSvg(
  format: MarketingFormat,
  inhalt: MarketingInhalt,
): string {
  const { breite: b, hoehe: h } = format;
  const quer = b > h * 1.25;
  const rand = Math.round(Math.min(b, h) * 0.075);

  // Textspalte: im Querformat die rechte Haelfte, sonst die volle Breite.
  const bildBreite = quer ? Math.round(b * 0.44) : b;
  const textX = quer ? bildBreite + rand : rand;
  const textBreite = (quer ? b - bildBreite : b) - rand * 2;

  const bezug = quer ? textBreite : b;
  // Quadratische Formate bekommen einen etwas kleineren Titel: sonst passen
  // zwei Zeilen nur um den Preis eines geschrumpften Bildes.
  const titelGr = Math.round(bezug * (quer ? 0.075 : 0.068));
  const ortGr = Math.round(bezug * 0.042);
  // Im Hochformat etwas kleiner: Preisband und Fusszeile sind fest verankert
  // und nehmen dem Bild sonst Hoehe, die es dort dringender braucht.
  const preisGr = Math.round(bezug * (quer ? 0.09 : 0.078));
  const eckGr = Math.round(bezug * 0.038);
  const kleinGr = Math.round(bezug * 0.03);

  const eckdaten = inhalt.eckdaten.slice(0, 3);

  // Preisband und Fusszeile sind am unteren Rand verankert.
  const fussY = h - rand;
  const bandHoehe = Math.round(preisGr * 2.1);
  const bandY = fussY - kleinGr * 2.2 - bandHoehe;

  // Der Textblock braucht so viel Hoehe, wie sein Inhalt verlangt; im
  // Hochformat bekommt das Bild den Rest. Reicht der Rest nicht fuer ein
  // erkennbares Bild, weicht der TITEL — lieber eine Zeile weniger als ein
  // Preisband, das im Text liegt. Genau dieser Fall trat beim quadratischen
  // Format mit langem Titel auf.
  //
  // Zwei Groessen statt einer: `bildZiel` ist die Aufteilung, die das Motiv
  // anstrebt, `bildMindest` die Grenze, unter die es nie faellt. Mit nur einer
  // Groesse blieb das Bild genau auf der Untergrenze stehen, sobald der Titel
  // drei Zeilen brauchte — bei einem Instagram-Beitrag, der vom Bild lebt, ist
  // ein Fuenftel der Flaeche zu wenig. Aufgefallen ist das erst beim
  // Betrachten der erzeugten Motive.
  const bildMindest = Math.round(h * (quer ? 1 : 0.2));
  const bildZiel = Math.round(h * (quer ? 1 : 0.45));
  const abstandUeberText = 1.15;

  const blockHoehe = (anzahlZeilen: number) =>
    anzahlZeilen * titelGr * 1.18 +
    ortGr * 1.35 +
    (eckdaten.length > 0 ? kleinGr + eckGr * 1.25 + eckGr * 0.9 : 0);

  let zeilen = umbrechen(inhalt.titel, textBreite, titelGr, 3);
  if (!quer) {
    for (const grenze of [3, 2, 1]) {
      zeilen = umbrechen(inhalt.titel, textBreite, titelGr, grenze);
      if (bandY - rand * abstandUeberText - blockHoehe(zeilen.length) >= bildZiel) break;
    }
  }

  const bildHoehe = quer
    ? h
    : Math.max(bildMindest, Math.round(bandY - rand * abstandUeberText - blockHoehe(zeilen.length)));

  const fluss = new Fluss(quer ? rand : bildHoehe + rand);
  const t = xmlText;

  const titelZeilen = zeilen
    .map((zeile) => {
      const y = fluss.naechste(titelGr * 1.18);
      return `<text x="${textX}" y="${y}" font-family="Poppins, Inter, sans-serif" font-size="${titelGr}" font-weight="600" fill="${inhalt.farbePrimaer}">${t(zeile)}</text>`;
    })
    .join("");

  const ortY = fluss.naechste(ortGr, ortGr * 0.35);
  const eckOben = fluss.naechste(0, eckGr * 0.9);

  const eckSpalte = textBreite / Math.max(eckdaten.length, 1);
  const eckBlock = eckdaten
    .map((e, i) => {
      const x = textX + i * eckSpalte;
      return `<text x="${x}" y="${eckOben + kleinGr}" font-family="Inter, sans-serif" font-size="${kleinGr}" fill="${inhalt.farbePrimaer}" opacity="0.6">${t(e.bezeichnung)}</text><text x="${x}" y="${eckOben + kleinGr + eckGr * 1.25}" font-family="Inter, sans-serif" font-size="${eckGr}" font-weight="600" fill="${inhalt.farbePrimaer}">${t(e.wert)}</text>`;
    })
    .join("");

  const bildX = 0;
  const markeGroesse = Math.min(bildBreite, bildHoehe) * 0.32;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b} ${h}" width="${b}" height="${h}" role="img" aria-label="${t(inhalt.titel)}">
  <rect width="${b}" height="${h}" fill="#FFFFFF"/>

  <!-- Bildbereich. Platzhalter, solange kein Objektbild hinterlegt ist. -->
  <rect x="${bildX}" y="0" width="${bildBreite}" height="${bildHoehe}" fill="${inhalt.farbePrimaer}"/>
  <g opacity="0.12" fill="#FFFFFF" transform="translate(${bildBreite / 2 - markeGroesse / 2} ${bildHoehe / 2 - markeGroesse / 2}) scale(${markeGroesse / 64})">
    <path d="M16 55V26a16 16 0 0 1 32 0v29Z"/>
    <path d="M32 19a7.5 7.5 0 0 0-4.1 13.78L25.4 46h13.2l-2.5-13.22A7.5 7.5 0 0 0 32 19Z"/>
  </g>
  <text x="${rand}" y="${rand + kleinGr}" font-family="Inter, sans-serif" font-size="${kleinGr}" font-weight="600" letter-spacing="${kleinGr * 0.14}" fill="${inhalt.farbeAkzent}">${t(inhalt.kopfzeile.toUpperCase())}</text>
${
  inhalt.kiHinweis
    ? `  <text x="${bildBreite - rand}" y="${rand + kleinGr}" text-anchor="end" font-family="Inter, sans-serif" font-size="${kleinGr * 0.82}" fill="#FFFFFF" opacity="0.7">${t(inhalt.kiHinweis)}</text>`
    : ""
}

  <!-- Textblock -->
  ${titelZeilen}
  <text x="${textX}" y="${ortY}" font-family="Inter, sans-serif" font-size="${ortGr}" fill="${inhalt.farbePrimaer}" opacity="0.62">${t(inhalt.ort)}</text>
  ${eckBlock}

  <!-- Preisband, am Fuss verankert -->
  <rect x="${quer ? textX - rand : 0}" y="${bandY}" width="${quer ? b - textX + rand : b}" height="${bandHoehe}" fill="${inhalt.farbeAkzent}" opacity="0.1"/>
  <rect x="${quer ? textX - rand : 0}" y="${bandY}" width="${Math.round(rand * 0.3)}" height="${bandHoehe}" fill="${inhalt.farbeAkzent}"/>
  <text x="${textX}" y="${bandY + kleinGr * 1.5}" font-family="Inter, sans-serif" font-size="${kleinGr}" letter-spacing="${kleinGr * 0.1}" fill="${inhalt.farbePrimaer}" opacity="0.65">${t(inhalt.preisLabel.toUpperCase())}</text>
  <text x="${textX}" y="${bandY + bandHoehe - preisGr * 0.35}" font-family="Poppins, Inter, sans-serif" font-size="${preisGr}" font-weight="600" fill="${inhalt.farbePrimaer}">${t(inhalt.preis)}</text>

  <!-- Fusszeile -->
  <text x="${textX}" y="${fussY}" font-family="Inter, sans-serif" font-size="${kleinGr}" font-weight="600" fill="${inhalt.farbePrimaer}">${t(inhalt.firmenname)}</text>
  <text x="${b - rand}" y="${fussY}" text-anchor="end" font-family="Inter, sans-serif" font-size="${kleinGr}" fill="${inhalt.farbePrimaer}" opacity="0.62">${t(inhalt.kontakt)}</text>
</svg>`;
}
