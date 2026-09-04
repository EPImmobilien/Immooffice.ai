import { z } from "zod";

/**
 * Postfaecher (docs/AUTONOMIE.md Abschnitt 6) — Vertraege der Anbieter-Schicht.
 *
 * Kein Mail-Client (P3, P8): Ein Anbieter liefert Kopfdaten und Text (P4),
 * holt Anhaenge nur auf Anforderung und sendet ueber das verbundene Postfach
 * (P5). Ordner, Regeln und Signaturen bleiben beim Anbieter.
 */

export type PostfachAnbieterArt = "imap" | "microsoft" | "google";

export const ANBIETER_BEZEICHNUNG: Record<PostfachAnbieterArt, string> = {
  imap: "IMAP/SMTP (beliebiger Anbieter)",
  microsoft: "Microsoft 365 / Outlook",
  google: "Google Workspace / Gmail",
};

export interface Adresse {
  adresse: string;
  name?: string | undefined;
}

export interface AnhangInfo {
  externId: string;
  dateiname: string;
  mime: string | null;
  bytes: number | null;
}

/** Eine abgerufene Nachricht — nur das, was gespeichert wird (P4). */
export interface EingangsNachricht {
  externId: string;
  messageId: string | null;
  inReplyTo: string | null;
  threadId: string | null;
  von: Adresse | null;
  an: Adresse[];
  cc: Adresse[];
  betreff: string | null;
  text: string | null;
  /** ISO-Zeitstempel */
  gesendetAm: string;
  gelesen: boolean;
  anhaenge: AnhangInfo[];
}

export interface AbrufErgebnis {
  nachrichten: EingangsNachricht[];
  /** Neuer Abgleichzustand: Delta-Link (Microsoft), historyId (Google), UIDs (IMAP). */
  zustand: Record<string, unknown>;
  /** true, wenn kein Delta moeglich war und der Bestand neu gelesen wurde. */
  vollstaendig: boolean;
}

export interface Sendeauftrag {
  an: Adresse[];
  cc?: Adresse[] | undefined;
  betreff: string;
  text: string;
  inReplyTo?: string | null | undefined;
  references?: string[] | undefined;
  /** Kennung der beantworteten Nachricht beim Anbieter (Threading bei Microsoft/Google). */
  antwortAufExternId?: string | null | undefined;
  threadId?: string | null | undefined;
  /** Dateianhaenge (z. B. Rechnungs-PDF) */
  anhaenge?: Array<{ dateiname: string; mime: string; inhalt: Buffer }> | undefined;
}

export interface Sendeergebnis {
  externId: string | null;
  messageId: string | null;
}

export interface AnhangInhalt {
  dateiname: string;
  mime: string;
  inhalt: Uint8Array;
}

export type Pruefergebnis = { ok: true; adresse: string | null } | { ok: false; fehler: string };

export interface PostfachAnbieter {
  readonly art: PostfachAnbieterArt;
  /** „Verbindung pruefen“ vor dem Speichern (Abschnitt 5.3 sinngemaess). */
  pruefen(): Promise<Pruefergebnis>;
  /** Neue Nachrichten seit dem gespeicherten Zustand; beim ersten Mal begrenzt. */
  abrufen(zustand: Record<string, unknown>, optionen?: AbrufOptionen): Promise<AbrufErgebnis>;
  senden(auftrag: Sendeauftrag): Promise<Sendeergebnis>;
  anhangLaden(nachrichtExternId: string, anhangExternId: string, hinweis?: AnhangHinweis): Promise<AnhangInhalt>;
  /** OAuth-Anbieter: erneuerte Tokens, die der Aufrufer verschluesselt zurueckschreiben muss. */
  aktualisierterZugang?(): PostfachZugang | null;
}

/** Was die Datenbank ueber den Anhang weiss — manche Anbieter liefern beim Laden nur Bytes. */
export interface AnhangHinweis {
  dateiname?: string | undefined;
  mime?: string | undefined;
}

export interface AbrufOptionen {
  /** Obergrenze je Lauf, damit ein grosses Postfach das Zeitbudget nicht sprengt. */
  maxAnzahl?: number | undefined;
  /** Beim Erstabruf: nur Nachrichten ab diesem Zeitpunkt. */
  seit?: Date | undefined;
}

// ---------------------------------------------------------------------------
// Zugangsdaten — als JSON verschluesselt in postfaecher.zugangsdaten
// ---------------------------------------------------------------------------

export const imapZugangSchema = z.object({
  art: z.literal("imap"),
  imapHost: z.string().trim().min(1).max(253),
  imapPort: z.number().int().min(1).max(65535).default(993),
  imapTls: z.boolean().default(true),
  smtpHost: z.string().trim().min(1).max(253),
  smtpPort: z.number().int().min(1).max(65535).default(465),
  smtpTls: z.boolean().default(true),
  benutzer: z.string().min(1).max(320),
  passwort: z.string().min(1).max(1024),
});

const oauthFelder = {
  refreshToken: z.string().min(1),
  accessToken: z.string().optional(),
  /** ISO-Zeitpunkt, bis zu dem accessToken gilt. */
  gueltigBis: z.string().optional(),
};

export const microsoftZugangSchema = z.object({ art: z.literal("microsoft"), ...oauthFelder });
export const googleZugangSchema = z.object({ art: z.literal("google"), ...oauthFelder });

export const zugangSchema = z.discriminatedUnion("art", [
  imapZugangSchema,
  microsoftZugangSchema,
  googleZugangSchema,
]);

export type ImapZugang = z.infer<typeof imapZugangSchema>;
export type OAuthZugang = z.infer<typeof microsoftZugangSchema> | z.infer<typeof googleZugangSchema>;
export type PostfachZugang = z.infer<typeof zugangSchema>;

/** Entschluesselten JSON-Text in einen geprueften Zugang ueberfuehren. */
export function zugangParsen(json: string): PostfachZugang {
  let roh: unknown;
  try {
    roh = JSON.parse(json);
  } catch {
    throw new Error("Die gespeicherten Zugangsdaten sind nicht lesbar.");
  }
  const ergebnis = zugangSchema.safeParse(roh);
  if (!ergebnis.success) {
    throw new Error("Die gespeicherten Zugangsdaten sind unvollstaendig.");
  }
  return ergebnis.data;
}

/** Nutzlast eines Postfach-Auftrags (`jobs.art = 'postfach'`). */
export interface PostfachNutzlast {
  postfach_id: string;
  ausloeser: "manuell" | "zeitplan";
}

export function istPostfachNutzlast(wert: unknown): wert is PostfachNutzlast {
  if (!wert || typeof wert !== "object") return false;
  const n = wert as Record<string, unknown>;
  return typeof n["postfach_id"] === "string" && (n["ausloeser"] === "manuell" || n["ausloeser"] === "zeitplan");
}

/** Ein Adress-Eintrag, wie er in `nachrichten.an` / `.cc` liegt. */
export function adressenJson(liste: Adresse[]): Array<{ adresse: string; name?: string }> {
  return liste.map((a) => (a.name ? { adresse: a.adresse, name: a.name } : { adresse: a.adresse }));
}
