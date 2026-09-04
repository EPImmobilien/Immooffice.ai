"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { entschluesseln, verschluesseln } from "@/integrationen/kern/zugangsdaten";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen, type Sitzung } from "@/lib/auth/sitzung";
import { DOKUMENTARTEN, DOKUMENT_BUCKET, DOKUMENT_MAX_BYTES, DOKUMENT_MIME, type Dokumentart } from "@/lib/dokumente";
import { kiVerfuegbar, textAnbieter, type ObjektKontext } from "@/lib/ki";
import { anbieterErzeugen } from "@/lib/postfach/anbieter";
import { abrufAnstossen } from "@/lib/postfach/anstossen";
import { autorisierungsUrl, fehlerText, oauthKonfig, stateErzeugen, type OAuthArt } from "@/lib/postfach/oauth";
import { vorschau, zitatAbschneiden } from "@/lib/postfach/text";
import { adressenJson, imapZugangSchema, zugangParsen, type Adresse } from "@/lib/postfach/typen";
import { dienstClient } from "@/lib/supabase/dienst";
import { anhangPdf } from "@/lib/dokument/erzeugen";
import { serverClient } from "@/lib/supabase/server";

/**
 * Postfaecher (docs/AUTONOMIE.md Abschnitt 6).
 *
 * Zugangsdaten werden hier verschluesselt und danach nie wieder an den Browser
 * gegeben; zum Senden und zum Laden von Anhaengen liest sie ausschliesslich der
 * Server ueber die Dienstrolle — immer erst, nachdem die Row-Level-Security mit
 * der Sitzung des Benutzers bestaetigt hat, dass er das Postfach sehen darf.
 */

export interface PostfachErgebnis {
  fehler?: string;
  erfolg?: string;
  /** Antwortentwurf (KI oder Rahmen) */
  entwurf?: string;
  kiVerwendet?: boolean;
  quelle?: string;
  credits?: number;
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}

function basisUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");
}

const adresseSchema = z.email({ message: "Bitte eine gültige E-Mail-Adresse angeben." });

function adressenParsen(wert: string): Adresse[] | null {
  const liste: Adresse[] = [];
  for (const teil of wert.split(/[,;\n]+/)) {
    const t = teil.trim();
    if (!t) continue;
    const m = /^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/.exec(t);
    const adresse = (m?.[2] ?? t).trim().toLowerCase();
    if (!adresseSchema.safeParse(adresse).success) return null;
    const name = m?.[1]?.trim();
    liste.push(name ? { adresse, name } : { adresse });
  }
  return liste;
}

// ---------------------------------------------------------------------------
// Verbinden
// ---------------------------------------------------------------------------

export async function imapVerbinden(_vorher: PostfachErgebnis, formular: FormData): Promise<PostfachErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "anlegen", sitzung.uebersteuerung);

  const unternehmen = text(formular, "unternehmen") === "1";
  if (unternehmen && !hatRecht(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung)) {
    return { fehler: "Unternehmenspostfächer legt nur die Verwaltung an." };
  }
  if (!process.env["VERSCHLUESSELUNG_SCHLUESSEL"]) {
    return { fehler: "Der Verschlüsselungsschlüssel fehlt — Zugangsdaten können nicht gespeichert werden (docs/ANLEITUNG.md, Abschnitt 4)." };
  }

  const adresse = adresseSchema.safeParse(text(formular, "adresse").toLowerCase());
  if (!adresse.success) return { fehler: adresse.error.issues[0]?.message ?? "Bitte die Adresse prüfen." };

  const zugang = imapZugangSchema.safeParse({
    art: "imap",
    imapHost: text(formular, "imap_host"),
    imapPort: Number(text(formular, "imap_port") || 993),
    imapTls: text(formular, "imap_tls") !== "0",
    smtpHost: text(formular, "smtp_host") || text(formular, "imap_host"),
    smtpPort: Number(text(formular, "smtp_port") || 465),
    smtpTls: text(formular, "smtp_tls") !== "0",
    benutzer: text(formular, "benutzer") || adresse.data,
    passwort: String(formular.get("passwort") ?? ""),
  });
  if (!zugang.success) return { fehler: "Bitte Server, Benutzername und Passwort vollständig angeben." };

  const anzeigename = text(formular, "anzeigename").slice(0, 120);
  const anbieter = anbieterErzeugen(zugang.data, anzeigename ? { adresse: adresse.data, name: anzeigename } : { adresse: adresse.data });
  const pruefung = await anbieter.pruefen();
  if (!pruefung.ok) return { fehler: `Verbindung fehlgeschlagen — ${pruefung.fehler}` };

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("postfaecher")
    .insert({
      mandant_id: sitzung.mandantId,
      benutzer_id: unternehmen ? null : sitzung.benutzerId,
      anbieter: "imap",
      adresse: adresse.data,
      anzeigename: anzeigename || null,
      zugangsdaten: verschluesseln(JSON.stringify(zugang.data), sitzung.mandantId),
      status: "aktiv",
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { fehler: error?.code === "23505" ? "Dieses Postfach ist bereits verbunden." : "Das Postfach konnte nicht gespeichert werden." };
  }

  await abrufAnstossen(supabase, data.id as string, `sofort-${sitzung.benutzerId.slice(0, 8)}`);
  revalidatePath("/einstellungen/postfaecher");
  revalidatePath("/postfach");
  return { erfolg: "Postfach verbunden. Der erste Abruf läuft." };
}

/** Anmeldung bei Microsoft oder Google starten (Weiterleitung zum Anbieter). */
export async function oauthStarten(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "anlegen", sitzung.uebersteuerung);

  const art = text(formular, "art") as OAuthArt;
  const unternehmen = text(formular, "unternehmen") === "1";
  const zurueck = (fehler: string) => redirect(`/einstellungen/postfaecher?fehler=${encodeURIComponent(fehler)}`);

  if (art !== "microsoft" && art !== "google") return zurueck("Unbekannter Anbieter.");
  if (unternehmen && !hatRecht(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung)) {
    return zurueck("Unternehmenspostfächer legt nur die Verwaltung an.");
  }
  const konfig = oauthKonfig(art);
  if (!konfig) return zurueck("Dieser Anbieter ist noch nicht eingerichtet (docs/ANLEITUNG.md, Abschnitt 9).");
  if (!process.env["VERSCHLUESSELUNG_SCHLUESSEL"]) return zurueck("Der Verschlüsselungsschlüssel fehlt (docs/ANLEITUNG.md, Abschnitt 4).");

  const state = stateErzeugen({ benutzerId: sitzung.benutzerId, mandantId: sitzung.mandantId, art, unternehmen });
  redirect(autorisierungsUrl(konfig, `${basisUrl()}/api/postfach/oauth/rueckruf`, state));
}

// ---------------------------------------------------------------------------
// Verwalten
// ---------------------------------------------------------------------------

async function sichtbaresPostfach(sitzung: Sitzung, id: string) {
  const supabase = await serverClient();
  const { data } = await supabase
    .from("postfaecher")
    .select("id, benutzer_id, anbieter, adresse, anzeigename, status, signatur_anhaengen")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();
  return data;
}

export async function postfachAbrufen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "lesen", sitzung.uebersteuerung);
  const id = text(formular, "postfach_id");
  if (!id || !(await sichtbaresPostfach(sitzung, id))) return;
  const supabase = await serverClient();
  await abrufAnstossen(supabase, id, `sofort-${sitzung.benutzerId.slice(0, 8)}`);
  revalidatePath("/einstellungen/postfaecher");
  revalidatePath("/postfach");
}

export async function postfachAendern(_vorher: PostfachErgebnis, formular: FormData): Promise<PostfachErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "aendern", sitzung.uebersteuerung);
  const id = text(formular, "postfach_id");
  const intervall = Number(text(formular, "intervall_minuten") || 5);
  if (!id || !Number.isInteger(intervall) || intervall < 1 || intervall > 1440) return { fehler: "Bitte die Angaben prüfen." };

  const supabase = await serverClient();
  const { error, count } = await supabase
    .from("postfaecher")
    .update(
      {
        anzeigename: text(formular, "anzeigename").slice(0, 120) || null,
        intervall_minuten: intervall,
        signatur_anhaengen: text(formular, "signatur_anhaengen") === "1",
      },
      { count: "exact" },
    )
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);
  if (error || !count) return { fehler: "Das Postfach konnte nicht geändert werden." };
  revalidatePath("/einstellungen/postfaecher");
  return { erfolg: "Einstellungen gespeichert." };
}

export async function postfachTrennen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "aendern", sitzung.uebersteuerung);
  const id = text(formular, "postfach_id");
  if (!id) return;
  const supabase = await serverClient();
  await supabase.rpc("postfach_trennen", { p_id: id });
  revalidatePath("/einstellungen/postfaecher");
  revalidatePath("/postfach");
}

export async function postfachLoeschen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "loeschen", sitzung.uebersteuerung);
  const id = text(formular, "postfach_id");
  if (!id) return;
  const supabase = await serverClient();
  await supabase.from("postfaecher").delete().eq("id", id).eq("mandant_id", sitzung.mandantId).eq("status", "getrennt");
  revalidatePath("/einstellungen/postfaecher");
  revalidatePath("/postfach");
}

export async function freigabeSetzen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);
  const postfachId = text(formular, "postfach_id");
  const benutzerId = text(formular, "benutzer_id");
  if (!postfachId || !benutzerId) return;
  const supabase = await serverClient();
  await supabase.from("postfach_freigaben").upsert(
    {
      postfach_id: postfachId,
      benutzer_id: benutzerId,
      mandant_id: sitzung.mandantId,
      darf_senden: text(formular, "darf_senden") === "1",
      erstellt_von: sitzung.benutzerId,
    },
    { onConflict: "postfach_id,benutzer_id" },
  );
  revalidatePath("/einstellungen/postfaecher");
}

export async function freigabeEntfernen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);
  const postfachId = text(formular, "postfach_id");
  const benutzerId = text(formular, "benutzer_id");
  if (!postfachId || !benutzerId) return;
  const supabase = await serverClient();
  await supabase.from("postfach_freigaben").delete().eq("postfach_id", postfachId).eq("benutzer_id", benutzerId).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/einstellungen/postfaecher");
}

// ---------------------------------------------------------------------------
// Nachrichten: lesen, zuordnen, antworten
// ---------------------------------------------------------------------------

export async function nachrichtGelesen(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "lesen", sitzung.uebersteuerung);
  const id = text(formular, "nachricht_id");
  if (!id) return;
  const supabase = await serverClient();
  await supabase.from("nachrichten").update({ gelesen: text(formular, "gelesen") !== "0" }).eq("id", id).eq("mandant_id", sitzung.mandantId);
  revalidatePath("/postfach");
}

export async function nachrichtZuordnen(_vorher: PostfachErgebnis, formular: FormData): Promise<PostfachErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "aendern", sitzung.uebersteuerung);
  const id = text(formular, "nachricht_id");
  const objektId = text(formular, "objekt_id") || null;
  const kontaktId = text(formular, "kontakt_id") || null;
  if (!id) return { fehler: "Nachricht fehlt." };

  const supabase = await serverClient();
  const { data: nachricht } = await supabase
    .from("nachrichten")
    .select("id, betreff, von_adresse, objekt_id, kontakt_id")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();
  if (!nachricht) return { fehler: "Die Nachricht wurde nicht gefunden." };

  const { error } = await supabase
    .from("nachrichten")
    .update({
      objekt_id: objektId,
      kontakt_id: kontaktId,
      zuordnung_art: objektId || kontaktId ? "manuell" : null,
      objekt_vorschlag_id: null,
      objekt_vorschlag_konfidenz: null,
      objekt_vorschlag_grund: null,
    })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Die Zuordnung konnte nicht gespeichert werden. Gehören Objekt und Kontakt zu Ihrem Unternehmen?" };

  const neuObjekt = objektId && objektId !== nachricht.objekt_id;
  const neuKontakt = kontaktId && kontaktId !== nachricht.kontakt_id;
  if (neuObjekt || neuKontakt) {
    await supabase.from("aktivitaeten").insert({
      mandant_id: sitzung.mandantId,
      objekt_id: objektId,
      kontakt_id: kontaktId,
      typ: "email",
      beschreibung: `E-Mail zugeordnet: ${nachricht.betreff ?? "(ohne Betreff)"} — von ${nachricht.von_adresse ?? "unbekannt"}`.slice(0, 2000),
      metadaten: { nachricht_id: id, zuordnung: "manuell" },
      benutzer_id: sitzung.benutzerId,
    });
  }
  revalidatePath("/postfach");
  if (objektId) revalidatePath(`/objekte/${objektId}`);
  if (kontaktId) revalidatePath(`/kontakte/${kontaktId}`);
  return { erfolg: "Zuordnung gespeichert." };
}

/** Zugangsdaten eines Postfachs — nur ueber die Dienstrolle, nur nach RLS-Sichtpruefung. */
async function zugangLaden(sitzung: Sitzung, postfachId: string) {
  const dienst = dienstClient();
  const { data } = await dienst
    .from("postfaecher")
    .select("id, adresse, anzeigename, zugangsdaten, signatur_anhaengen, benutzer_id")
    .eq("id", postfachId)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();
  if (!data || !data.zugangsdaten) return null;
  const zugang = zugangParsen(entschluesseln(data.zugangsdaten as string, sitzung.mandantId));
  const absender: Adresse = data.anzeigename
    ? { adresse: data.adresse as string, name: data.anzeigename as string }
    : { adresse: data.adresse as string, name: sitzung.name };
  return { dienst, zugang, absender, signatur: Boolean(data.signatur_anhaengen) };
}

async function signaturText(sitzung: Sitzung): Promise<string> {
  const supabase = await serverClient();
  const { data } = await supabase.from("mandant_branding").select("*").eq("mandant_id", sitzung.mandantId).maybeSingle();
  const b = (data ?? {}) as Record<string, unknown>;
  const zeile = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim() : null);
  const anschrift = [zeile("strasse") ? `${zeile("strasse")} ${zeile("hausnummer") ?? ""}`.trim() : null, [zeile("plz"), zeile("ort")].filter(Boolean).join(" ") || null]
    .filter(Boolean)
    .join(", ");
  return [
    "",
    "--",
    sitzung.name,
    zeile("firmenname") ?? sitzung.mandantName,
    anschrift || null,
    zeile("telefon") ? `Telefon ${zeile("telefon")}` : null,
    zeile("email") ?? sitzung.email,
    zeile("website"),
  ]
    .filter((z): z is string => z !== null)
    .join("\n");
}

export async function nachrichtSenden(_vorher: PostfachErgebnis, formular: FormData): Promise<PostfachErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "anlegen", sitzung.uebersteuerung);

  const postfachId = text(formular, "postfach_id");
  const an = adressenParsen(text(formular, "an"));
  const cc = adressenParsen(text(formular, "cc"));
  const betreff = text(formular, "betreff").slice(0, 500);
  let inhalt = String(formular.get("text") ?? "").replace(/\r\n?/g, "\n").trim();
  const antwortAuf = text(formular, "antwort_auf") || null;
  if (!postfachId) return { fehler: "Bitte ein Postfach wählen." };
  if (!an || an.length === 0) return { fehler: "Bitte mindestens eine gültige Empfängeradresse angeben." };
  if (!cc) return { fehler: "Eine Kopie-Adresse ist ungültig." };
  if (!betreff) return { fehler: "Bitte einen Betreff angeben." };
  if (!inhalt) return { fehler: "Die Nachricht ist leer." };
  const anhangArt = text(formular, "anhang_art");
  const anhangId = text(formular, "anhang_id");

  const supabase = await serverClient();
  // Rechnung oder Brief als PDF anhaengen: gestellte Rechnungen kommen als festgeschriebene Datei.
  let anhang: Awaited<ReturnType<typeof anhangPdf>> = null;
  if ((anhangArt === "rechnung" || anhangArt === "brief" || anhangArt === "termin") && /^[0-9a-f-]{36}$/.test(anhangId)) {
    rechtErzwingen(sitzung.rolle, anhangArt === "termin" ? "kalender" : "rechnungen", "lesen", sitzung.uebersteuerung);
    anhang = await anhangPdf(supabase, sitzung.mandantId, sitzung.mandantName, anhangArt, anhangId);
    if (!anhang) return { fehler: "Der Anhang wurde nicht gefunden." };
  }
  let original: Record<string, unknown> | null = null;
  if (antwortAuf) {
    const { data } = await supabase
      .from("nachrichten")
      .select("id, extern_id, message_id, thread_id, objekt_id, kontakt_id, postfach_id")
      .eq("id", antwortAuf)
      .eq("mandant_id", sitzung.mandantId)
      .maybeSingle();
    original = data;
  }

  const geladen = await zugangLaden(sitzung, postfachId);
  if (!geladen) return { fehler: "Das Postfach ist nicht verbunden." };
  if (geladen.signatur) inhalt = `${inhalt}\n${await signaturText(sitzung)}`;

  // Erst die Zeile anlegen: Die Policy entscheidet, ob ueber dieses Postfach
  // gesendet werden darf — bevor eine einzige Nachricht rausgeht.
  const lokaleId = `lokal:${randomUUID()}`;
  const { data: zeile, error: zeilenFehler } = await supabase
    .from("nachrichten")
    .insert({
      mandant_id: sitzung.mandantId,
      postfach_id: postfachId,
      ordner: "gesendet",
      extern_id: lokaleId,
      in_reply_to: (original?.["message_id"] as string | null) ?? null,
      thread_id: (original?.["thread_id"] as string | null) ?? null,
      von_adresse: geladen.absender.adresse,
      von_name: geladen.absender.name ?? null,
      an: adressenJson(an),
      cc: adressenJson(cc),
      betreff,
      text: inhalt,
      vorschau: vorschau(inhalt),
      gesendet_am: new Date().toISOString(),
      gelesen: true,
      objekt_id: (original?.["objekt_id"] as string | null) ?? null,
      kontakt_id: (original?.["kontakt_id"] as string | null) ?? null,
      zuordnung_art: original?.["objekt_id"] || original?.["kontakt_id"] ? "manuell" : null,
    })
    .select("id")
    .single();
  if (zeilenFehler || !zeile) return { fehler: "Über dieses Postfach dürfen Sie nicht senden." };

  try {
    const anbieter = anbieterErzeugen(geladen.zugang, geladen.absender);
    const messageId = original?.["message_id"] as string | null | undefined;
    const ergebnis = await anbieter.senden({
      an,
      cc,
      betreff,
      text: inhalt,
      inReplyTo: messageId ?? null,
      ...(messageId ? { references: [messageId] } : {}),
      antwortAufExternId: original && original["postfach_id"] === postfachId ? ((original["extern_id"] as string | null) ?? null) : null,
      threadId: (original?.["thread_id"] as string | null) ?? null,
      ...(anhang ? { anhaenge: [{ dateiname: anhang.dateiname, mime: anhang.mime, inhalt: anhang.inhalt }] } : {}),
    });
    await geladen.dienst
      .from("nachrichten")
      .update({ extern_id: ergebnis.externId ?? lokaleId, message_id: ergebnis.messageId })
      .eq("id", zeile.id);
    const erneuert = anbieter.aktualisierterZugang?.() ?? null;
    if (erneuert) {
      await geladen.dienst
        .from("postfaecher")
        .update({ zugangsdaten: verschluesseln(JSON.stringify(erneuert), sitzung.mandantId) })
        .eq("id", postfachId);
    }
  } catch (e) {
    await geladen.dienst.from("nachrichten").delete().eq("id", zeile.id);
    return { fehler: `Der Versand ist fehlgeschlagen — ${fehlerText(e)}` };
  }

  if (anhang) {
    await supabase.from("nachricht_anhaenge").insert({ mandant_id: sitzung.mandantId, nachricht_id: zeile.id, dateiname: anhang.dateiname, mime: anhang.mime, bytes: anhang.inhalt.byteLength });
    await supabase.from("nachrichten").update({ hat_anhaenge: true }).eq("id", zeile.id);
    if (anhangArt === "brief") await supabase.from("briefe").update({ status: "versendet", versendet_am: new Date().toISOString() }).eq("id", anhangId).eq("mandant_id", sitzung.mandantId);
    if (anhangArt === "termin") await supabase.from("termine").update({ bestaetigt_am: new Date().toISOString(), bestaetigung_nachricht_id: zeile.id }).eq("id", anhangId).eq("mandant_id", sitzung.mandantId);
  }

  const objektId = original?.["objekt_id"] as string | null | undefined;
  const kontaktId = original?.["kontakt_id"] as string | null | undefined;
  if (objektId || kontaktId) {
    await supabase.from("aktivitaeten").insert({
      mandant_id: sitzung.mandantId,
      objekt_id: objektId ?? null,
      kontakt_id: kontaktId ?? null,
      typ: "email",
      beschreibung: `E-Mail gesendet an ${an.map((a) => a.adresse).join(", ")}: ${betreff}`.slice(0, 2000),
      metadaten: { nachricht_id: zeile.id, richtung: "ausgehend" },
      benutzer_id: sitzung.benutzerId,
    });
  }

  revalidatePath("/postfach");
  return { erfolg: anhang ? `Nachricht mit Anhang „${anhang.bezeichnung}“ gesendet.` : "Nachricht gesendet." };
}

export async function anhangUebernehmen(_vorher: PostfachErgebnis, formular: FormData): Promise<PostfachErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung);
  const anhangId = text(formular, "anhang_id");
  const objektId = text(formular, "objekt_id");
  const art = (text(formular, "art") || "sonstiges") as Dokumentart;
  if (!anhangId || !objektId) return { fehler: "Bitte ein Objekt wählen." };
  if (!(art in DOKUMENTARTEN)) return { fehler: "Unbekannte Unterlagenart." };

  const supabase = await serverClient();
  const [{ data: anhang }, { data: objekt }] = await Promise.all([
    supabase
      .from("nachricht_anhaenge")
      .select("id, extern_id, dateiname, mime, bytes, dokument_id, nachricht_id, nachrichten(extern_id, postfach_id)")
      .eq("id", anhangId)
      .eq("mandant_id", sitzung.mandantId)
      .maybeSingle(),
    supabase.from("objekte").select("id").eq("id", objektId).eq("mandant_id", sitzung.mandantId).maybeSingle(),
  ]);
  if (!anhang) return { fehler: "Der Anhang wurde nicht gefunden." };
  if (!objekt) return { fehler: "Das Objekt wurde nicht gefunden." };
  if (anhang.dokument_id) return { fehler: "Dieser Anhang liegt bereits in den Unterlagen." };
  if (!anhang.extern_id) return { fehler: "Dieser Anhang kann nicht mehr geladen werden." };

  const nachricht = anhang.nachrichten as unknown as { extern_id: string; postfach_id: string } | null;
  if (!nachricht) return { fehler: "Die zugehörige Nachricht fehlt." };

  const geladen = await zugangLaden(sitzung, nachricht.postfach_id);
  if (!geladen) return { fehler: "Das Postfach ist nicht mehr verbunden." };

  let datei: { dateiname: string; mime: string; inhalt: Uint8Array };
  try {
    const anbieter = anbieterErzeugen(geladen.zugang, geladen.absender);
    datei = await anbieter.anhangLaden(nachricht.extern_id, anhang.extern_id as string, {
      dateiname: anhang.dateiname as string,
      ...(anhang.mime ? { mime: anhang.mime as string } : {}),
    });
  } catch (e) {
    return { fehler: `Der Anhang konnte nicht geladen werden — ${fehlerText(e)}` };
  }
  if (!(DOKUMENT_MIME as readonly string[]).includes(datei.mime)) return { fehler: "Dieses Dateiformat wird in den Unterlagen nicht unterstützt." };
  if (datei.inhalt.byteLength > DOKUMENT_MAX_BYTES) return { fehler: "Die Datei ist größer als 50 MB." };

  const sicherer = datei.dateiname.replace(/[^\w.\-äöüÄÖÜß ]+/g, "_").slice(0, 120) || "Anhang";
  const pfad = `${sitzung.mandantId}/${objektId}/${randomUUID()}-${sicherer}`;
  const { error: uploadFehler } = await geladen.dienst.storage
    .from(DOKUMENT_BUCKET)
    .upload(pfad, datei.inhalt, { contentType: datei.mime, upsert: false });
  if (uploadFehler) return { fehler: "Die Datei konnte nicht abgelegt werden." };

  const { data: dokument, error } = await supabase
    .from("objekt_dokumente")
    .insert({
      mandant_id: sitzung.mandantId,
      objekt_id: objektId,
      pfad,
      dateiname: datei.dateiname.slice(0, 300),
      art,
      notiz: "Aus dem Postfach übernommen",
      mime: datei.mime,
      bytes: datei.inhalt.byteLength,
      sichtbarkeit: "intern",
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  if (error || !dokument) {
    await geladen.dienst.storage.from(DOKUMENT_BUCKET).remove([pfad]);
    return { fehler: "Die Unterlage konnte nicht gespeichert werden." };
  }

  await supabase.from("nachricht_anhaenge").update({ dokument_id: dokument.id }).eq("id", anhangId).eq("mandant_id", sitzung.mandantId);
  await supabase.from("aktivitaeten").insert({
    mandant_id: sitzung.mandantId,
    objekt_id: objektId,
    typ: "dokument_hinzugefuegt",
    beschreibung: `Unterlage aus E-Mail übernommen: ${datei.dateiname}`.slice(0, 2000),
    metadaten: { dokument_id: dokument.id, nachricht_id: anhang.nachricht_id },
    benutzer_id: sitzung.benutzerId,
  });
  revalidatePath("/postfach");
  revalidatePath(`/objekte/${objektId}`);
  return { erfolg: `„${datei.dateiname}“ liegt jetzt in den Unterlagen des Objekts.` };
}

const OBJEKT_FELDER =
  "objektkategorie, objektart, vermarktungsart, nutzungsart, ort, ortsteil, wohnflaeche, nutzflaeche, grundstuecksflaeche, zimmer, baujahr, kaufpreis, kaltmiete, energie_klasse, energie_kennwert";

export async function antwortEntwerfen(_vorher: PostfachErgebnis, formular: FormData): Promise<PostfachErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "postfach", "anlegen", sitzung.uebersteuerung);
  const id = text(formular, "nachricht_id");
  const stichpunkte = String(formular.get("stichpunkte") ?? "").trim().slice(0, 1000) || null;
  if (!id) return { fehler: "Nachricht fehlt." };

  const supabase = await serverClient();
  const { data: nachricht } = await supabase
    .from("nachrichten")
    .select("id, betreff, text, objekt_id")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();
  if (!nachricht) return { fehler: "Die Nachricht wurde nicht gefunden." };
  if (!nachricht.text) return { fehler: "Der Text dieser Nachricht ist nicht mehr gespeichert." };

  let objekt: ObjektKontext | null = null;
  if (nachricht.objekt_id) {
    const { data } = await supabase.from("objekte").select(OBJEKT_FELDER).eq("id", nachricht.objekt_id).maybeSingle();
    if (data) objekt = { ...(data as unknown as ObjektKontext), stichpunkte: null };
  }

  const anbieter = textAnbieter();
  const mitKi = kiVerfuegbar();
  let vorgang: string | null = null;
  if (mitKi) {
    const { data, error } = await supabase.rpc("credits_reservieren", {
      p_aktion: "ki_text_einzeln",
      p_referenz_art: "nachricht",
      p_referenz_id: id,
    });
    if (error) return { fehler: `Kein KI-Entwurf möglich: ${error.message}` };
    vorgang = data as string;
  }

  try {
    const ergebnis = await anbieter.antwortEntwerfen({
      betreff: (nachricht.betreff as string | null) ?? null,
      text: zitatAbschneiden(nachricht.text as string).slice(0, 4000),
      stichpunkte,
      objekt,
      absenderName: sitzung.name,
      unternehmen: sitzung.mandantName,
    });
    if (vorgang) await supabase.rpc("credits_einloesen", { p_vorgang: vorgang, p_kosten_cent: ergebnis.kostenCent });
    return { entwurf: ergebnis.text, kiVerwendet: ergebnis.kiVerwendet, quelle: ergebnis.quelle, credits: vorgang ? ergebnis.credits : 0 };
  } catch (e) {
    if (vorgang) await supabase.rpc("credits_freigeben", { p_vorgang: vorgang, p_grund: fehlerText(e).slice(0, 200) });
    return { fehler: `Der Entwurf ist fehlgeschlagen — ${fehlerText(e)}` };
  }
}
