import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

import { mimeParsen, rohNachricht } from "./mime";
import { fehlerText } from "./oauth";
import type {
  AbrufErgebnis,
  AbrufOptionen,
  Adresse,
  AnhangHinweis,
  AnhangInhalt,
  EingangsNachricht,
  ImapZugang,
  PostfachAnbieter,
  Pruefergebnis,
  Sendeauftrag,
  Sendeergebnis,
} from "./typen";

/**
 * IMAP/SMTP fuer beliebige Anbieter (P2). Abgleich ueber UIDVALIDITY und
 * UIDNEXT (P4): Beim ersten Lauf die juengsten Nachrichten der letzten
 * 30 Tage, danach nur, was seit dem letzten Lauf dazukam. Gesendetes wird
 * zusaetzlich in den Ordner „Gesendet“ des Anbieters gelegt (P5).
 */

interface ImapZustand {
  uidValidity?: string;
  uidNext?: number;
}

const ERSTABRUF_TAGE = 30;

export class ImapAnbieter implements PostfachAnbieter {
  readonly art = "imap" as const;

  constructor(
    private readonly zugang: ImapZugang,
    private readonly absender: Adresse,
  ) {}

  private verbindung(): ImapFlow {
    return new ImapFlow({
      host: this.zugang.imapHost,
      port: this.zugang.imapPort,
      secure: this.zugang.imapTls,
      auth: { user: this.zugang.benutzer, pass: this.zugang.passwort },
      logger: false,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 90_000,
    });
  }

  private transport() {
    return nodemailer.createTransport({
      host: this.zugang.smtpHost,
      port: this.zugang.smtpPort,
      secure: this.zugang.smtpTls,
      auth: { user: this.zugang.benutzer, pass: this.zugang.passwort },
      connectionTimeout: 15_000,
    });
  }

  async pruefen(): Promise<Pruefergebnis> {
    const c = this.verbindung();
    try {
      await c.connect();
      const lock = await c.getMailboxLock("INBOX");
      lock.release();
      await c.logout();
    } catch (e) {
      return { ok: false, fehler: `IMAP: ${fehlerText(e)}` };
    }
    try {
      await this.transport().verify();
    } catch (e) {
      return { ok: false, fehler: `SMTP: ${fehlerText(e)}` };
    }
    return { ok: true, adresse: null };
  }

  async abrufen(zustand: Record<string, unknown>, optionen?: AbrufOptionen): Promise<AbrufErgebnis> {
    const max = optionen?.maxAnzahl ?? 50;
    const c = this.verbindung();
    await c.connect();
    try {
      const lock = await c.getMailboxLock("INBOX");
      try {
        const box = c.mailbox;
        if (!box || typeof box === "boolean") throw new Error("Der Posteingang ist nicht erreichbar.");
        const uidValidity = String(box.uidValidity);
        const alt = zustand as ImapZustand;
        const fortsetzung = alt.uidValidity === uidValidity && typeof alt.uidNext === "number";
        const startUid = fortsetzung ? (alt.uidNext as number) : 0;

        let uids: number[];
        if (fortsetzung) {
          if (startUid >= box.uidNext) {
            return { nachrichten: [], zustand: { uidValidity, uidNext: box.uidNext }, vollstaendig: false };
          }
          const gefunden = await c.search({ uid: `${startUid}:*` }, { uid: true });
          uids = (gefunden || []).filter((u) => u >= startUid).sort((a, b) => a - b);
        } else {
          const seit = optionen?.seit ?? new Date(Date.now() - ERSTABRUF_TAGE * 24 * 3600 * 1000);
          const gefunden = await c.search({ since: seit }, { uid: true });
          uids = (gefunden || []).sort((a, b) => a - b).slice(-max);
        }

        const auswahl = uids.slice(0, max);
        const nachrichten: EingangsNachricht[] = [];
        if (auswahl.length > 0) {
          for await (const msg of c.fetch(auswahl, { uid: true, source: true, flags: true }, { uid: true })) {
            if (!msg.source) continue;
            const { nachricht } = await mimeParsen(new Uint8Array(msg.source));
            nachrichten.push({
              ...nachricht,
              externId: `${uidValidity}:${msg.uid}`,
              gelesen: msg.flags?.has("\\Seen") ?? false,
              threadId: null,
            });
          }
        }

        const letzteUid = auswahl.at(-1);
        const restBleibt = uids.length > auswahl.length;
        const neuerUidNext = restBleibt && letzteUid !== undefined ? letzteUid + 1 : box.uidNext;
        return { nachrichten, zustand: { uidValidity, uidNext: neuerUidNext }, vollstaendig: !fortsetzung };
      } finally {
        lock.release();
      }
    } finally {
      await c.logout().catch(() => undefined);
    }
  }

  async anhangLaden(nachrichtExternId: string, anhangExternId: string, hinweis?: AnhangHinweis): Promise<AnhangInhalt> {
    const [uidValidity, uidText] = nachrichtExternId.split(":");
    const uid = Number(uidText);
    if (!uidValidity || !Number.isInteger(uid) || uid <= 0) throw new Error("Ungueltige Nachrichtenkennung.");

    const c = this.verbindung();
    await c.connect();
    try {
      const lock = await c.getMailboxLock("INBOX");
      try {
        const box = c.mailbox;
        if (!box || typeof box === "boolean" || String(box.uidValidity) !== uidValidity) {
          throw new Error("Das Postfach wurde beim Anbieter neu aufgebaut; der Anhang ist nicht mehr erreichbar.");
        }
        const msg = await c.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
        if (!msg || !msg.source) throw new Error("Die Nachricht liegt nicht mehr im Posteingang.");
        const { anhaenge } = await mimeParsen(new Uint8Array(msg.source));
        const a = anhaenge.find((x) => x.externId === anhangExternId);
        if (!a) throw new Error("Der Anhang wurde in der Nachricht nicht gefunden.");
        return {
          dateiname: a.dateiname || hinweis?.dateiname || "Anhang",
          mime: a.mime ?? hinweis?.mime ?? "application/octet-stream",
          inhalt: a.inhalt,
        };
      } finally {
        lock.release();
      }
    } finally {
      await c.logout().catch(() => undefined);
    }
  }

  async senden(auftrag: Sendeauftrag): Promise<Sendeergebnis> {
    const roh = await rohNachricht(this.absender, auftrag);
    const empfaenger = [...auftrag.an, ...(auftrag.cc ?? [])].map((a) => a.adresse);
    await this.transport().sendMail({ envelope: { from: this.absender.adresse, to: empfaenger }, raw: roh.inhalt });

    // P5: Die Nachricht gehoert in den Ordner „Gesendet“ des Anbieters. Der
    // Versand ist bereits erfolgt; scheitert die Ablage, bleibt er gueltig.
    const c = this.verbindung();
    try {
      await c.connect();
      const ordner = await gesendetOrdner(c);
      await c.append(ordner, roh.inhalt, ["\\Seen"], new Date());
      await c.logout();
    } catch {
      await c.logout().catch(() => undefined);
    }
    return { externId: null, messageId: roh.messageId };
  }
}

async function gesendetOrdner(c: ImapFlow): Promise<string> {
  const liste = await c.list();
  const gesendet = liste.find((m) => m.specialUse === "\\Sent");
  if (gesendet) return gesendet.path;
  const nachName = liste.find((m) => /^(sent|gesendet|gesendete objekte|sent items|sent messages)$/i.test(m.name ?? ""));
  return nachName?.path ?? "Sent";
}
