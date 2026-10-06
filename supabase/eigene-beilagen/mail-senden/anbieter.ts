// ============================================================================
// Die Anbieter-Schicht für Postfächer
// ----------------------------------------------------------------------------
// EIGENER TEIL DES FORKS. Diese Datei liegt in mehreren Funktionsordnern und
// ist überall byte-gleich — tests/postfach-anbieter.js besteht darauf. Wer
// sie ändert, ändert alle Kopien (so wie mail-signatur.ts, das es in fünf
// Ordnern gibt).
//
// Der Auftrag beschreibt in Abschnitt 4b für Postfächer eine Adapter-Schicht:
// die Anwendung kennt EINE Schnittstelle, jeder Anbieter ist ein Adapter.
// Das ist hier. Und zwar bewusst SCHMAL:
//
//   Abruf bleibt IMAP, Versand bleibt SMTP — bei allen Anbietern.
//   Nur die Anmeldung wechselt: Passwort (LOGIN) oder Token (XOAUTH2).
//
// Warum nicht Microsoft Graph und die Gmail-API: der Abruf in
// mail-postfach-pull sind 870 Zeilen, die Ordner, Flags, Anhänge, große
// Mails und Rückstände behandeln — jede Zeile davon an einem echten
// Postfach gelernt. Drei Fassungen davon wären drei Fassungen, die
// auseinanderlaufen. IMAP mit XOAUTH2 ist bei Microsoft und Google
// ausdrücklich unterstützt und lässt diesen Teil unangetastet.
//
// Was die Anbieter verlangen (Stand 10/2026):
//   * Microsoft 365: Basic Auth für IMAP/SMTP ist abgeschaltet. OAuth2 mit
//     den Bereichen IMAP.AccessAsUser.All und SMTP.Send. Die App muss in
//     Entra ID registriert sein; der Mandant des Kunden kann zusätzlich
//     eine Freigabe durch seinen Administrator verlangen.
//   * Google: Bereich https://mail.google.com/ — ein "restricted scope".
//     Für den Produktivbetrieb prüft Google die App (CASA-Assessment).
//     Ohne diese Prüfung geht es nur mit Testnutzern.
// ============================================================================

export type AnbieterName = "imap" | "microsoft" | "google";

export type Anbieter = {
  name: AnbieterName;
  anzeige: string;
  /** Wohin der Nutzer zur Anmeldung geschickt wird. */
  autorisierung: string;
  /** Wo Code und Erneuerungs-Token gegen Zugriffs-Token getauscht werden. */
  token: string;
  /** Die Bereiche, getrennt durch Leerzeichen. */
  bereiche: string;
  imap: { server: string; port: number; security: string };
  smtp: { server: string; port: number; security: string };
  /** Zusätzliche Felder der Autorisierungsanfrage. */
  extra: Record<string, string>;
  /** Namen der Umgebungsvariablen mit Anwendungs-ID und Geheimnis. */
  umgebung: { id: string; geheimnis: string };
};

export const ANBIETER: Record<string, Anbieter> = {
  microsoft: {
    name: "microsoft",
    anzeige: "Microsoft 365 / Outlook",
    autorisierung: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    // offline_access ist das Erneuerungs-Token; ohne es wäre nach einer
    // Stunde Schluss. openid/email nur, um die Adresse des Kontos zu
    // erfahren — ohne sie wüsste das Postfach nicht, wie es heißt.
    bereiche: [
      "offline_access", "openid", "email", "profile",
      "https://outlook.office.com/IMAP.AccessAsUser.All",
      "https://outlook.office.com/SMTP.Send",
    ].join(" "),
    imap: { server: "outlook.office365.com", port: 993, security: "ssl" },
    smtp: { server: "smtp.office365.com", port: 587, security: "starttls" },
    // select_account: wer zwei Konten hat, soll wählen können und nicht
    // stillschweigend das zuletzt benutzte verbinden.
    extra: { response_mode: "query", prompt: "select_account" },
    umgebung: { id: "MICROSOFT_CLIENT_ID", geheimnis: "MICROSOFT_CLIENT_SECRET" },
  },
  google: {
    name: "google",
    anzeige: "Google / Gmail",
    autorisierung: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    bereiche: ["https://mail.google.com/", "openid", "email"].join(" "),
    imap: { server: "imap.gmail.com", port: 993, security: "ssl" },
    smtp: { server: "smtp.gmail.com", port: 465, security: "ssl" },
    // access_type=offline und prompt=consent: nur so gibt Google ein
    // Erneuerungs-Token heraus — und beim zweiten Verbinden desselben
    // Kontos nur mit prompt=consent noch einmal.
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    umgebung: { id: "GOOGLE_CLIENT_ID", geheimnis: "GOOGLE_CLIENT_SECRET" },
  },
};

export function anbieterOder400(name: unknown): Anbieter {
  const a = typeof name === "string" ? ANBIETER[name] : undefined;
  if (!a) {
    throw new Error("Unbekannter Anbieter. Möglich sind: "
      + Object.keys(ANBIETER).join(", ") + ".");
  }
  return a;
}

/** Anwendungs-ID und Geheimnis aus der Umgebung, mit klarer Ansage. */
export function zugang(a: Anbieter): { id: string; geheimnis: string } {
  const id = Deno.env.get(a.umgebung.id) || "";
  const geheimnis = Deno.env.get(a.umgebung.geheimnis) || "";
  if (!id || !geheimnis) {
    throw new Error(
      `${a.anzeige} ist auf dieser Plattform noch nicht eingerichtet: `
      + `${a.umgebung.id} und ${a.umgebung.geheimnis} fehlen in der Umgebung `
      + `der Edge Functions. Das ist eine Sache des Betreibers, nicht des `
      + `Nutzers — bis dahin lässt sich ein solches Postfach nur über `
      + `IMAP/SMTP mit Passwort anbinden.`);
  }
  return { id, geheimnis };
}

/** Die Adresse, an die der Anbieter zurückleitet. */
export function rueckrufAdresse(): string {
  const basis = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  return `${basis}/functions/v1/postfach-anbieter-rueckruf`;
}

// --- Verschlüsselung --------------------------------------------------------
// Wortgleich mit mail-postfach-speichern: AES-GCM, Schlüssel ist der
// SHA-256 von MAIL_SECRET_KEY, Format "v1.<iv>.<ciphertext>". Ein zweites
// Verfahren für dieselbe Art Geheimnis wäre eines zu viel — und die
// Postfächer sollen mit EINEM Schlüssel auskommen.
function schluesselRoh(): string {
  const s = Deno.env.get("MAIL_SECRET_KEY");
  if (!s) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  return s;
}

async function schluessel(zweck: "encrypt" | "decrypt"): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.digest("SHA-256", enc.encode(schluesselRoh()));
  return await crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, [zweck]);
}

export async function verschluessele(klartext: string): Promise<string> {
  const key = await schluessel("encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(klartext));
  const b64 = (a: Uint8Array) => btoa(String.fromCharCode(...a));
  return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

export async function entschluessele(gespeichert: string): Promise<string> {
  const teile = String(gespeichert || "").split(".");
  if (teile.length !== 3 || teile[0] !== "v1") {
    throw new Error("Unbekanntes Format des gespeicherten Geheimnisses");
  }
  const key = await schluessel("decrypt");
  const roh = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const klar = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: roh(teile[1]) }, key, roh(teile[2]));
  return new TextDecoder().decode(klar);
}

// --- Der Weg zum Token ------------------------------------------------------

export type TokenAntwort = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function tokenAnfrage(a: Anbieter, felder: Record<string, string>): Promise<TokenAntwort> {
  const { id, geheimnis } = zugang(a);
  const koerper = new URLSearchParams({
    client_id: id, client_secret: geheimnis, ...felder,
  });
  const r = await fetch(a.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: koerper.toString(),
  });
  const j = await r.json().catch(() => ({})) as TokenAntwort;
  if (!r.ok || j.error) {
    // Die Meldung des Anbieters mitnehmen, aber gekürzt: sie enthält bei
    // Microsoft die ganze Anfrage samt Kennungen.
    const grund = String(j.error_description || j.error || r.status).slice(0, 300);
    throw new Error(`${a.anzeige} hat die Anmeldung abgelehnt: ${grund}`);
  }
  if (!j.access_token) throw new Error(`${a.anzeige} hat kein Zugriffs-Token geschickt.`);
  return j;
}

/** Code gegen Tokens tauschen (einmal, direkt nach der Zustimmung). */
export function codeTauschen(a: Anbieter, code: string): Promise<TokenAntwort> {
  return tokenAnfrage(a, {
    code, grant_type: "authorization_code", redirect_uri: rueckrufAdresse(),
  });
}

/** Zugriffs-Token erneuern. */
export function tokenErneuern(a: Anbieter, refresh: string): Promise<TokenAntwort> {
  return tokenAnfrage(a, { refresh_token: refresh, grant_type: "refresh_token" });
}

/**
 * Die Kontoadresse aus dem id_token.
 *
 * Nicht geprüft, sondern nur gelesen: das Token kommt eben über TLS direkt
 * vom Token-Endpunkt des Anbieters, nicht über den Browser des Nutzers.
 * Eine Signaturprüfung bräuchte dessen Schlüsselsatz und würde hier nichts
 * dazugewinnen. Fehlt die Adresse, sagt der Aufrufer es dem Nutzer, statt
 * sich eine auszudenken.
 */
export function adresseAusIdToken(id_token?: string): string {
  if (!id_token) return "";
  const teile = String(id_token).split(".");
  if (teile.length < 2) return "";
  try {
    const roh = teile[1].replace(/-/g, "+").replace(/_/g, "/");
    const auf = roh + "=".repeat((4 - roh.length % 4) % 4);
    const inhalt = JSON.parse(decodeURIComponent(
      Array.from(atob(auf)).map((c) =>
        "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")));
    const kandidat = inhalt.email || inhalt.preferred_username || inhalt.upn || "";
    return /^[^\s@]+@[^\s@]+$/.test(String(kandidat)) ? String(kandidat) : "";
  } catch (_e) {
    return "";
  }
}

/**
 * Die Anmeldezeichenkette für IMAP und SMTP.
 *
 * RFC 7628 / das XOAUTH2-Verfahren von Google und Microsoft:
 *   base64("user=" <adresse> ^A "auth=Bearer " <token> ^A ^A)
 * ^A ist 0x01. Genau so, und keine Zeile Erfindung — ein Zeichen zu viel
 * und der Server antwortet mit einem leeren Fehler.
 */
export function xoauth2(adresse: string, token: string): string {
  const roh = `user=${adresse}\x01auth=Bearer ${token}\x01\x01`;
  return btoa(roh);
}

/**
 * Ein gültiges Zugriffs-Token für dieses Postfach — erneuert, wenn nötig.
 *
 * Gibt das Token zurück und, wenn es erneuert wurde, die Felder, die am
 * Postfach gespeichert werden sollen. Das Speichern macht der Aufrufer: er
 * hat den Dienstschlüssel und weiß, ob er überhaupt schreiben darf.
 */
export async function zugriffstoken(postfach: Record<string, any>): Promise<{
  token: string;
  adresse: string;
  neu: Record<string, any> | null;
}> {
  const a = anbieterOder400(postfach.anbieter);
  const adresse = String(postfach.oauth_konto || postfach.email_adresse || "");
  const puffer = 120_000;          // zwei Minuten Luft, nicht auf die Sekunde
  const gueltigBis = postfach.oauth_gueltig_bis
    ? new Date(postfach.oauth_gueltig_bis).getTime() : 0;
  const vorhanden = postfach.oauth_zugriff_verschluesselt;
  if (vorhanden && gueltigBis - puffer > Date.now()) {
    return { token: await entschluessele(vorhanden), adresse, neu: null };
  }
  if (!postfach.oauth_refresh_verschluesselt) {
    throw new Error("Dieses Postfach hat keine gültige Verbindung mehr. "
      + "Bitte in den Einstellungen neu verbinden.");
  }
  const refresh = await entschluessele(postfach.oauth_refresh_verschluesselt);
  const antwort = await tokenErneuern(a, refresh);
  const neu: Record<string, any> = {
    oauth_zugriff_verschluesselt: await verschluessele(antwort.access_token!),
    oauth_gueltig_bis: new Date(
      Date.now() + (Number(antwort.expires_in) || 3600) * 1000).toISOString(),
    oauth_fehler: null,
  };
  // Microsoft gibt bei jeder Erneuerung ein neues Erneuerungs-Token und
  // entwertet das alte. Google gibt keines und behält das alte gültig.
  // Beides wird hier richtig behandelt — ein überschriebenes leeres Feld
  // hätte die Verbindung bei Google nach einer Stunde beendet.
  if (antwort.refresh_token && antwort.refresh_token !== refresh) {
    neu.oauth_refresh_verschluesselt = await verschluessele(antwort.refresh_token);
  }
  return { token: antwort.access_token!, adresse, neu };
}
