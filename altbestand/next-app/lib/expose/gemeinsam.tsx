import type { Style } from "@react-pdf/types";
import { StyleSheet, Text, View } from "@react-pdf/renderer";

import { adresse, euro, flaeche, zahl } from "@/lib/format";
import {
  ENERGIEAUSWEISTYPEN,
  OBJEKTKATEGORIEN,
  istMiete,
} from "@/lib/objekt-begriffe";

import type { ExposeBranding, ExposeObjekt } from "./typen";

/**
 * Bausteine, die alle fuenf Vorlagen teilen (Abschnitt 8).
 *
 * Hier stehen die Inhalte, die sich nicht je Vorlage unterscheiden duerfen:
 * die Ableitung der Eckdaten, der Haftungshinweis und die Kennzeichnung
 * KI-erzeugter Texte. Waeren sie je Vorlage kopiert, koennte eine davon
 * abweichen — und genau die Kennzeichnung aus Abschnitt 10 ist nichts, was
 * eine einzelne Vorlage vergessen darf.
 */

export const HAFTUNG =
  "Alle Angaben beruhen auf Informationen des Eigentümers. Eine Haftung für Vollständigkeit und Richtigkeit wird nicht übernommen. Irrtum und Zwischenverkauf vorbehalten.";

export const KI_TEXTVERMERK =
  "Die Beschreibungstexte wurden mit Unterstützung künstlicher Intelligenz erstellt und redaktionell geprüft.";

export const KI_BILDVERMERK =
  "Einzelne Bilder wurden digital nachbearbeitet. Die Bearbeitung verändert nicht die bauliche Substanz.";

export interface Eckdatum {
  bezeichnung: string;
  wert: string;
}

/**
 * Kuerzt an der Wortgrenze und kennzeichnet die Kuerzung.
 *
 * Gebraucht von den Vorlagen mit fester Seitenzahl. Dort ist ein zu langer
 * Text kein Schoenheitsfehler, sondern eine zweite Seite — und ein Aushang
 * oder Kurzexposé auf zwei Seiten verfehlt seinen Zweck. Gekuerzt wird
 * sichtbar, damit niemand einen abgeschnittenen Satz fuer den ganzen haelt.
 */
export function kuerzen(text: string | null, zeichen: number): string | null {
  if (!text) return null;
  const sauber = text.trim();
  if (sauber.length <= zeichen) return sauber;
  const schnitt = sauber.slice(0, zeichen);
  const grenze = schnitt.lastIndexOf(" ");
  return `${(grenze > zeichen * 0.6 ? schnitt.slice(0, grenze) : schnitt).trimEnd()} …`;
}

/** Preisangabe je nach Vermarktungsart. */
export function preisAngabe(objekt: ExposeObjekt): {
  label: string;
  wert: string;
} {
  return istMiete(objekt.vermarktungsart)
    ? { label: "Kaltmiete monatlich", wert: euro(objekt.kaltmiete) }
    : { label: "Kaufpreis", wert: euro(objekt.kaufpreis) };
}

/**
 * Ortszeile.
 *
 * Ist die Adresse nicht zur Veroeffentlichung freigegeben, erscheint sie auch
 * hier nicht — die Freigabe ist eine Eigenschaft des Objekts und keine
 * Einstellung der Vorlage.
 */
export function ortszeile(objekt: ExposeObjekt): string {
  if (objekt.adresse_veroeffentlichen) return adresse(objekt);
  return [objekt.plz, objekt.ort].filter(Boolean).join(" ") || "Auf Anfrage";
}

export function kategorieName(objekt: ExposeObjekt): string {
  return (
    objekt.objektart ??
    OBJEKTKATEGORIEN[objekt.objektkategorie as keyof typeof OBJEKTKATEGORIEN] ??
    "Immobilie"
  );
}

/** Alle belegten Eckdaten in fester Reihenfolge. Leere Angaben entfallen. */
export function eckdaten(objekt: ExposeObjekt): Eckdatum[] {
  const liste: (Eckdatum | null)[] = [
    objekt.wohnflaeche !== null
      ? { bezeichnung: "Wohnfläche", wert: flaeche(objekt.wohnflaeche) }
      : null,
    objekt.nutzflaeche !== null
      ? { bezeichnung: "Nutzfläche", wert: flaeche(objekt.nutzflaeche) }
      : null,
    objekt.grundstuecksflaeche !== null
      ? { bezeichnung: "Grundstück", wert: flaeche(objekt.grundstuecksflaeche) }
      : null,
    objekt.zimmer !== null
      ? { bezeichnung: "Zimmer", wert: zahl(objekt.zimmer) }
      : null,
    objekt.baujahr !== null
      ? { bezeichnung: "Baujahr", wert: String(objekt.baujahr) }
      : null,
    objekt.nebenkosten !== null
      ? { bezeichnung: "Nebenkosten", wert: euro(objekt.nebenkosten) }
      : null,
    objekt.hausgeld !== null
      ? { bezeichnung: "Hausgeld", wert: euro(objekt.hausgeld) }
      : null,
    objekt.provision_kaeufer
      ? { bezeichnung: "Provision", wert: objekt.provision_kaeufer }
      : null,
  ];
  return liste.filter((e): e is Eckdatum => e !== null);
}

/**
 * Angaben zum Energieausweis.
 *
 * Erscheint auch dann, wenn nichts vorliegt: Ein fehlender Energieausweis ist
 * eine Aussage, kein Grund, den Abschnitt wegzulassen.
 */
export function energiedaten(objekt: ExposeObjekt): Eckdatum[] {
  return [
    {
      bezeichnung: "Art",
      wert: objekt.energieausweis_typ
        ? (ENERGIEAUSWEISTYPEN[
            objekt.energieausweis_typ as keyof typeof ENERGIEAUSWEISTYPEN
          ] ?? "–")
        : "Liegt nicht vor",
    },
    {
      bezeichnung: "Kennwert",
      wert:
        objekt.energie_kennwert !== null
          ? `${zahl(objekt.energie_kennwert)} kWh/(m²·a)`
          : "–",
    },
    { bezeichnung: "Effizienzklasse", wert: objekt.energie_klasse ?? "–" },
  ];
}

/** Eine Zeile mit den Kontaktangaben des Mandanten. */
export function kontaktzeile(branding: ExposeBranding): string {
  return [branding.firmenname, branding.telefon, branding.email, branding.web]
    .filter(Boolean)
    .join(" · ");
}

export function anschriftzeile(branding: ExposeBranding): string {
  return [branding.strasse, [branding.plz, branding.ort].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");
}

const stile = StyleSheet.create({
  vermerk: {
    fontFamily: "Inter",
    fontSize: 7.5,
    lineHeight: 1.5,
    color: "#7A828C",
    marginTop: 4,
  },
});

/**
 * Kennzeichnung nach Abschnitt 10 und 11.
 *
 * Nicht abschaltbar: Die Komponente entscheidet allein anhand der Daten, ob
 * sie etwas ausgibt. Es gibt keinen Schalter, der sie unterdrueckt.
 */
export function KiVermerk({
  texteKiErzeugt,
  bilderKiBearbeitet,
  style,
}: {
  texteKiErzeugt: boolean;
  bilderKiBearbeitet: boolean;
  style?: Style;
}) {
  if (!texteKiErzeugt && !bilderKiBearbeitet) return null;

  return (
    <View>
      {texteKiErzeugt && (
        <Text style={[stile.vermerk, style ?? {}]}>{KI_TEXTVERMERK}</Text>
      )}
      {bilderKiBearbeitet && (
        <Text style={[stile.vermerk, style ?? {}]}>{KI_BILDVERMERK}</Text>
      )}
    </View>
  );
}
