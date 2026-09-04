"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { rechtErzwingen, type Rolle } from "@/lib/auth/rechte";
import { sitzungErzwingen, type Sitzung } from "@/lib/auth/sitzung";
import { MARKE_BUCKET } from "@/lib/marke";
import { tokenErzeugen } from "@/lib/portal/token";
import { serverClient } from "@/lib/supabase/server";
import { antragArbeitstage } from "@/lib/verwaltung/urlaub";
import { type Bundesland, BUNDESLAENDER } from "@/lib/verwaltung/feiertage";

/**
 * Verwaltung (docs/FUNKTIONSABGLEICH.md F1/N1): Profil, Arbeitszeit, Urlaub,
 * Kennzahlen, Finanzierungsannahmen, Bewerber, Selbstkuendigung, globale Suche.
 * Rechte: Profil und Stempeluhr fuer jeden aktiven Benutzer; Verwaltung
 * (Inhaber, Administrator) entscheidet Urlaub, pflegt Modelle, Kennzahlen und
 * Bewerber — die Datenbank erzwingt das zusaetzlich (RLS, Trigger).
 */

export interface VerwaltungErgebnis {
  fehler?: string;
  erfolg?: string;
  id?: string;
  link?: string;
  richtung?: string;
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}
function uuid(formular: FormData, feld: string): string | null {
  const w = text(formular, feld);
  return z.uuid().safeParse(w).success ? w : null;
}
function zahl(formular: FormData, feld: string): number | null {
  const w = text(formular, feld).replace(",", ".");
  if (w === "") return null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}
function istVerwaltung(rolle: Rolle): boolean {
  return rolle === "inhaber" || rolle === "administrator";
}
async function verwaltungErzwingen(): Promise<Sitzung> {
  const sitzung = await sitzungErzwingen();
  if (!istVerwaltung(sitzung.rolle)) throw new Error("Nur die Verwaltung darf das.");
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);
  return sitzung;
}

// ---------------------------------------------------------------------------
// Profil (jeder fuer sich): Titel, Funktion, Telefon, Foto, Signaturbild, Bundesland
// ---------------------------------------------------------------------------

async function bildAblegen(supabase: Awaited<ReturnType<typeof serverClient>>, mandantId: string, benutzerId: string, datei: File, art: "foto" | "signatur"): Promise<string | null> {
  if (!/^image\/(jpeg|png|webp)$/.test(datei.type) || datei.size > 5 * 1024 * 1024) return null;
  const endung = datei.type === "image/png" ? "png" : datei.type === "image/webp" ? "webp" : "jpg";
  const pfad = `${mandantId}/profil/${benutzerId}-${art}-${Date.now()}.${endung}`;
  const { error } = await supabase.storage.from(MARKE_BUCKET).upload(pfad, Buffer.from(await datei.arrayBuffer()), { contentType: datei.type, upsert: true });
  return error ? null : pfad;
}

export async function profilSpeichern(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();
  const felder: Record<string, unknown> = {
    name: text(formular, "name").slice(0, 200) || sitzung.name,
    titel: text(formular, "titel").slice(0, 60) || null,
    funktion: text(formular, "funktion").slice(0, 120) || null,
    telefon: text(formular, "telefon").slice(0, 60) || null,
  };
  const land = text(formular, "bundesland");
  felder["bundesland"] = land in BUNDESLAENDER ? land : null;
  const foto = formular.get("foto");
  if (foto instanceof File && foto.size > 0) {
    const pfad = await bildAblegen(supabase, sitzung.mandantId, sitzung.benutzerId, foto, "foto");
    if (!pfad) return { fehler: "Das Foto konnte nicht abgelegt werden (JPG, PNG oder WebP bis 5 MB)." };
    felder["foto_pfad"] = pfad;
  }
  if (formular.get("foto_entfernen") === "1") felder["foto_pfad"] = null;
  const signatur = formular.get("signatur");
  if (signatur instanceof File && signatur.size > 0) {
    const pfad = await bildAblegen(supabase, sitzung.mandantId, sitzung.benutzerId, signatur, "signatur");
    if (!pfad) return { fehler: "Das Signaturbild konnte nicht abgelegt werden (JPG, PNG oder WebP bis 5 MB)." };
    felder["signatur_pfad"] = pfad;
  }
  if (formular.get("signatur_entfernen") === "1") felder["signatur_pfad"] = null;
  const { error } = await supabase.from("benutzer").update(felder).eq("id", sitzung.benutzerId);
  if (error) return { fehler: "Das Profil konnte nicht gespeichert werden." };
  revalidatePath("/einstellungen/profil");
  revalidatePath("/", "layout");
  return { erfolg: "Profil gespeichert." };
}

/** Verwaltung: Eintritt, Urlaubskontingent, Uebertrag, Staffel, Bundesland eines Mitarbeiters. */
export async function mitarbeiterKontingentSpeichern(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  await verwaltungErzwingen();
  const id = uuid(formular, "benutzer_id");
  if (!id) return { fehler: "Mitarbeiter fehlt." };
  const staffel: Record<string, number> = {};
  for (const [k, v] of formular.entries()) {
    const m = /^staffel_(\d{4})$/.exec(k);
    if (m && typeof v === "string" && v.trim() !== "") { const n = Number(v.replace(",", ".")); if (Number.isFinite(n) && n >= 0 && n <= 60) staffel[m[1]!] = n; }
  }
  const land = text(formular, "bundesland");
  const supabase = await serverClient();
  const { error } = await supabase.from("benutzer").update({
    eintritt: text(formular, "eintritt") || null,
    urlaubstage_jahr: Math.min(60, Math.max(0, zahl(formular, "urlaubstage_jahr") ?? 30)),
    urlaub_uebertrag: Math.min(60, Math.max(0, zahl(formular, "urlaub_uebertrag") ?? 0)),
    urlaub_staffel: staffel,
    bundesland: land in BUNDESLAENDER ? land : null,
  }).eq("id", id);
  if (error) return { fehler: error.message };
  revalidatePath("/urlaub");
  revalidatePath("/einstellungen");
  return { erfolg: "Kontingent gespeichert." };
}

// ---------------------------------------------------------------------------
// Arbeitszeit
// ---------------------------------------------------------------------------

export async function stempeln(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  await sitzungErzwingen();
  const supabase = await serverClient();
  const richtung = text(formular, "richtung");
  const { data, error } = await supabase.rpc("stempeln", { p_richtung: richtung === "kommen" || richtung === "gehen" ? richtung : null });
  if (error) return { fehler: error.message };
  const a = data as { ok?: boolean; grund?: string; richtung?: string } | null;
  if (!a?.ok) return { fehler: a?.grund === "doppelt" ? `Sie sind bereits ${a.richtung === "kommen" ? "eingestempelt" : "ausgestempelt"}.` : "Stempeln fehlgeschlagen." };
  revalidatePath("/dashboard");
  revalidatePath("/arbeitszeit");
  return { erfolg: a.richtung === "kommen" ? "Eingestempelt." : "Ausgestempelt — schönen Feierabend.", richtung: a.richtung ?? "" };
}

/** Tag nachtragen (Arbeit mit Stunden oder Von/Bis, Urlaub, Krank, Frei, Fortbildung) — fuer sich selbst, Verwaltung fuer alle. */
export async function tagNachtragen(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();
  const benutzerId = uuid(formular, "benutzer_id") ?? sitzung.benutzerId;
  if (benutzerId !== sitzung.benutzerId && !istVerwaltung(sitzung.rolle)) return { fehler: "Nur die Verwaltung trägt für andere nach." };
  const datum = text(formular, "datum");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { fehler: "Bitte ein Datum angeben." };
  const art = text(formular, "art") || "arbeit";
  if (!["arbeit", "urlaub", "krank", "feiertag", "frei", "fortbildung"].includes(art)) return { fehler: "Unbekannte Art." };
  const von = text(formular, "von") || null;
  const bis = text(formular, "bis") || null;
  let stunden = zahl(formular, "stunden");
  if (art === "arbeit" && stunden == null && von && bis) {
    const [vh, vm] = von.split(":").map(Number); const [bh, bm] = bis.split(":").map(Number);
    stunden = Math.max(0, ((bh ?? 0) * 60 + (bm ?? 0) - (vh ?? 0) * 60 - (vm ?? 0)) / 60);
  }
  if (formular.get("loeschen") === "1") {
    await supabase.from("arbeitszeit_tage").delete().eq("benutzer_id", benutzerId).eq("datum", datum);
    revalidatePath("/arbeitszeit");
    return { erfolg: "Eintrag entfernt." };
  }
  const { error } = await supabase.from("arbeitszeit_tage").upsert({
    mandant_id: sitzung.mandantId, benutzer_id: benutzerId, datum, art,
    stunden: art === "arbeit" ? stunden : null, von, bis,
    bemerkung: text(formular, "bemerkung").slice(0, 500) || null, erfasst_von: sitzung.benutzerId,
  }, { onConflict: "benutzer_id,datum" });
  if (error) return { fehler: "Der Tag konnte nicht gespeichert werden." };
  // Ein offener Stempel des Tages wird durch den Nachtrag ersetzt
  if (art === "arbeit" && formular.get("stempel_verwerfen") === "1") await supabase.from("arbeitszeit_stempel").delete().eq("benutzer_id", benutzerId).eq("datum", datum);
  revalidatePath("/arbeitszeit");
  revalidatePath("/dashboard");
  return { erfolg: "Tag nachgetragen." };
}

/** Feierabend nachtragen: fehlenden Gehen-Stempel setzen. */
export async function feierabendNachtragen(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();
  const benutzerId = uuid(formular, "benutzer_id") ?? sitzung.benutzerId;
  if (benutzerId !== sitzung.benutzerId && !istVerwaltung(sitzung.rolle)) return { fehler: "Nur die Verwaltung trägt für andere nach." };
  const datum = text(formular, "datum");
  const zeit = text(formular, "zeit");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !/^\d{2}:\d{2}$/.test(zeit)) return { fehler: "Bitte Datum und Uhrzeit angeben." };
  if (formular.get("verwerfen") === "1") {
    await supabase.from("arbeitszeit_stempel").delete().eq("benutzer_id", benutzerId).eq("datum", datum);
    revalidatePath("/arbeitszeit"); revalidatePath("/dashboard");
    return { erfolg: "Stempel verworfen." };
  }
  // Zeitpunkt in Europe/Berlin
  const { ausBerlin } = await import("@/lib/kalender/zeit");
  const { error } = await supabase.from("arbeitszeit_stempel").insert({ mandant_id: sitzung.mandantId, benutzer_id: benutzerId, datum, richtung: "gehen", zeitpunkt: ausBerlin(datum, zeit).toISOString(), quelle: benutzerId === sitzung.benutzerId ? "nachtrag" : "verwaltung" });
  if (error) return { fehler: "Der Feierabend konnte nicht nachgetragen werden." };
  revalidatePath("/arbeitszeit"); revalidatePath("/dashboard");
  return { erfolg: "Feierabend nachgetragen." };
}

export async function wochenmodellSpeichern(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await verwaltungErzwingen();
  const benutzerId = uuid(formular, "benutzer_id");
  const gueltigAb = text(formular, "gueltig_ab");
  if (!benutzerId || !/^\d{4}-\d{2}-\d{2}$/.test(gueltigAb)) return { fehler: "Mitarbeiter und Gültigkeitsdatum angeben." };
  const st = (k: string) => Math.min(24, Math.max(0, zahl(formular, k) ?? 0));
  const supabase = await serverClient();
  const { error } = await supabase.from("arbeitszeit_modelle").upsert({
    mandant_id: sitzung.mandantId, benutzer_id: benutzerId, gueltig_ab: gueltigAb,
    stunden_mo: st("stunden_mo"), stunden_di: st("stunden_di"), stunden_mi: st("stunden_mi"), stunden_do: st("stunden_do"), stunden_fr: st("stunden_fr"), stunden_sa: st("stunden_sa"), stunden_so: st("stunden_so"),
    notiz: text(formular, "notiz").slice(0, 300) || null,
  }, { onConflict: "benutzer_id,gueltig_ab" });
  if (error) return { fehler: "Das Wochenmodell konnte nicht gespeichert werden." };
  revalidatePath("/arbeitszeit");
  return { erfolg: "Wochenmodell gespeichert." };
}

export async function wochenmodellLoeschen(formular: FormData): Promise<void> {
  await verwaltungErzwingen();
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  await supabase.from("arbeitszeit_modelle").delete().eq("id", id);
  revalidatePath("/arbeitszeit");
}

// ---------------------------------------------------------------------------
// Urlaub
// ---------------------------------------------------------------------------

export async function urlaubBeantragen(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const benutzerId = uuid(formular, "benutzer_id") ?? sitzung.benutzerId;
  if (benutzerId !== sitzung.benutzerId && !istVerwaltung(sitzung.rolle)) return { fehler: "Nur die Verwaltung trägt Urlaub für andere ein." };
  const von = text(formular, "von"); const bis = text(formular, "bis") || von;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(von) || !/^\d{4}-\d{2}-\d{2}$/.test(bis) || bis < von) return { fehler: "Bitte einen gültigen Zeitraum angeben." };
  const { data: b } = await supabase.from("benutzer").select("bundesland, name").eq("id", benutzerId).maybeSingle();
  const land = (b?.bundesland as Bundesland | null) ?? null;
  const tage = zahl(formular, "arbeitstage") ?? antragArbeitstage(von, bis, land);
  if (tage <= 0) return { fehler: "Der Zeitraum enthält keinen Arbeitstag." };
  const sofort = istVerwaltung(sitzung.rolle) && formular.get("direkt_genehmigen") === "1";
  const { data, error } = await supabase.from("urlaubsantraege").insert({
    mandant_id: sitzung.mandantId, benutzer_id: benutzerId, von, bis, arbeitstage: tage,
    bemerkung: text(formular, "bemerkung").slice(0, 500) || null,
  }).select("id").single();
  if (error || !data) return { fehler: "Der Antrag konnte nicht gespeichert werden." };
  if (sofort) await urlaubEntscheidenIntern(supabase, sitzung, data.id as string, "genehmigt", null);
  else {
    // Verwaltung sieht den Antrag als Aufgabe
    const { data: chefs } = await supabase.from("benutzer").select("id").in("rolle", ["inhaber", "administrator"]).eq("aktiv", true).limit(1);
    if (chefs?.[0]) await supabase.from("aufgaben").insert({ mandant_id: sitzung.mandantId, titel: `Urlaubsantrag ${b?.name as string}: ${von} bis ${bis} (${tage} Tage)`, beschreibung: text(formular, "bemerkung").slice(0, 500) || null, prioritaet: "mittel", zustaendig_id: chefs[0].id as string, erstellt_von: sitzung.benutzerId }).then(() => null, () => null);
  }
  revalidatePath("/urlaub");
  return { erfolg: sofort ? "Urlaub eingetragen und genehmigt." : "Antrag gestellt — die Verwaltung entscheidet.", id: data.id as string };
}

async function urlaubEntscheidenIntern(supabase: Awaited<ReturnType<typeof serverClient>>, sitzung: Sitzung, id: string, status: "genehmigt" | "abgelehnt", antwort: string | null): Promise<string | null> {
  const { data: a } = await supabase.from("urlaubsantraege").select("benutzer_id, von, bis, arbeitstage, termin_id").eq("id", id).maybeSingle();
  if (!a) return "Antrag nicht gefunden.";
  const { error } = await supabase.from("urlaubsantraege").update({ status, antwort }).eq("id", id);
  if (error) return error.message;
  const { data: b } = await supabase.from("benutzer").select("name").eq("id", a.benutzer_id as string).maybeSingle();
  if (status === "genehmigt") {
    // Im Kalender als ganztaegige Abwesenheit sichtbar; Arbeitszeit-Tage als Urlaub
    const { ausBerlin, tagPlus } = await import("@/lib/kalender/zeit");
    const { data: t } = await supabase.from("termine").insert({
      mandant_id: sitzung.mandantId, titel: `Urlaub: ${(b?.name as string) ?? ""}`, art: "sonstiges", ganztags: true,
      beginnt_am: ausBerlin(a.von as string, "00:00").toISOString(), endet_am: ausBerlin(tagPlus(a.bis as string, 1), "00:00").toISOString(),
      zustaendig_id: a.benutzer_id as string, erstellt_von: sitzung.benutzerId,
    }).select("id").single();
    if (t) await supabase.from("urlaubsantraege").update({ termin_id: t.id as string }).eq("id", id);
    const { arbeitstage } = await import("@/lib/verwaltung/feiertage");
    const { data: bl } = await supabase.from("benutzer").select("bundesland").eq("id", a.benutzer_id as string).maybeSingle();
    const tage = arbeitstage(a.von as string, a.bis as string, (bl?.bundesland as Bundesland | null) ?? null);
    if (tage.length > 0) await supabase.from("arbeitszeit_tage").upsert(tage.map((d) => ({ mandant_id: sitzung.mandantId, benutzer_id: a.benutzer_id as string, datum: d, art: "urlaub", erfasst_von: sitzung.benutzerId })), { onConflict: "benutzer_id,datum" });
  } else if (a.termin_id) {
    await supabase.from("termine").update({ abgesagt_am: new Date().toISOString() }).eq("id", a.termin_id as string);
  }
  return null;
}

export async function urlaubEntscheiden(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await verwaltungErzwingen();
  const id = uuid(formular, "id");
  const status = text(formular, "status");
  if (!id || (status !== "genehmigt" && status !== "abgelehnt")) return { fehler: "Ungültige Angaben." };
  const supabase = await serverClient();
  const fehler = await urlaubEntscheidenIntern(supabase, sitzung, id, status, text(formular, "antwort").slice(0, 500) || null);
  if (fehler) return { fehler };
  revalidatePath("/urlaub"); revalidatePath("/kalender"); revalidatePath("/arbeitszeit");
  return { erfolg: status === "genehmigt" ? "Urlaub genehmigt und im Kalender eingetragen." : "Antrag abgelehnt." };
}

export async function urlaubStornieren(formular: FormData): Promise<void> {
  const sitzung = await sitzungErzwingen();
  const id = uuid(formular, "id");
  if (!id) return;
  const supabase = await serverClient();
  const { data: a } = await supabase.from("urlaubsantraege").select("benutzer_id, von, bis, termin_id, status").eq("id", id).maybeSingle();
  if (!a) return;
  if (a.benutzer_id !== sitzung.benutzerId && !istVerwaltung(sitzung.rolle)) return;
  await supabase.from("urlaubsantraege").update({ status: "storniert" }).eq("id", id);
  if (a.termin_id) await supabase.from("termine").update({ abgesagt_am: new Date().toISOString() }).eq("id", a.termin_id as string);
  if (a.status === "genehmigt") await supabase.from("arbeitszeit_tage").delete().eq("benutzer_id", a.benutzer_id as string).eq("art", "urlaub").gte("datum", a.von as string).lte("datum", a.bis as string);
  revalidatePath("/urlaub"); revalidatePath("/kalender"); revalidatePath("/arbeitszeit");
}

/** Resturlaub-Hinweis an einen Mitarbeiter: Aufgabe plus Vermerk (Mail ueber die Warteschlange, wenn eingerichtet). */
export async function urlaubHinweisSenden(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await verwaltungErzwingen();
  const benutzerId = uuid(formular, "benutzer_id");
  const jahr = Math.trunc(zahl(formular, "jahr") ?? new Date().getFullYear());
  const resttage = zahl(formular, "resttage") ?? 0;
  if (!benutzerId) return { fehler: "Mitarbeiter fehlt." };
  const supabase = await serverClient();
  const { data: b } = await supabase.from("benutzer").select("name, email").eq("id", benutzerId).maybeSingle();
  if (!b) return { fehler: "Mitarbeiter nicht gefunden." };
  const frist = `${jahr + 1}-03-31`;
  const { data: aufgabe } = await supabase.from("aufgaben").insert({
    mandant_id: sitzung.mandantId, titel: `Resturlaub ${jahr}: noch ${resttage} Tage — bitte bis ${frist.split("-").reverse().join(".")} planen`,
    prioritaet: "mittel", zustaendig_id: benutzerId, erstellt_von: sitzung.benutzerId, faellig_am: frist,
  }).select("id").single();
  await supabase.from("urlaub_hinweise").insert({ mandant_id: sitzung.mandantId, benutzer_id: benutzerId, jahr, art: "resturlaub", resttage, frist, gesendet_von: sitzung.benutzerId, aufgabe_id: aufgabe?.id ?? null });
  if (process.env["MAIL_API_KEY"]) {
    await supabase.rpc("job_einstellen", { p_art: "mail", p_nutzlast: { vorlage: "frei", an: b.email, betreff: `Resturlaub ${jahr}`, text: `Guten Tag ${b.name as string},\n\nfür ${jahr} sind noch ${resttage} Urlaubstage offen. Übertragener Urlaub verfällt am ${frist.split("-").reverse().join(".")}. Bitte planen Sie den Rest rechtzeitig ein.\n\nViele Grüße\n${sitzung.name}` } });
  }
  revalidatePath("/urlaub");
  return { erfolg: `Hinweis an ${b.name as string} gesendet.` };
}

// ---------------------------------------------------------------------------
// Kennzahlen, Finanzierungsannahmen
// ---------------------------------------------------------------------------

export async function kennzahlenSpeichern(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await verwaltungErzwingen();
  const jahr = Math.trunc(zahl(formular, "jahr") ?? 0);
  if (jahr < 2000 || jahr > 2100) return { fehler: "Bitte ein Jahr angeben." };
  const supabase = await serverClient();
  if (formular.get("loeschen") === "1") {
    await supabase.from("firma_kennzahlen").delete().eq("mandant_id", sitzung.mandantId).eq("jahr", jahr);
    revalidatePath("/einstellungen/kennzahlen");
    return { erfolg: "Jahr entfernt." };
  }
  const fakten = text(formular, "fakten").split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 12);
  const { error } = await supabase.from("firma_kennzahlen").upsert({
    mandant_id: sitzung.mandantId, jahr,
    objekte_vermittelt: zahl(formular, "objekte_vermittelt"), erzielungsquote: zahl(formular, "erzielungsquote"),
    vermarktungsdauer_schnitt: zahl(formular, "vermarktungsdauer_schnitt"), google_anzahl: zahl(formular, "google_anzahl"), google_schnitt: zahl(formular, "google_schnitt"),
    fakten, aktiv: formular.get("aktiv") !== "0",
  }, { onConflict: "mandant_id,jahr" });
  if (error) return { fehler: error.message };
  revalidatePath("/einstellungen/kennzahlen");
  return { erfolg: `Kennzahlen ${jahr} gespeichert.` };
}

export async function finanzierungSpeichern(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await verwaltungErzwingen();
  const supabase = await serverClient();
  const { error } = await supabase.from("finanzierungs_annahmen").upsert({
    mandant_id: sitzung.mandantId,
    zinssatz: zahl(formular, "zinssatz") ?? 3.8, tilgung: zahl(formular, "tilgung") ?? 2, eigenkapital_prozent: zahl(formular, "eigenkapital_prozent") ?? 20,
    notar_prozent: zahl(formular, "notar_prozent") ?? 2, grunderwerbsteuer_prozent: zahl(formular, "grunderwerbsteuer_prozent") ?? 6,
    hinweis: text(formular, "hinweis").slice(0, 1000) || null,
  }, { onConflict: "mandant_id" });
  if (error) return { fehler: error.message };
  revalidatePath("/einstellungen/kennzahlen");
  return { erfolg: "Finanzierungsannahmen gespeichert." };
}

// ---------------------------------------------------------------------------
// Bewerber (Masterprompt: entfaellt — auf Weisung 1:1, streichbar)
// ---------------------------------------------------------------------------

export async function bewerberEinladen(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await verwaltungErzwingen();
  const vorname = text(formular, "vorname").slice(0, 100);
  const nachname = text(formular, "nachname").slice(0, 100);
  const email = text(formular, "email").toLowerCase();
  if (!vorname || !nachname || !z.email().safeParse(email).success) return { fehler: "Bitte Vorname, Nachname und eine gültige E-Mail angeben." };
  const { token, hash } = tokenErzeugen();
  const supabase = await serverClient();
  const { data, error } = await supabase.from("bewerbungen").insert({ mandant_id: sitzung.mandantId, vorname, nachname, email, position: text(formular, "position").slice(0, 120) || null, token_hash: hash, erstellt_von: sitzung.benutzerId }).select("id").single();
  if (error || !data) return { fehler: "Die Einladung konnte nicht angelegt werden." };
  const link = `${(process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/+$/, "")}/bewerbung/${token}`;
  let versendet = false;
  if (process.env["MAIL_API_KEY"]) {
    const { error: e } = await supabase.rpc("job_einstellen", { p_art: "mail", p_nutzlast: { vorlage: "frei", an: email, betreff: `Ihr Einstellungstest bei ${sitzung.mandantName}`, text: `Guten Tag ${vorname} ${nachname},\n\nschön, dass Sie sich bei uns bewerben. Der kurze Online-Test hilft uns beiden herauszufinden, ob wir zueinander passen. Er dauert etwa 20 Minuten:\n\n${link}\n\nDer Link ist 30 Tage gültig.\n\nFreundliche Grüße\n${sitzung.name}` } });
    versendet = !e;
  }
  revalidatePath("/einstellungen/bewerber");
  return { erfolg: versendet ? `Einladung an ${email} unterwegs.` : "Einladung angelegt — bitte den Link selbst weitergeben.", id: data.id as string, link };
}

export async function bewerberBewerten(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  await verwaltungErzwingen();
  const id = uuid(formular, "id");
  if (!id) return { fehler: "Bewerber fehlt." };
  const supabase = await serverClient();
  if (formular.get("loeschen") === "1") {
    await supabase.from("bewerbungen").delete().eq("id", id);
    revalidatePath("/einstellungen/bewerber");
    return { erfolg: "Bewerber gelöscht." };
  }
  const note = zahl(formular, "chef_note");
  const { error } = await supabase.from("bewerbungen").update({ chef_note: note != null && note >= 1 && note <= 6 ? note : null, chef_kommentar: text(formular, "chef_kommentar").slice(0, 2000) || null }).eq("id", id);
  if (error) return { fehler: "Bewertung konnte nicht gespeichert werden." };
  revalidatePath("/einstellungen/bewerber");
  return { erfolg: "Bewertung gespeichert." };
}

// ---------------------------------------------------------------------------
// Selbstkuendigung des Mandanten
// ---------------------------------------------------------------------------

export async function mandantKuendigen(_vorher: VerwaltungErgebnis, formular: FormData): Promise<VerwaltungErgebnis> {
  const sitzung = await sitzungErzwingen();
  if (sitzung.rolle !== "inhaber") return { fehler: "Nur der Unternehmensinhaber kann kündigen." };
  if (text(formular, "bestaetigung") !== "KÜNDIGEN") return { fehler: "Bitte KÜNDIGEN in das Feld schreiben, um zu bestätigen." };
  const supabase = await serverClient();
  const { data, error } = await supabase.rpc("mandant_kuendigen", { p_grund: text(formular, "grund").slice(0, 1000) || null });
  if (error) return { fehler: error.message };
  // Laufendes Stripe-Abo zum Laufzeitende beenden
  const { data: abo } = await supabase.from("abonnements").select("stripe_abo_id, status").eq("mandant_id", sitzung.mandantId).maybeSingle();
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (abo?.stripe_abo_id && stripeKey && abo.status === "aktiv") {
    await fetch(`https://api.stripe.com/v1/subscriptions/${abo.stripe_abo_id as string}`, {
      method: "POST", headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "cancel_at_period_end=true",
    }).catch(() => null);
  }
  revalidatePath("/credits");
  revalidatePath("/", "layout");
  const am = (data as { loeschung_am?: string } | null)?.loeschung_am;
  return { erfolg: `Kündigung vorgemerkt. Alle Daten werden am ${am ? new Date(am).toLocaleDateString("de-DE") : "Stichtag"} gelöscht — bis dahin können Sie exportieren oder die Kündigung zurücknehmen.` };
}

export async function kuendigungZuruecknehmen(): Promise<void> {
  const sitzung = await sitzungErzwingen();
  if (sitzung.rolle !== "inhaber") return;
  const supabase = await serverClient();
  await supabase.rpc("mandant_kuendigung_zuruecknehmen");
  const { data: abo } = await supabase.from("abonnements").select("stripe_abo_id, status").eq("mandant_id", sitzung.mandantId).maybeSingle();
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (abo?.stripe_abo_id && stripeKey) {
    await fetch(`https://api.stripe.com/v1/subscriptions/${abo.stripe_abo_id as string}`, {
      method: "POST", headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "cancel_at_period_end=false",
    }).catch(() => null);
  }
  revalidatePath("/credits");
  revalidatePath("/", "layout");
  redirect("/credits");
}

// ---------------------------------------------------------------------------
// Globale Suche
// ---------------------------------------------------------------------------

export interface Treffer { art: string; id: string; titel: string; untertitel: string; pfad: string }

export async function globalSuchen(text_: string): Promise<Treffer[]> {
  await sitzungErzwingen();
  const q = String(text_ ?? "").trim().slice(0, 80);
  if (q.length < 2) return [];
  const supabase = await serverClient();
  const { data } = await supabase.rpc("global_suche", { p_text: q, p_limit: 6 });
  return Array.isArray(data) ? (data as Treffer[]) : [];
}
