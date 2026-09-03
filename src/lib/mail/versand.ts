import "server-only";

/**
 * Transaktionsmails ueber einen EU-tauglichen Versanddienst (Resend-API).
 *
 * Bewusst ohne SDK: ein POST auf /emails. Ohne MAIL_API_KEY wird nicht
 * versendet, sondern ein sprechender Fehler geworfen — der Auftrag bleibt in
 * der Warteschlange sichtbar, statt still zu verschwinden.
 */

export interface Mail {
  an: string;
  betreff: string;
  text: string;
  html?: string;
  antwortAn?: string;
}

export interface Versandergebnis {
  id: string | null;
}

export async function mailSenden(mail: Mail, fetchFn: typeof globalThis.fetch = globalThis.fetch): Promise<Versandergebnis> {
  const schluessel = process.env["MAIL_API_KEY"];
  const absender = process.env["MAIL_ABSENDER"];
  const absenderName = process.env["MAIL_ABSENDER_NAME"] ?? "ImmoOffice.ai";
  if (!schluessel || !absender) {
    throw new Error("Mailversand nicht eingerichtet: MAIL_API_KEY oder MAIL_ABSENDER fehlt (docs/ANLEITUNG.md, Abschnitt 5).");
  }

  const antwort = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${schluessel}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${absenderName} <${absender}>`,
      to: [mail.an],
      subject: mail.betreff,
      text: mail.text,
      ...(mail.html ? { html: mail.html } : {}),
      ...(mail.antwortAn ? { reply_to: mail.antwortAn } : {}),
    }),
  });

  if (!antwort.ok) {
    // Die Antwort kann Adressen enthalten; nur der Status wandert ins Protokoll.
    throw new Error(`Mailversand abgelehnt (HTTP ${antwort.status}).`);
  }
  const daten = (await antwort.json().catch(() => ({}))) as { id?: string };
  return { id: daten.id ?? null };
}
