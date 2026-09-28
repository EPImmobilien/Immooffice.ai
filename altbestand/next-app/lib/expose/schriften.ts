import { Font } from "@react-pdf/renderer";

import {
  INTER_400,
  INTER_500,
  INTER_600,
  POPPINS_500,
  POPPINS_600,
  POPPINS_700,
} from "./schriften-daten";

/**
 * Hausschriften fuer alle PDF-Dokumente.
 *
 * Ohne diese Registrierung faellt die PDF-Erzeugung auf Helvetica zurueck.
 * Das ist kein Schoenheitsfehler: Die Anwendung tritt in Poppins und Inter
 * auf, das Exposé sah dadurch aus wie ein Ausdruck aus einem anderen
 * Programm. Die Wortmarke steht in Poppins — ein Dokument in Helvetica
 * daneben wirkt wie von einem fremden Absender.
 *
 * ── Warum die Schriften im Quelltext stehen ──────────────────────────────
 *
 * Frueher wurden die Dateien zur Laufzeit aus @fontsource geladen, aufgeloest
 * ueber `require.resolve`. Das lief lokal und im Test fehlerfrei und ist in
 * der Produktion vollstaendig ausgefallen: Kein einziges Exposé liess sich
 * mehr erzeugen. Der Grund ist unspektakulaer und war von aussen nicht zu
 * sehen — ein `require.resolve` auf eine .woff-Datei kann der Bundler nicht
 * nachvollziehen, die Dateien fehlten deshalb im Funktionsbuendel, und
 * `Font.register` zeigte auf Pfade, die es dort nicht gab.
 *
 * Der naechstliegende Ausweg, `outputFileTracingIncludes` in next.config.ts,
 * traegt hier NICHT: Next wendet diese Liste nur auf webpack-Eintraege an, und
 * gebaut wird mit Turbopack. Nachgeprueft an den erzeugten .nft.json-Dateien —
 * sie enthielten weiterhin keine einzige Schriftdatei.
 *
 * Jetzt sind die Schnitte als Base64 Teil des Moduls (siehe
 * scripts/schriften-einbetten.mjs). Damit gibt es keinen Pfad mehr, der ins
 * Leere zeigen kann, und das Verhalten ist in Entwicklung, Test und
 * Produktion identisch. Rund 200 KB Quelltext sind der Preis dafuer, dass
 * dieser Ausfall nicht wiederkommen kann.
 *
 * Bewusst OHNE `server-only`: Die Datei wird von den Vorlagen eingebunden,
 * und die laufen auch im Test. Die Vorlagen selbst werden ausschliesslich
 * serverseitig gerendert.
 */

interface Schnitt {
  daten: string;
  fontWeight: number;
  /** Standardschrift, die einspringt, wenn die Daten fehlen. */
  ersatz: string;
}

const POPPINS: Schnitt[] = [
  { daten: POPPINS_500, fontWeight: 500, ersatz: "Helvetica" },
  { daten: POPPINS_600, fontWeight: 600, ersatz: "Helvetica-Bold" },
  { daten: POPPINS_700, fontWeight: 700, ersatz: "Helvetica-Bold" },
];

const INTER: Schnitt[] = [
  { daten: INTER_400, fontWeight: 400, ersatz: "Helvetica" },
  { daten: INTER_500, fontWeight: 500, ersatz: "Helvetica" },
  { daten: INTER_600, fontWeight: 600, ersatz: "Helvetica-Bold" },
];

export interface Schriftplan {
  poppins: { src: string; fontWeight: number }[];
  inter: { src: string; fontWeight: number }[];
  /** Falsch, sobald mindestens ein Schnitt durch eine Standardschrift ersetzt wurde. */
  vollstaendig: boolean;
}

/**
 * Legt fest, welche Quelle je Schnitt verwendet wird.
 *
 * Der Rueckfall auf eine Standardschrift ist nach der Umstellung auf
 * eingebettete Daten unwahrscheinlich geworden, bleibt aber bestehen: Er
 * greift, wenn die erzeugte Datei leer oder unvollstaendig ist. Entscheidend
 * ist, dass beide Familien in jedem Fall registriert werden — die Vorlagen
 * verlangen die Familiennamen „Poppins" und „Inter", und eine unbekannte
 * Familie laesst die PDF-Erzeugung mit einer Ausnahme abbrechen. Ein Exposé
 * in Helvetica ist ein Schoenheitsfehler, ein Exposé, das sich nicht erzeugen
 * laesst, ist ein Ausfall.
 */
export function schriftplan(schnitte: {
  poppins: Schnitt[];
  inter: Schnitt[];
} = { poppins: POPPINS, inter: INTER }): Schriftplan {
  let vollstaendig = true;

  const zuordnen = (liste: Schnitt[]) =>
    liste.map(({ daten, fontWeight, ersatz }) => {
      if (!daten) {
        vollstaendig = false;
        return { src: ersatz, fontWeight };
      }
      return { src: `data:font/woff;base64,${daten}`, fontWeight };
    });

  return {
    poppins: zuordnen(schnitte.poppins),
    inter: zuordnen(schnitte.inter),
    vollstaendig,
  };
}

/** Nur fuer Tests: die eingebetteten Schnitte im Rohzustand. */
export const SCHNITTE = { poppins: POPPINS, inter: INTER } as const;

let registriert = false;

/**
 * Registriert die Schriften genau einmal.
 *
 * `Font.register` ist global. Ein zweiter Aufruf mit derselben Familie
 * ueberschreibt die Angaben und kostet bei jedem PDF unnoetig Zeit.
 */
export function schriftenBereitstellen(): void {
  if (registriert) return;

  const plan = schriftplan();

  if (!plan.vollstaendig) {
    // Sichtbar im Server-Protokoll, damit ein fehlerhaftes Buendel auffaellt,
    // bevor jemand die Exposés fuer haesslich haelt.
    console.warn(
      "[Exposé] Hausschriften nicht eingebettet — es wird auf Standardschriften " +
        "zurueckgegriffen. Neu erzeugen: node scripts/schriften-einbetten.mjs",
    );
  }

  Font.register({ family: "Poppins", fonts: plan.poppins });
  Font.register({ family: "Inter", fonts: plan.inter });

  // Ohne diesen Eingriff trennt die PDF-Erzeugung Woerter an vermeintlichen
  // Silbengrenzen. Fuer deutsche Zusammensetzungen wie "Mehrfamilienhaus"
  // faellt das Ergebnis regelmaessig falsch aus. Lieber ein etwas
  // unruhigerer Flattersatz als "Mehrfamilie-nhaus" im Kundendokument.
  Font.registerHyphenationCallback((wort) => [wort]);

  registriert = true;
}
