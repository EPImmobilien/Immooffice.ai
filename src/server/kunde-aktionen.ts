"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DOKUMENT_BUCKET } from "@/lib/dokumente";
import { istToken, tokenErzeugen } from "@/lib/portal/token";
import { kundenLink } from "@/lib/portal/typen";
import { antragAusFormular, antragPruefen } from "@/lib/portal/verbrauchsausweis";
import { dienstClient } from "@/lib/supabase/dienst";
import { serverClient } from "@/lib/supabase/server";

/**
 * Kundenseite des Kundenbereichs (/kunde/[token]) und oeffentliche
 * Projektseite (/projekt/[token]). Der Kunde hat kein Konto: Jede Aktion geht
 * mit Token (und ggf. Passwort) an eine Datenbankfunktion, die nur die Daten
 * dieses einen Zugangs anfasst. Muster wie das Web-Exposé.
 *
 * Der Dienst-Client wird nur fuer den Bucket gebraucht (signierte Adressen,
 * Ablage von Kunden-Uploads) — nachdem die Datenbank den Zugriff bestaetigt hat.
 */

export interface KundeErgebnis {
  fehler?: string;
  erfolg?: string;
  id?: string;
  url?: string;
  gemerkt?: boolean;
}

export async function kundeCookieName(token: string): Promise<string> {
  return `kunde_${token.slice(0, 16)}`;
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}
function uuidOderNull(wert: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wert) ? wert : null;
}

async function passwortAusCookie(token: string): Promise<string | null> {
  const kekse = await cookies();
  return kekse.get(await kundeCookieName(token))?.value ?? null;
}

const GRUENDE: Record<string, string> = {
  zugang: "Der Zugang ist nicht mehr gültig. Bitte den Link aus Ihrer Einladung neu öffnen.",
  text: "Bitte einen Text eingeben.",
  zu_viele: "Es sind bereits sehr viele Einträge eingegangen. Bitte versuchen Sie es später erneut.",
  einheit: "Diese Wohnung gehört nicht zum Projekt.",
  vergeben: "Diese Wohnung ist nicht mehr verfügbar.",
  doppelt: "Diese Anfrage liegt uns bereits vor — wir melden uns.",
  art: "Unbekannte Anfrageart.",
  laenge: "Das Passwort braucht mindestens 8 Zeichen.",
  pfad: "Die Datei konnte nicht zugeordnet werden.",
  objekt: "Das Objekt gehört nicht zu Ihrem Zugang.",
  antrag: "Der Antrag ist bereits eingereicht und kann nicht mehr geändert werden.",
  eingabe: "Bitte prüfen Sie Name und E-Mail-Adresse.",
  unbekannt: "Diese Projektseite ist nicht mehr erreichbar.",
};

/** Passwortabfrage: prueft und merkt das Passwort fuer den Pfad des Zugangs. */
export async function kundeOeffnen(_vorher: KundeErgebnis, formular: FormData): Promise<KundeErgebnis> {
  const token = text(formular, "token");
  const passwort = String(formular.get("passwort") ?? "");
  if (!istToken(token)) return { fehler: "Ungültiger Link." };
  const supabase = await serverClient();
  const { data } = await supabase.rpc("portal_oeffnen", { p_token: token, p_passwort: passwort });
  const zustand = (data as { zustand?: string } | null)?.zustand;
  if (zustand !== "ok") return { fehler: "Das Passwort ist nicht korrekt." };
  const kekse = await cookies();
  kekse.set(await kundeCookieName(token), passwort, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/kunde/${token}`,
    maxAge: 60 * 60 * 8,
  });
  redirect(`/kunde/${token}`);
}

export async function kundePasswortSetzen(_vorher: KundeErgebnis, formular: FormData): Promise<KundeErgebnis> {
  const token = text(formular, "token");
  if (!istToken(token)) return { fehler: "Ungültiger Link." };
  const neues = String(formular.get("neues") ?? "");
  const wiederholung = String(formular.get("wiederholung") ?? "");
  if (neues !== wiederholung) return { fehler: "Die Wiederholung stimmt nicht überein." };
  const altes = await passwortAusCookie(token);
  const supabase = await serverClient();
  const { data } = await supabase.rpc("portal_passwort_setzen", { p_token: token, p_altes: altes, p_neues: neues });
  const a = data as { ok?: boolean; grund?: string } | null;
  if (!a?.ok) return { fehler: GRUENDE[a?.grund ?? ""] ?? "Das Passwort konnte nicht gesetzt werden." };
  const kekse = await cookies();
  kekse.set(await kundeCookieName(token), neues, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/kunde/${token}`, maxAge: 60 * 60 * 8 });
  revalidatePath(`/kunde/${token}`);
  return { erfolg: "Passwort gesetzt. Ab jetzt wird es beim Öffnen des Links abgefragt." };
}

export async function kundeNachricht(_vorher: KundeErgebnis, formular: FormData): Promise<KundeErgebnis> {
  const token = text(formular, "token");
  if (!istToken(token)) return { fehler: "Ungültiger Link." };
  const supabase = await serverClient();
  const { data } = await supabase.rpc("portal_nachricht_senden", { p_token: token, p_passwort: await passwortAusCookie(token), p_text: text(formular, "text") });
  const a = data as { ok?: boolean; grund?: string } | null;
  if (!a?.ok) return { fehler: GRUENDE[a?.grund ?? ""] ?? "Die Nachricht konnte nicht gesendet werden." };
  revalidatePath(`/kunde/${token}`);
  return { erfolg: "Nachricht gesendet." };
}

export async function kundeMerkliste(_vorher: KundeErgebnis, formular: FormData): Promise<KundeErgebnis> {
  const token = text(formular, "token");
  const einheit = uuidOderNull(text(formular, "einheit_id"));
  if (!istToken(token) || !einheit) return { fehler: "Ungültige Angaben." };
  const supabase = await serverClient();
  const { data } = await supabase.rpc("portal_merkliste_schalten", { p_token: token, p_passwort: await passwortAusCookie(token), p_einheit: einheit });
  const a = data as { ok?: boolean; grund?: string; gemerkt?: boolean } | null;
  if (!a?.ok) return { fehler: GRUENDE[a?.grund ?? ""] ?? "Die Merkliste konnte nicht geändert werden." };
  revalidatePath(`/kunde/${token}`);
  return { erfolg: a.gemerkt ? "Auf die Merkliste gesetzt." : "Von der Merkliste entfernt.", gemerkt: a.gemerkt ?? false };
}

export async function kundeAnfrage(_vorher: KundeErgebnis, formular: FormData): Promise<KundeErgebnis> {
  const token = text(formular, "token");
  if (!istToken(token)) return { fehler: "Ungültiger Link." };
  const einheit = uuidOderNull(text(formular, "einheit_id"));
  const supabase = await serverClient();
  const { data } = await supabase.rpc("portal_anfrage_senden", {
    p_token: token, p_passwort: await passwortAusCookie(token), p_einheit: einheit,
    p_art: text(formular, "art") || "information", p_nachricht: text(formular, "nachricht"),
  });
  const a = data as { ok?: boolean; grund?: string } | null;
  if (!a?.ok) return { fehler: GRUENDE[a?.grund ?? ""] ?? "Die Anfrage konnte nicht gesendet werden." };
  revalidatePath(`/kunde/${token}`);
  return { erfolg: "Anfrage gesendet — wir melden uns bei Ihnen." };
}

/** Unterlage des Kunden: erst Zugang pruefen, dann ablegen, dann eintragen. */
export async function kundeUpload(_vorher: KundeErgebnis, formular: FormData): Promise<KundeErgebnis> {
  const token = text(formular, "token");
  if (!istToken(token)) return { fehler: "Ungültiger Link." };
  const datei = formular.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return { fehler: "Bitte eine Datei wählen." };
  if (datei.size > 25 * 1024 * 1024) return { fehler: "Die Datei ist größer als 25 MB." };
  if (!/^(application\/pdf|image\/(jpeg|png|webp|heic)|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/.test(datei.type)) {
    return { fehler: "Bitte PDF, Bild oder Word-Datei hochladen." };
  }
  const passwort = await passwortAusCookie(token);
  const supabase = await serverClient();
  const { data: offen } = await supabase.rpc("portal_daten", { p_token: token, p_passwort: passwort });
  const d = offen as { zustand?: string; kunde?: { id: string }; mandant?: unknown } | null;
  if (d?.zustand !== "ok" || !d.kunde) return { fehler: GRUENDE["zugang"] ?? "" };
  // Mandant-ID steckt nicht in den Kundendaten — der Pfad wird aus dem Zugang abgeleitet
  const dienst = dienstClient();
  const { data: zugang } = await dienst.from("portal_kunden").select("mandant_id").eq("id", d.kunde.id).maybeSingle();
  if (!zugang) return { fehler: GRUENDE["zugang"] ?? "" };
  const name = datei.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "datei";
  const pfad = `${zugang.mandant_id as string}/portal/${d.kunde.id}/${crypto.randomUUID()}-${name}`;
  const { error: up } = await dienst.storage.from(DOKUMENT_BUCKET).upload(pfad, Buffer.from(await datei.arrayBuffer()), { contentType: datei.type });
  if (up) return { fehler: "Die Datei konnte nicht abgelegt werden." };
  const { data } = await supabase.rpc("portal_dokument_eintragen", {
    p_token: token, p_passwort: passwort, p_name: datei.name.slice(0, 300), p_pfad: pfad, p_bytes: datei.size, p_mime: datei.type,
    p_objekt: uuidOderNull(text(formular, "objekt_id")), p_kategorie: text(formular, "kategorie").slice(0, 60) || "sonstiges",
  });
  const a = data as { ok?: boolean; grund?: string } | null;
  if (!a?.ok) {
    await dienst.storage.from(DOKUMENT_BUCKET).remove([pfad]).catch(() => null);
    return { fehler: GRUENDE[a?.grund ?? ""] ?? "Die Unterlage konnte nicht gespeichert werden." };
  }
  revalidatePath(`/kunde/${token}`);
  return { erfolg: `„${datei.name}“ hochgeladen. Ihr Ansprechpartner wird benachrichtigt.` };
}

/** Datei oeffnen: Datenbank prueft die Sicht, der Bucket liefert eine kurzlebige Adresse. */
export async function kundeDatei(_vorher: KundeErgebnis, formular: FormData): Promise<KundeErgebnis> {
  const token = text(formular, "token");
  const quelle = text(formular, "quelle");
  const id = uuidOderNull(text(formular, "id"));
  if (!istToken(token) || !id || !["objekt", "projekt", "persoenlich"].includes(quelle)) return { fehler: "Ungültige Angaben." };
  const supabase = await serverClient();
  const { data } = await supabase.rpc("portal_datei", { p_token: token, p_passwort: await passwortAusCookie(token), p_quelle: quelle, p_datei: id });
  const a = data as { ok?: boolean; pfad?: string } | null;
  if (!a?.ok || !a.pfad) return { fehler: "Diese Datei ist für Sie nicht freigegeben." };
  const { data: s } = await dienstClient().storage.from(DOKUMENT_BUCKET).createSignedUrl(a.pfad, 300);
  if (!s?.signedUrl) return { fehler: "Die Datei ist derzeit nicht abrufbar." };
  redirect(s.signedUrl);
}

/** Bilder eines Baufortschritts als signierte Adressen. */
export async function kundeUpdateBilder(token: string, updateId: string): Promise<string[]> {
  if (!istToken(token) || !uuidOderNull(updateId)) return [];
  const supabase = await serverClient();
  const { data } = await supabase.rpc("portal_update_bilder", { p_token: token, p_passwort: await passwortAusCookie(token), p_update: updateId });
  const pfade = Array.isArray(data) ? (data as string[]) : [];
  if (pfade.length === 0) return [];
  const { data: s } = await dienstClient().storage.from(DOKUMENT_BUCKET).createSignedUrls(pfade, 900);
  return (s ?? []).map((x) => x.signedUrl).filter((x): x is string => Boolean(x));
}

export async function kundeAntrag(_vorher: KundeErgebnis, formular: FormData): Promise<KundeErgebnis> {
  const token = text(formular, "token");
  if (!istToken(token)) return { fehler: "Ungültiger Link." };
  const werte: Record<string, string> = {};
  for (const [k, v] of formular.entries()) if (typeof v === "string") werte[k] = v;
  const daten = antragAusFormular(werte);
  const einreichen = formular.get("einreichen") === "1";
  if (einreichen) {
    const fehlt = antragPruefen(daten);
    if (fehlt.length > 0) return { fehler: `Zum Einreichen fehlen noch: ${fehlt.slice(0, 6).join(", ")}${fehlt.length > 6 ? " …" : ""}.` };
  }
  const supabase = await serverClient();
  const { data } = await supabase.rpc("portal_antrag_speichern", {
    p_token: token, p_passwort: await passwortAusCookie(token),
    p_id: uuidOderNull(text(formular, "id")), p_objekt: uuidOderNull(text(formular, "objekt_id")),
    p_daten: daten, p_einreichen: einreichen,
  });
  const a = data as { ok?: boolean; grund?: string; id?: string } | null;
  if (!a?.ok) return { fehler: GRUENDE[a?.grund ?? ""] ?? "Der Antrag konnte nicht gespeichert werden." };
  revalidatePath(`/kunde/${token}`);
  return { erfolg: einreichen ? "Antrag eingereicht — Ihr Ansprechpartner kümmert sich um den Ausweis." : "Zwischenstand gespeichert.", ...(a.id ? { id: a.id } : {}) };
}

// ---------------------------------------------------------------------------
// Oeffentliche Projektseite
// ---------------------------------------------------------------------------

/** Anfrage von der Projektseite: legt bei Bedarf einen Zugang an und schickt den Link. */
export async function projektAnfrage(_vorher: KundeErgebnis, formular: FormData): Promise<KundeErgebnis> {
  const token = text(formular, "token");
  if (!istToken(token)) return { fehler: "Ungültiger Link." };
  if (formular.get("einwilligung") !== "ja") return { fehler: "Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu." };
  const neu = tokenErzeugen();
  const supabase = await serverClient();
  const { data } = await supabase.rpc("projekt_anfrage_oeffentlich", {
    p_token: token, p_name: text(formular, "name"), p_email: text(formular, "email"), p_telefon: text(formular, "telefon"),
    p_einheit: uuidOderNull(text(formular, "einheit_id")), p_art: text(formular, "art") || "information",
    p_nachricht: text(formular, "nachricht"), p_token_hash: neu.hash,
  });
  const a = data as { ok?: boolean; grund?: string; kunde_id?: string; neu?: boolean } | null;
  if (!a?.ok) return { fehler: GRUENDE[a?.grund ?? ""] ?? "Die Anfrage konnte nicht übermittelt werden." };
  // Einladungsmail mit Zugangslink — nur wenn der Zugang gerade neu entstanden ist (sonst kennt der Kunde seinen Link).
  if (a.neu && a.kunde_id && process.env["MAIL_API_KEY"]) {
    const dienst = dienstClient();
    const { data: k } = await dienst.from("portal_kunden").select("mandant_id, email, anzeigename, projekt_id").eq("id", a.kunde_id).maybeSingle();
    if (k) {
      const [{ data: m }, { data: p }] = await Promise.all([
        dienst.from("mandanten").select("name").eq("id", k.mandant_id as string).maybeSingle(),
        dienst.from("projekte").select("name").eq("id", k.projekt_id as string).maybeSingle(),
      ]);
      const link = kundenLink((process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/+$/, ""), neu.token);
      await dienst.from("jobs").insert({
        mandant_id: k.mandant_id, art: "mail", prioritaet: 5,
        nutzlast: {
          vorlage: "frei", an: k.email,
          betreff: `Ihre Anfrage zum Projekt „${(p?.name as string) ?? ""}“`,
          text: `Guten Tag ${k.anzeigename as string},\n\nvielen Dank für Ihre Anfrage. Wir haben für Sie einen persönlichen Kundenbereich angelegt — dort sehen Sie den Stand Ihrer Anfrage, Unterlagen und Neuigkeiten zum Projekt:\n\n${link}\n\nBitte behandeln Sie den Link vertraulich.\n\nFreundliche Grüße\n${(m?.name as string) ?? ""}`,
        },
      });
    }
  }
  return { erfolg: a.neu ? "Vielen Dank! Wir haben Ihre Anfrage erhalten und schicken Ihnen den Link zu Ihrem persönlichen Kundenbereich per E-Mail." : "Vielen Dank! Wir haben Ihre Anfrage erhalten und melden uns." };
}

/** Oeffentliche Projektdatei (nur Sichtbarkeit „öffentlich“). */
export async function projektDatei(_vorher: KundeErgebnis, formular: FormData): Promise<KundeErgebnis> {
  const token = text(formular, "token");
  const id = uuidOderNull(text(formular, "id"));
  if (!istToken(token) || !id) return { fehler: "Ungültige Angaben." };
  const supabase = await serverClient();
  const { data } = await supabase.rpc("projekt_oeffentliche_datei", { p_token: token, p_datei: id });
  const a = data as { ok?: boolean; pfad?: string } | null;
  if (!a?.ok || !a.pfad) return { fehler: "Diese Datei ist nicht öffentlich." };
  const { data: s } = await dienstClient().storage.from(DOKUMENT_BUCKET).createSignedUrl(a.pfad, 300);
  if (!s?.signedUrl) return { fehler: "Die Datei ist derzeit nicht abrufbar." };
  redirect(s.signedUrl);
}
