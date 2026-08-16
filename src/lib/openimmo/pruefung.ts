import type { Befund, OpenImmoObjekt } from "./typen";

/**
 * Vollständigkeitsprüfung vor dem Portalexport (OPENIMMO_MAPPING.md, Abschnitt 13).
 *
 * Läuft VOR der XML-Erzeugung. Portale weisen unvollständige Objekte ab, und
 * eine Ablehnung nach der Übertragung ist für den Makler deutlich mühsamer als
 * ein Hinweis in der Oberfläche. Deshalb blockiert ein `fehler` den Export.
 */

const KATEGORIE_BEZEICHNUNG: Record<string, string> = {
  wohnung: "Wohnung",
  haus: "Haus",
  grundstueck: "Grundstück",
  gewerbe: "Gewerbe",
  anlage: "Anlageimmobilie",
  sonstige: "Sonstige",
};

function istMiete(art: string): boolean {
  return art === "miete" || art === "kauf_miete";
}

function istKauf(art: string): boolean {
  return art === "kauf" || art === "kauf_miete";
}

export function exportPruefen(objekt: OpenImmoObjekt): Befund[] {
  const befunde: Befund[] = [];

  const fehler = (feld: string, bezeichnung: string, hinweis: string) =>
    befunde.push({ feld, bezeichnung, hinweis, schwere: "fehler" });
  const warnung = (feld: string, bezeichnung: string, hinweis: string) =>
    befunde.push({ feld, bezeichnung, hinweis, schwere: "warnung" });

  // --- Pflichtangaben aller Objektarten ------------------------------------
  if (!objekt.ort || !objekt.plz) {
    fehler(
      "ort",
      "Ort und Postleitzahl",
      "Ohne Ort und Postleitzahl ist das Objekt im Portal nicht auffindbar.",
    );
  }

  if (!objekt.titel || objekt.titel.trim() === "") {
    fehler(
      "titel",
      "Exposé-Titel",
      "Portale zeigen den Titel als Überschrift der Anzeige.",
    );
  }

  if (!objekt.beschreibung_objekt || objekt.beschreibung_objekt.trim() === "") {
    fehler(
      "beschreibung_objekt",
      "Objektbeschreibung",
      "Ohne Beschreibungstext wird die Anzeige abgelehnt.",
    );
  }

  // --- Preis ----------------------------------------------------------------
  if (istKauf(objekt.vermarktungsart)) {
    if (objekt.kaufpreis === null && !objekt.kaufpreis_auf_anfrage) {
      fehler(
        "kaufpreis",
        "Kaufpreis",
        'Kaufpreis angeben oder ausdrücklich "auf Anfrage" setzen.',
      );
    }
  }
  if (istMiete(objekt.vermarktungsart) && objekt.kaltmiete === null) {
    fehler("kaltmiete", "Kaltmiete", "Bei Mietobjekten ist die Kaltmiete Pflicht.");
  }

  // --- Flächen je Objektart -------------------------------------------------
  const kategorie = KATEGORIE_BEZEICHNUNG[objekt.objektkategorie] ?? "Objekt";

  if (objekt.objektkategorie === "grundstueck") {
    if (objekt.grundstuecksflaeche === null) {
      fehler(
        "grundstuecksflaeche",
        "Grundstücksfläche",
        `Bei ${kategorie} ist die Grundstücksfläche die zentrale Kenngröße.`,
      );
    }
  } else if (objekt.objektkategorie === "gewerbe") {
    if (objekt.nutzflaeche === null && objekt.wohnflaeche === null) {
      fehler(
        "nutzflaeche",
        "Nutzfläche",
        "Bei Gewerbeobjekten ist die Nutzfläche Pflicht.",
      );
    }
  } else {
    if (objekt.wohnflaeche === null) {
      fehler("wohnflaeche", "Wohnfläche", `Bei ${kategorie} ist die Wohnfläche Pflicht.`);
    }
    if (objekt.zimmer === null) {
      fehler("zimmer", "Zimmeranzahl", "Portale filtern nach Zimmerzahl.");
    }
  }

  // --- Energieausweis (GEG) -------------------------------------------------
  // Für Grundstücke entfällt die Pflicht.
  if (objekt.objektkategorie !== "grundstueck") {
    if (!objekt.energieausweis_typ) {
      fehler(
        "energieausweis_typ",
        "Art des Energieausweises",
        "Nach dem Gebäudeenergiegesetz sind Energieangaben in Anzeigen pflichtig.",
      );
    } else if (
      objekt.energieausweis_typ === "bedarf" ||
      objekt.energieausweis_typ === "verbrauch"
    ) {
      // Der Kennwert gehört je nach Ausweistyp in ein ANDERES OpenImmo-Element.
      // Fehlt er, passt die Zuordnung nicht und das Portal weist ab.
      if (objekt.energie_kennwert === null) {
        fehler(
          "energie_kennwert",
          "Energiekennwert",
          objekt.energieausweis_typ === "bedarf"
            ? "Beim Bedarfsausweis ist der Endenergiebedarf anzugeben."
            : "Beim Verbrauchsausweis ist der Energieverbrauchskennwert anzugeben.",
        );
      }
      if (!objekt.energie_traeger) {
        warnung(
          "energie_traeger",
          "Wesentlicher Energieträger",
          "Wird von mehreren Portalen erwartet.",
        );
      }
      if (!objekt.energie_klasse) {
        warnung(
          "energie_klasse",
          "Energieeffizienzklasse",
          "Für Gebäude mit Ausweis ab Mai 2014 anzugeben.",
        );
      }
    }
  }

  // --- Freigabe der Texte ---------------------------------------------------
  // Abschnitt 8: Texte sind vor Veröffentlichung zu bestätigen.
  if (!objekt.texte_freigegeben_am) {
    fehler(
      "texte_freigegeben_am",
      "Freigabe der Texte",
      "Die Texte sind vor der Veröffentlichung zu prüfen und freizugeben.",
    );
  }

  // --- Hinweise -------------------------------------------------------------
  if (objekt.lat === null || objekt.lon === null) {
    warnung(
      "lat",
      "Geokoordinaten",
      "Ohne Koordinaten platzieren Portale das Objekt nur ungefähr.",
    );
  }
  if (!objekt.beschreibung_lage) {
    warnung(
      "beschreibung_lage",
      "Lagebeschreibung",
      "Erhöht die Sichtbarkeit in der Umkreissuche.",
    );
  }
  if (objekt.baujahr === null && objekt.objektkategorie !== "grundstueck") {
    warnung("baujahr", "Baujahr", "Wird von Interessenten häufig als Filter genutzt.");
  }

  return befunde;
}

/** Blockiert mindestens ein Befund den Export? */
export function exportMoeglich(befunde: Befund[]): boolean {
  return !befunde.some((b) => b.schwere === "fehler");
}
