import { fehlerText, oauthKonfig, type OAuthKonfig } from "./oauth";
import { OAuthAnbieterBasis } from "./oauth-basis";
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
 * Microsoft 365 ueber Microsoft Graph (P2). Abgleich per Delta-Abfrage auf
 * den Posteingang (P4); der Text kommt dank `Prefer: outlook.body-content-type`
 * direkt als Text. Antworten laufen ueber createReply → Text setzen → senden,
 * damit die Nachricht im Verlauf des Anbieters und in „Gesendete Elemente“
 * liegt (P5).
 */

export const GRAPH_BASIS = "https://graph.microsoft.com/v1.0";
const ERSTABRUF_TAGE = 30;
const FELDER =
  "id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,internetMessageId,conversationId,body";

interface GraphEmpfaenger {
  emailAddress?: { address?: string; name?: string };
}

interface GraphNachricht {
  id: string;
  "@removed"?: unknown;
  subject?: string | null;
  from?: GraphEmpfaenger;
  toRecipients?: GraphEmpfaenger[];
  ccRecipients?: GraphEmpfaenger[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  internetMessageId?: string;
  conversationId?: string;
  body?: { contentType?: string; content?: string };
}

interface GraphSeite {
  value?: GraphNachricht[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

interface GraphAnhang {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentBytes?: string;
}

function adresse(e: GraphEmpfaenger | undefined): Adresse | null {
  const a = e?.emailAddress?.address;
  if (!a) return null;
  return e.emailAddress?.name ? { adresse: a, name: e.emailAddress.name } : { adresse: a };
}

function adressen(liste: GraphEmpfaenger[] | undefined): Adresse[] {
  return (liste ?? []).map(adresse).filter((x): x is Adresse => x !== null);
}

function empfaenger(liste: Adresse[]): Array<{ emailAddress: { address: string; name?: string } }> {
  return liste.map((a) => ({ emailAddress: a.name ? { address: a.adresse, name: a.name } : { address: a.adresse } }));
}

export class MicrosoftAnbieter extends OAuthAnbieterBasis implements PostfachAnbieter {
  readonly art = "microsoft" as const;

  constructor(
    zugang: OAuthZugang,
    fetchFn: typeof globalThis.fetch = globalThis.fetch,
    konfig: OAuthKonfig | null = oauthKonfig("microsoft"),
  ) {
    super(zugang, fetchFn, konfig, "Microsoft 365");
  }

  async pruefen(): Promise<Pruefergebnis> {
    try {
      const ich = await this.anfrage<{ mail?: string; userPrincipalName?: string }>(
        `${GRAPH_BASIS}/me?$select=mail,userPrincipalName`,
      );
      return { ok: true, adresse: ich.mail ?? ich.userPrincipalName ?? null };
    } catch (e) {
      return { ok: false, fehler: fehlerText(e) };
    }
  }

  async abrufen(zustand: Record<string, unknown>, optionen?: AbrufOptionen): Promise<AbrufErgebnis> {
    const max = optionen?.maxAnzahl ?? 50;
    const gespeichert =
      typeof zustand["deltaLink"] === "string"
        ? zustand["deltaLink"]
        : typeof zustand["nextLink"] === "string"
          ? zustand["nextLink"]
          : null;
    const vollstaendig = gespeichert === null;

    let url: string | null = gespeichert;
    if (url === null) {
      const seit = optionen?.seit ?? new Date(Date.now() - ERSTABRUF_TAGE * 24 * 3600 * 1000);
      const p = new URLSearchParams({
        $select: FELDER,
        $top: "50",
        $filter: `receivedDateTime ge ${seit.toISOString()}`,
      });
      url = `${GRAPH_BASIS}/me/mailFolders/inbox/messages/delta?${p.toString()}`;
    }

    const nachrichten: EingangsNachricht[] = [];
    let deltaLink: string | null = null;
    let nextLink: string | null = null;
    while (url) {
      const seite: GraphSeite = await this.anfrage<GraphSeite>(url, {
        headers: { Prefer: 'outlook.body-content-type="text"' },
      });
      for (const m of seite.value ?? []) {
        if ("@removed" in m) continue;
        nachrichten.push(await this.umwandeln(m));
      }
      if (seite["@odata.deltaLink"]) {
        deltaLink = seite["@odata.deltaLink"];
        url = null;
      } else if (seite["@odata.nextLink"]) {
        if (nachrichten.length >= max) {
          nextLink = seite["@odata.nextLink"];
          url = null;
        } else {
          url = seite["@odata.nextLink"];
        }
      } else {
        url = null;
      }
    }

    const neuerZustand: Record<string, unknown> = deltaLink ? { deltaLink } : nextLink ? { nextLink } : zustand;
    return { nachrichten, zustand: neuerZustand, vollstaendig };
  }

  private async umwandeln(m: GraphNachricht): Promise<EingangsNachricht> {
    let text = m.body?.content ?? null;
    if (text && (m.body?.contentType ?? "").toLowerCase() === "html") text = htmlZuText(text);
    const anhaenge = m.hasAttachments ? await this.anhaengeAuflisten(m.id) : [];
    return {
      externId: m.id,
      messageId: m.internetMessageId ?? null,
      inReplyTo: null,
      threadId: m.conversationId ?? null,
      von: adresse(m.from),
      an: adressen(m.toRecipients),
      cc: adressen(m.ccRecipients),
      betreff: m.subject?.trim() || null,
      text: text?.trim() || null,
      gesendetAm: m.sentDateTime ?? m.receivedDateTime ?? new Date().toISOString(),
      gelesen: m.isRead ?? false,
      anhaenge,
    };
  }

  private async anhaengeAuflisten(nachrichtId: string): Promise<AnhangInfo[]> {
    const seite = await this.anfrage<{ value?: GraphAnhang[] }>(
      `${GRAPH_BASIS}/me/messages/${encodeURIComponent(nachrichtId)}/attachments?$select=id,name,contentType,size,isInline`,
    );
    return (seite.value ?? [])
      .filter((a) => !a.isInline)
      .map((a) => ({ externId: a.id, dateiname: a.name ?? "Anhang", mime: a.contentType ?? null, bytes: a.size ?? null }));
  }

  async senden(auftrag: Sendeauftrag): Promise<Sendeergebnis> {
    const json = { "Content-Type": "application/json" };
    if (auftrag.antwortAufExternId) {
      const entwurf = await this.anfrage<{ id: string }>(
        `${GRAPH_BASIS}/me/messages/${encodeURIComponent(auftrag.antwortAufExternId)}/createReply`,
        { method: "POST", headers: json, body: "{}" },
      );
      await this.anfrage<undefined>(`${GRAPH_BASIS}/me/messages/${encodeURIComponent(entwurf.id)}`, {
        method: "PATCH",
        headers: json,
        body: JSON.stringify({
          subject: auftrag.betreff,
          body: { contentType: "Text", content: auftrag.text },
          toRecipients: empfaenger(auftrag.an),
          ccRecipients: empfaenger(auftrag.cc ?? []),
        }),
      });
      await this.anfrage<undefined>(`${GRAPH_BASIS}/me/messages/${encodeURIComponent(entwurf.id)}/send`, {
        method: "POST",
        headers: json,
      });
      return { externId: entwurf.id, messageId: null };
    }

    await this.anfrage<undefined>(`${GRAPH_BASIS}/me/sendMail`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        message: {
          subject: auftrag.betreff,
          body: { contentType: "Text", content: auftrag.text },
          toRecipients: empfaenger(auftrag.an),
          ccRecipients: empfaenger(auftrag.cc ?? []),
        },
        saveToSentItems: true,
      }),
    });
    return { externId: null, messageId: null };
  }

  async anhangLaden(nachrichtExternId: string, anhangExternId: string, hinweis?: AnhangHinweis): Promise<AnhangInhalt> {
    const a = await this.anfrage<GraphAnhang>(
      `${GRAPH_BASIS}/me/messages/${encodeURIComponent(nachrichtExternId)}/attachments/${encodeURIComponent(anhangExternId)}`,
    );
    if (!a.contentBytes) throw new Error("Dieser Anhang laesst sich nicht herunterladen (kein Dateianhang).");
    return {
      dateiname: a.name ?? hinweis?.dateiname ?? "Anhang",
      mime: a.contentType ?? hinweis?.mime ?? "application/octet-stream",
      inhalt: new Uint8Array(Buffer.from(a.contentBytes, "base64")),
    };
  }
}
