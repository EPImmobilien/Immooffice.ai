import addressparser from "nodemailer/lib/addressparser";

import { rohNachricht } from "./mime";
import { fehlerText, oauthKonfig, type OAuthKonfig } from "./oauth";
import { OAuthAnbieterBasis, istHttpFehler } from "./oauth-basis";
import { htmlZuText } from "./text";
import type {
  AbrufErgebnis,
  AbrufOptionen,
  Adresse,
  AnhangHinweis,
  AnhangInfo,
  AnhangInhalt,
  EingangsNachricht,
  OAuthZugang,
  PostfachAnbieter,
  Pruefergebnis,
  Sendeauftrag,
  Sendeergebnis,
} from "./typen";

/**
 * Google Workspace / Gmail (P2). Abgleich ueber die History-API mit
 * historyId (P4); ist die Historie beim Anbieter abgelaufen (404), wird der
 * Posteingang neu gelesen. Versand als RFC-822-Quelltext; Gmail legt die
 * Nachricht selbst unter „Gesendet“ ab (P5).
 */

export const GMAIL_BASIS = "https://gmail.googleapis.com/gmail/v1/users/me";
const ERSTABRUF_TAGE = 30;

interface GmailKopf {
  name: string;
  value: string;
}

interface GmailTeil {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailKopf[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailTeil[];
}

interface GmailNachricht {
  id: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailTeil;
}

function kopf(teil: GmailTeil | undefined, name: string): string | null {
  const k = teil?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return k?.value?.trim() || null;
}

function adressen(wert: string | null): Adresse[] {
  if (!wert) return [];
  const flach: Array<{ address: string; name: string }> = [];
  for (const eintrag of addressparser(wert)) {
    if ("group" in eintrag) flach.push(...eintrag.group);
    else flach.push(eintrag);
  }
  return flach
    .filter((a) => a.address.includes("@"))
    .map((a) => (a.name ? { adresse: a.address, name: a.name } : { adresse: a.address }));
}

function base64urlText(daten: string | undefined): string | null {
  if (!daten) return null;
  return Buffer.from(daten, "base64url").toString("utf8");
}

/** Textteil und Anhaenge aus dem verschachtelten Aufbau einer Gmail-Nachricht ziehen. */
function teileAuswerten(wurzel: GmailTeil | undefined): { text: string | null; anhaenge: AnhangInfo[] } {
  let klartext: string | null = null;
  let html: string | null = null;
  const anhaenge: AnhangInfo[] = [];
  const stapel: GmailTeil[] = wurzel ? [wurzel] : [];
  while (stapel.length > 0) {
    const t = stapel.shift()!;
    const mime = (t.mimeType ?? "").toLowerCase();
    if (t.filename && t.body?.attachmentId) {
      const contentId = kopf(t, "Content-ID");
      const disposition = kopf(t, "Content-Disposition") ?? "";
      const eingebettet = contentId !== null && /inline/i.test(disposition) && mime.startsWith("image/");
      if (!eingebettet) {
        anhaenge.push({ externId: t.body.attachmentId, dateiname: t.filename, mime: t.mimeType ?? null, bytes: t.body.size ?? null });
      }
    } else if (mime === "text/plain" && klartext === null && t.body?.data) {
      klartext = base64urlText(t.body.data);
    } else if (mime === "text/html" && html === null && t.body?.data) {
      html = base64urlText(t.body.data);
    }
    if (t.parts) stapel.push(...t.parts);
  }
  const text = klartext?.trim() ? klartext.trim() : html ? htmlZuText(html) : null;
  return { text: text || null, anhaenge };
}

export class GoogleAnbieter extends OAuthAnbieterBasis implements PostfachAnbieter {
  readonly art = "google" as const;

  constructor(
    zugang: OAuthZugang,
    private readonly absender: Adresse,
    fetchFn: typeof globalThis.fetch = globalThis.fetch,
    konfig: OAuthKonfig | null = oauthKonfig("google"),
  ) {
    super(zugang, fetchFn, konfig, "Google");
  }

  async pruefen(): Promise<Pruefergebnis> {
    try {
      const profil = await this.anfrage<{ emailAddress?: string }>(`${GMAIL_BASIS}/profile`);
      return { ok: true, adresse: profil.emailAddress ?? null };
    } catch (e) {
      return { ok: false, fehler: fehlerText(e) };
    }
  }

  async abrufen(zustand: Record<string, unknown>, optionen?: AbrufOptionen): Promise<AbrufErgebnis> {
    const max = optionen?.maxAnzahl ?? 50;
    const historyId = typeof zustand["historyId"] === "string" ? zustand["historyId"] : null;
    let ids: string[] = [];
    let neueHistoryId: string | null = null;
    let vollstaendig = historyId === null;

    if (historyId !== null) {
      try {
        let seite: string | undefined;
        do {
          const p = new URLSearchParams({
            startHistoryId: historyId,
            historyTypes: "messageAdded",
            labelId: "INBOX",
            maxResults: "100",
          });
          if (seite) p.set("pageToken", seite);
          const h = await this.anfrage<{
            history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>;
            nextPageToken?: string;
            historyId?: string;
          }>(`${GMAIL_BASIS}/history?${p.toString()}`);
          for (const eintrag of h.history ?? []) {
            for (const hinzu of eintrag.messagesAdded ?? []) {
              const id = hinzu.message?.id;
              if (id && !ids.includes(id)) ids.push(id);
            }
          }
          neueHistoryId = h.historyId ?? neueHistoryId;
          seite = h.nextPageToken;
        } while (seite && ids.length < max);
      } catch (e) {
        // Historie beim Anbieter abgelaufen: neu aufsetzen.
        if (!istHttpFehler(e, 404)) throw e;
        vollstaendig = true;
        ids = [];
      }
    }

    if (vollstaendig) {
      const seit = optionen?.seit ?? new Date(Date.now() - ERSTABRUF_TAGE * 24 * 3600 * 1000);
      const p = new URLSearchParams({
        labelIds: "INBOX",
        maxResults: String(max),
        q: `after:${Math.floor(seit.getTime() / 1000)}`,
      });
      const liste = await this.anfrage<{ messages?: Array<{ id: string }> }>(`${GMAIL_BASIS}/messages?${p.toString()}`);
      ids = (liste.messages ?? []).map((m) => m.id);
      const profil = await this.anfrage<{ historyId?: string }>(`${GMAIL_BASIS}/profile`);
      neueHistoryId = profil.historyId ?? null;
    }

    const nachrichten: EingangsNachricht[] = [];
    for (const id of ids.slice(0, max)) {
      const m = await this.anfrage<GmailNachricht>(`${GMAIL_BASIS}/messages/${encodeURIComponent(id)}?format=full`);
      nachrichten.push(umwandeln(m));
    }

    return {
      nachrichten,
      zustand: neueHistoryId ? { historyId: neueHistoryId } : zustand,
      vollstaendig,
    };
  }

  async senden(auftrag: Sendeauftrag): Promise<Sendeergebnis> {
    const roh = await rohNachricht(this.absender, auftrag);
    const antwort = await this.anfrage<{ id?: string; threadId?: string }>(`${GMAIL_BASIS}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw: roh.inhalt.toString("base64url"),
        ...(auftrag.threadId ? { threadId: auftrag.threadId } : {}),
      }),
    });
    return { externId: antwort.id ?? null, messageId: roh.messageId };
  }

  async anhangLaden(nachrichtExternId: string, anhangExternId: string, hinweis?: AnhangHinweis): Promise<AnhangInhalt> {
    const a = await this.anfrage<{ data?: string }>(
      `${GMAIL_BASIS}/messages/${encodeURIComponent(nachrichtExternId)}/attachments/${encodeURIComponent(anhangExternId)}`,
    );
    if (!a.data) throw new Error("Der Anhang ist beim Anbieter nicht mehr verfuegbar.");
    return {
      dateiname: hinweis?.dateiname ?? "Anhang",
      mime: hinweis?.mime ?? "application/octet-stream",
      inhalt: new Uint8Array(Buffer.from(a.data, "base64url")),
    };
  }
}

function umwandeln(m: GmailNachricht): EingangsNachricht {
  const { text, anhaenge } = teileAuswerten(m.payload);
  const datum = kopf(m.payload, "Date");
  let gesendetAm = datum ? new Date(datum) : new Date(NaN);
  if (Number.isNaN(gesendetAm.getTime())) {
    gesendetAm = m.internalDate ? new Date(Number(m.internalDate)) : new Date();
  }
  return {
    externId: m.id,
    messageId: kopf(m.payload, "Message-ID"),
    inReplyTo: kopf(m.payload, "In-Reply-To"),
    threadId: m.threadId ?? null,
    von: adressen(kopf(m.payload, "From"))[0] ?? null,
    an: adressen(kopf(m.payload, "To")),
    cc: adressen(kopf(m.payload, "Cc")),
    betreff: kopf(m.payload, "Subject"),
    text,
    gesendetAm: gesendetAm.toISOString(),
    gelesen: !(m.labelIds ?? []).includes("UNREAD"),
    anhaenge,
  };
}
