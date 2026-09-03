import {
  ENERGIEAUSWEISTYPEN,
  ENERGIEKLASSEN,
  NUTZUNGSARTEN,
  OBJEKTKATEGORIEN,
  OBJEKTSTATUS,
  TERMINARTEN,
  VERMARKTUNGSARTEN,
} from "./schemata";

/**
 * OpenAPI-3.1-Beschreibung der Schnittstelle (docs/AUTONOMIE.md 5.4), von
 * Hand gepflegt und in Tests gegen die Zod-Schemata geprueft.
 */

type Schema = Record<string, unknown>;

const text = (beschreibung?: string, max = 200): Schema => ({ type: ["string", "null"], maxLength: max, ...(beschreibung ? { description: beschreibung } : {}) });
const betrag = (beschreibung?: string): Schema => ({ type: ["number", "null"], minimum: 0, ...(beschreibung ? { description: beschreibung } : {}) });
const ganz = (beschreibung?: string): Schema => ({ type: ["integer", "null"], minimum: 0, ...(beschreibung ? { description: beschreibung } : {}) });
const aufzaehlung = (werte: readonly string[], beschreibung?: string): Schema => ({ type: "string", enum: [...werte], ...(beschreibung ? { description: beschreibung } : {}) });
const zeitpunkt = (beschreibung?: string): Schema => ({ type: "string", format: "date-time", ...(beschreibung ? { description: beschreibung } : {}) });

const OBJEKT_EINGABE: Record<string, Schema> = {
  objektnummer: { type: "string", maxLength: 50, description: "Leer = wird fortlaufend vergeben" },
  bezeichnung: { type: "string", minLength: 1, maxLength: 200 },
  titel: text("Exposé-Titel"),
  vermarktungsart: aufzaehlung(VERMARKTUNGSARTEN),
  objektkategorie: aufzaehlung(OBJEKTKATEGORIEN),
  objektart: text(),
  nutzungsart: aufzaehlung(NUTZUNGSARTEN),
  status: aufzaehlung(OBJEKTSTATUS),
  strasse: text(),
  hausnummer: text(undefined, 20),
  plz: { type: ["string", "null"], pattern: "^[0-9]{4,5}$" },
  ort: text(),
  ortsteil: text(),
  land: { type: "string", minLength: 2, maxLength: 2, default: "DE" },
  adresse_veroeffentlichen: { type: "boolean" },
  wohnflaeche: betrag("m²"),
  nutzflaeche: betrag("m²"),
  grundstuecksflaeche: betrag("m²"),
  zimmer: betrag(),
  schlafzimmer: ganz(),
  badezimmer: ganz(),
  baujahr: { type: ["integer", "null"], minimum: 1000, maximum: 2200 },
  zustand: text(),
  verfuegbar_ab: text(),
  kaufpreis: betrag("Euro, netto"),
  kaufpreis_auf_anfrage: { type: "boolean" },
  kaltmiete: betrag("Euro je Monat"),
  warmmiete: betrag("Euro je Monat"),
  nebenkosten: betrag("Euro je Monat"),
  heizkosten: betrag("Euro je Monat"),
  kaution: betrag("Euro"),
  hausgeld: betrag("Euro je Monat"),
  provision_kaeufer: text(),
  provision_hinweis: text(undefined, 2000),
  courtage_frei: { type: "boolean" },
  energieausweis_typ: { type: ["string", "null"], enum: [...ENERGIEAUSWEISTYPEN, null] },
  energie_kennwert: betrag("kWh/(m²·a)"),
  energie_klasse: { type: ["string", "null"], enum: [...ENERGIEKLASSEN, null] },
  energie_traeger: text(),
  beschreibung_objekt: text(undefined, 20000),
  beschreibung_ausstattung: text(undefined, 20000),
  beschreibung_lage: text(undefined, 20000),
  beschreibung_sonstiges: text(undefined, 20000),
};

const KONTAKT_EINGABE: Record<string, Schema> = {
  anrede: text(undefined, 50),
  titel: text(undefined, 50),
  vorname: text(),
  nachname: text("Nachname oder Firma ist Pflicht"),
  firma: text(),
  email: { type: ["string", "null"], format: "email" },
  telefon: text(undefined, 50),
  mobil: text(undefined, 50),
  strasse: text(),
  hausnummer: text(undefined, 20),
  plz: text(undefined, 10),
  ort: text(),
  land: { type: "string", minLength: 2, maxLength: 2, default: "DE" },
  quelle: text(),
  notizen: text(undefined, 2000),
  einwilligung_werbung: { type: "boolean" },
};

const TERMIN_EINGABE: Record<string, Schema> = {
  titel: { type: "string", minLength: 1, maxLength: 300 },
  art: aufzaehlung(TERMINARTEN),
  beginnt_am: zeitpunkt("ISO 8601 mit Zeitzone"),
  endet_am: zeitpunkt("Leer = eine Stunde nach Beginn"),
  ort: text(),
  notiz: text(undefined, 2000),
  objekt_id: { type: ["string", "null"], format: "uuid" },
  kontakt_id: { type: ["string", "null"], format: "uuid" },
};

const AUSGABE_ZUSATZ: Record<string, Schema> = {
  id: { type: "string", format: "uuid" },
  erstellt_am: zeitpunkt(),
  geaendert_am: zeitpunkt(),
};

function objektSchema(): Schema {
  return { type: "object", properties: { ...AUSGABE_ZUSATZ, ...OBJEKT_EINGABE } };
}
function kontaktSchema(): Schema {
  return { type: "object", properties: { ...AUSGABE_ZUSATZ, ...KONTAKT_EINGABE } };
}
function terminSchema(): Schema {
  return { type: "object", properties: { ...AUSGABE_ZUSATZ, ...TERMIN_EINGABE, abgesagt_am: { type: ["string", "null"], format: "date-time" } } };
}

const FEHLER = { $ref: "#/components/schemas/Fehler" };
const antworten = (schema: string, extra: Record<string, unknown> = {}) => ({
  "200": { description: "Erfolg", content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } } },
  "401": { description: "Kein oder ungültiger Schlüssel", content: { "application/json": { schema: FEHLER } } },
  "403": { description: "Recht fehlt oder Lesemodus", content: { "application/json": { schema: FEHLER } } },
  "429": { description: "Ratenlimit erreicht (Retry-After in Sekunden)", content: { "application/json": { schema: FEHLER } } },
  ...extra,
});

const seitenParameter = [
  { name: "seite", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "groesse", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
  { name: "geaendert_seit", in: "query", schema: { type: "string", format: "date-time" }, description: "Nur Datensätze, die seitdem geändert wurden" },
];

const idParameter = [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }];

function ressource(name: string, einzahl: string, eingabe: string, loeschen: string): Record<string, unknown> {
  const liste = `${name}Liste`;
  return {
    [`/${name}`]: {
      get: {
        summary: `${einzahl}e auflisten`,
        parameters: seitenParameter,
        responses: antworten(liste),
      },
      post: {
        summary: `${einzahl} anlegen`,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${eingabe}` } } } },
        responses: {
          ...antworten(einzahl),
          "201": { description: "Angelegt", content: { "application/json": { schema: { $ref: `#/components/schemas/${einzahl}` } } } },
          "422": { description: "Ungültige Angaben (Feld `probleme`)", content: { "application/json": { schema: FEHLER } } },
        },
      },
    },
    [`/${name}/{id}`]: {
      get: { summary: `${einzahl} lesen`, parameters: idParameter, responses: antworten(einzahl, { "404": { description: "Nicht gefunden" } }) },
      patch: {
        summary: `${einzahl} ändern (nur angegebene Felder)`,
        parameters: idParameter,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${eingabe}` } } } },
        responses: antworten(einzahl, { "404": { description: "Nicht gefunden" }, "422": { description: "Ungültige Angaben", content: { "application/json": { schema: FEHLER } } } }),
      },
      delete: { summary: loeschen, parameters: idParameter, responses: { "204": { description: "Erledigt" }, "404": { description: "Nicht gefunden" } } },
    },
  };
}

function listenSchema(einzahl: string): Schema {
  return {
    type: "object",
    properties: {
      daten: { type: "array", items: { $ref: `#/components/schemas/${einzahl}` } },
      seite: { type: "integer" },
      groesse: { type: "integer" },
      gesamt: { type: "integer" },
      weitere: { type: "boolean" },
    },
  };
}

export function openapiDokument(basis: string): Record<string, unknown> {
  const lieferung = {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid", description: "Kennung der Lieferung (auch Kopf X-ImmoOffice-Lieferung)" },
      ereignis: { type: "string" },
      zeitpunkt: zeitpunkt(),
      daten: { type: "object", additionalProperties: true },
    },
  };
  const rueckruf = (ereignis: string, was: string) => ({
    post: {
      summary: `${was} — POST an das hinterlegte Ziel`,
      description:
        "Kopfzeilen: X-ImmoOffice-Ereignis, X-ImmoOffice-Lieferung, X-ImmoOffice-Signatur (`t=<unix>,v1=<hex>`; HMAC-SHA256 mit dem Geheimnis des Ziels über `<t>.<Körper>`). Antwort 2xx = zugestellt; sonst Wiederholung mit wachsendem Abstand, höchstens acht Versuche.",
      requestBody: { content: { "application/json": { schema: lieferung } } },
      responses: { "200": { description: "Empfangen" } },
      "x-ereignis": ereignis,
    },
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "ImmoOffice.ai Schnittstelle",
      version: "1.0.0",
      description:
        "REST-Schnittstelle je Unternehmen. Anmeldung mit einem API-Schlüssel (`Authorization: Bearer io_…`), der unter Einstellungen → Schnittstelle angelegt wird. 600 Anfragen je Minute und Schlüssel (einstellbar). Alle Preise netto in Euro, Flächen in m², Zeiten in ISO 8601. Löschen ist ein Zustand — gelöschte Datensätze verschwinden aus den Listen, bleiben aber für Aufbewahrungspflichten erhalten.",
    },
    servers: [{ url: `${basis}/api/v1` }],
    security: [{ bearerAuth: [] }],
    paths: {
      ...ressource("objekte", "Objekt", "ObjektEingabe", "Objekt löschen (Zustand)"),
      ...ressource("kontakte", "Kontakt", "KontaktEingabe", "Kontakt löschen (Zustand)"),
      ...ressource("termine", "Termin", "TerminEingabe", "Termin absagen"),
    },
    webhooks: {
      "objekt.angelegt": rueckruf("objekt.angelegt", "Objekt angelegt"),
      "kontakt.angelegt": rueckruf("kontakt.angelegt", "Kontakt angelegt"),
      "termin.angelegt": rueckruf("termin.angelegt", "Termin angelegt"),
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "io_…" } },
      schemas: {
        Fehler: { type: "object", properties: { fehler: { type: "string" }, probleme: { type: "array", items: { type: "object", properties: { feld: { type: "string" }, meldung: { type: "string" } } } } } },
        Objekt: objektSchema(),
        ObjektEingabe: { type: "object", required: ["bezeichnung"], properties: OBJEKT_EINGABE },
        ObjektListe: listenSchema("Objekt"),
        Kontakt: kontaktSchema(),
        KontaktEingabe: { type: "object", properties: KONTAKT_EINGABE },
        KontaktListe: listenSchema("Kontakt"),
        Termin: terminSchema(),
        TerminEingabe: { type: "object", required: ["titel", "beginnt_am"], properties: TERMIN_EINGABE },
        TerminListe: listenSchema("Termin"),
      },
    },
  };
}
