import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BILD_BUCKET, bildPfad } from "@/lib/bilder";

import type { KanonischerKontakt, KanonischesBild, KanonischesObjekt } from "./modell";
import type { KontaktZeile, Mapping, MappingTyp, ObjektZeile, Speicher } from "./speicher";

/** Groesste akzeptierte Bilddatei aus einem Fremdsystem. */
const BILD_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Speicher eines Sync-Laufs auf Supabase — mit der Dienstrolle.
 *
 * Die Dienstrolle umgeht die Row-Level-Security; deshalb setzt JEDE Abfrage
 * hier ausdruecklich `mandant_id`. Ein Lauf kann so nie in einen fremden
 * Mandanten schreiben, auch nicht bei einem Fehler in der Anwendung.
 */
export class SpeicherSupabase implements Speicher {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly mandantId: string,
    private readonly integrationId: string,
    private readonly benutzerId: string | null,
    private readonly fetchFn: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async mappingFinden(typ: MappingTyp, fremdOderLokalId: string): Promise<Mapping | null> {
    const { data } = await this.supabase
      .from("integration_mappings")
      .select("lokal_id, fremd_id, letzte_aenderung_lokal, letzte_aenderung_fremd")
      .eq("integration_id", this.integrationId)
      .eq("mandant_id", this.mandantId)
      .eq("typ", typ)
      .or(`fremd_id.eq.${fremdOderLokalId.replace(/[,()]/g, "")},lokal_id.eq.${/^[0-9a-f-]{36}$/.test(fremdOderLokalId) ? fremdOderLokalId : "00000000-0000-0000-0000-000000000000"}`)
      .limit(1)
      .maybeSingle();
    return (data as Mapping | null) ?? null;
  }

  async mappingSchreiben(typ: MappingTyp, mapping: Mapping): Promise<void> {
    const { error } = await this.supabase.from("integration_mappings").upsert(
      {
        integration_id: this.integrationId,
        mandant_id: this.mandantId,
        typ,
        lokal_id: mapping.lokal_id,
        fremd_id: mapping.fremd_id,
        letzte_aenderung_lokal: mapping.letzte_aenderung_lokal,
        letzte_aenderung_fremd: mapping.letzte_aenderung_fremd,
      },
      { onConflict: "integration_id,typ,fremd_id" },
    );
    if (error) throw new Error(`Zuordnung konnte nicht gespeichert werden: ${error.message}`);
  }

  async objektAnlegen(zeile: ObjektZeile): Promise<string> {
    const { data, error } = await this.supabase
      .from("objekte")
      .insert({ ...zeile, mandant_id: this.mandantId, erstellt_von: this.benutzerId, zustaendig_id: this.benutzerId })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Objekt konnte nicht angelegt werden: ${error?.message ?? "unbekannt"}`);
    return data.id as string;
  }

  async objektAktualisieren(lokalId: string, zeile: ObjektZeile): Promise<void> {
    const { error } = await this.supabase
      .from("objekte")
      .update(zeile)
      .eq("id", lokalId)
      .eq("mandant_id", this.mandantId);
    if (error) throw new Error(`Objekt konnte nicht aktualisiert werden: ${error.message}`);
  }

  async objektGeaendertAm(lokalId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from("objekte")
      .select("geaendert_am")
      .eq("id", lokalId)
      .eq("mandant_id", this.mandantId)
      .maybeSingle();
    return (data?.geaendert_am as string | undefined) ?? null;
  }

  async objekteZumSenden(seit: string | null) {
    let abfrage = this.supabase
      .from("objekte")
      .select("*")
      .eq("mandant_id", this.mandantId)
      .is("geloescht_am", null)
      .order("geaendert_am", { ascending: true })
      .limit(500);
    if (seit) abfrage = abfrage.gt("geaendert_am", seit);
    const { data, error } = await abfrage;
    if (error) throw new Error(`Objekte konnten nicht gelesen werden: ${error.message}`);
    return (data ?? []).map((z) => ({
      lokal_id: z.id as string,
      geaendert_am: z.geaendert_am as string,
      objekt: { ...(z as unknown as ObjektZeile), fremd_id: z.id as string, geaendert_am_fremd: null, bilder: [] } as KanonischesObjekt,
    }));
  }

  async kontaktAnlegen(zeile: KontaktZeile): Promise<string> {
    const { data, error } = await this.supabase
      .from("kontakte")
      .insert({ ...zeile, mandant_id: this.mandantId, erstellt_von: this.benutzerId, betreuer_id: this.benutzerId, quelle: "import" })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Kontakt konnte nicht angelegt werden: ${error?.message ?? "unbekannt"}`);
    return data.id as string;
  }

  async kontaktAktualisieren(lokalId: string, zeile: KontaktZeile): Promise<void> {
    const { error } = await this.supabase
      .from("kontakte")
      .update(zeile)
      .eq("id", lokalId)
      .eq("mandant_id", this.mandantId);
    if (error) throw new Error(`Kontakt konnte nicht aktualisiert werden: ${error.message}`);
  }

  async kontaktGeaendertAm(lokalId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from("kontakte")
      .select("geaendert_am")
      .eq("id", lokalId)
      .eq("mandant_id", this.mandantId)
      .maybeSingle();
    return (data?.geaendert_am as string | undefined) ?? null;
  }

  async kontakteZumSenden(seit: string | null) {
    let abfrage = this.supabase
      .from("kontakte")
      .select("*")
      .eq("mandant_id", this.mandantId)
      .is("geloescht_am", null)
      .is("anonymisiert_am", null)
      .order("geaendert_am", { ascending: true })
      .limit(500);
    if (seit) abfrage = abfrage.gt("geaendert_am", seit);
    const { data, error } = await abfrage;
    if (error) throw new Error(`Kontakte konnten nicht gelesen werden: ${error.message}`);
    return (data ?? []).map((z) => ({
      lokal_id: z.id as string,
      geaendert_am: z.geaendert_am as string,
      kontakt: { ...(z as unknown as KontaktZeile), fremd_id: z.id as string, geaendert_am_fremd: null } as KanonischerKontakt,
    }));
  }

  async bilderAnzahl(objektLokalId: string): Promise<number> {
    const { count } = await this.supabase
      .from("objekt_bilder")
      .select("id", { count: "exact", head: true })
      .eq("objekt_id", objektLokalId)
      .eq("mandant_id", this.mandantId);
    return count ?? 0;
  }

  /**
   * Laedt das Bild (Adresse oder eingebettete Daten), legt es im Bucket ab
   * und traegt es ein. Das erste Bild oder das Titelbild des Fremdsystems
   * wird Titelbild — nur, wenn das Objekt noch keines hat.
   */
  async bildSpeichern(objektLokalId: string, bild: KanonischesBild, index: number): Promise<void> {
    let daten: Uint8Array | null = bild.daten;
    let mime = bild.mime;

    if (!daten && bild.url) {
      const antwort = await this.fetchFn(bild.url, { redirect: "follow" });
      if (!antwort.ok) throw new Error(`Bild nicht ladbar (HTTP ${antwort.status})`);
      const laenge = Number(antwort.headers.get("content-length") ?? 0);
      if (laenge > BILD_MAX_BYTES) throw new Error("Bild ist zu gross");
      daten = new Uint8Array(await antwort.arrayBuffer());
      mime = mime ?? antwort.headers.get("content-type")?.split(";")[0] ?? null;
    }
    if (!daten || daten.byteLength === 0) throw new Error("Bild ohne Daten");
    if (daten.byteLength > BILD_MAX_BYTES) throw new Error("Bild ist zu gross");

    mime = mime && ["image/jpeg", "image/png", "image/webp"].includes(mime) ? mime : mimeErraten(daten);
    if (!mime) throw new Error("Dateiformat nicht unterstuetzt");

    const dateiname = bild.dateiname ?? `bild.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
    const pfad = bildPfad(this.mandantId, objektLokalId, dateiname);

    const { error: uploadFehler } = await this.supabase.storage
      .from(BILD_BUCKET)
      .upload(pfad, daten, { contentType: mime, upsert: false });
    if (uploadFehler) throw new Error(`Bild konnte nicht abgelegt werden: ${uploadFehler.message}`);

    const vorhanden = await this.bilderAnzahl(objektLokalId);
    const gruppe = (bild.gruppe ?? "").toLowerCase();
    const { error } = await this.supabase.from("objekt_bilder").insert({
      mandant_id: this.mandantId,
      objekt_id: objektLokalId,
      pfad,
      art: gruppe.includes("grundriss") ? "grundriss" : gruppe.includes("lageplan") || gruppe.includes("karte") ? "lageplan" : "foto",
      titel: bild.titel,
      mime,
      bytes: daten.byteLength,
      reihenfolge: vorhanden + index,
      ist_titelbild: vorhanden === 0 && (index === 0 || gruppe === "titelbild"),
      erstellt_von: this.benutzerId,
    });
    if (error) {
      await this.supabase.storage.from(BILD_BUCKET).remove([pfad]);
      throw new Error(`Bild konnte nicht eingetragen werden: ${error.message}`);
    }
  }
}

/** Erkennt JPEG, PNG und WebP an den ersten Bytes — Fremdsysteme liefern oft keinen MIME-Typ. */
export function mimeErraten(daten: Uint8Array): string | null {
  if (daten.length < 12) return null;
  if (daten[0] === 0xff && daten[1] === 0xd8 && daten[2] === 0xff) return "image/jpeg";
  if (daten[0] === 0x89 && daten[1] === 0x50 && daten[2] === 0x4e && daten[3] === 0x47) return "image/png";
  if (daten[0] === 0x52 && daten[1] === 0x49 && daten[2] === 0x46 && daten[3] === 0x46 && daten[8] === 0x57 && daten[9] === 0x45) return "image/webp";
  return null;
}
