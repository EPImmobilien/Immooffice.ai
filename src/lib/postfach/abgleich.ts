import type { SupabaseClient } from "@supabase/supabase-js";

import { vorschau } from "./text";
import { adressenJson, type EingangsNachricht } from "./typen";
import { zuordnen, type KontaktIndexEintrag, type ObjektIndexEintrag, type Zuordnung } from "./zuordnung";

/**
 * Abgerufene Nachrichten in die Datenbank uebernehmen — mit automatischer
 * Zuordnung (P3) und Eintrag im Objekt- bzw. Kontaktverlauf („Objekt als
 * Drehkreuz“). Laeuft mit der Dienstrolle im Arbeiter; Dubletten
 * (postfach_id, extern_id) werden still uebersprungen.
 */

export interface PostfachKontext {
  id: string;
  mandant_id: string;
}

export interface UebernahmeErgebnis {
  neu: number;
  uebersprungen: number;
  zugeordnet: number;
}

/** Die Datenbankzeile zu einer Nachricht — als reine Funktion, damit sie pruefbar ist. */
export function nachrichtZeile(postfach: PostfachKontext, n: EingangsNachricht, z: Zuordnung): Record<string, unknown> {
  return {
    mandant_id: postfach.mandant_id,
    postfach_id: postfach.id,
    ordner: "eingang",
    extern_id: n.externId,
    message_id: n.messageId,
    in_reply_to: n.inReplyTo,
    thread_id: n.threadId,
    von_adresse: n.von?.adresse ?? null,
    von_name: n.von?.name ?? null,
    an: adressenJson(n.an),
    cc: adressenJson(n.cc),
    betreff: n.betreff,
    text: n.text,
    vorschau: vorschau(n.text),
    gesendet_am: n.gesendetAm,
    gelesen: n.gelesen,
    hat_anhaenge: n.anhaenge.length > 0,
    kontakt_id: z.kontaktId,
    objekt_id: z.objektId,
    zuordnung_art: z.zuordnungArt,
    objekt_vorschlag_id: z.vorschlag?.objektId ?? null,
    objekt_vorschlag_konfidenz: z.vorschlag?.konfidenz ?? null,
    objekt_vorschlag_grund: z.vorschlag?.grund ?? null,
  };
}

export function verlaufsEintrag(postfach: PostfachKontext, n: EingangsNachricht, z: Zuordnung, nachrichtId: string): Record<string, unknown> {
  return {
    mandant_id: postfach.mandant_id,
    objekt_id: z.objektId,
    kontakt_id: z.kontaktId,
    typ: "email",
    beschreibung: `E-Mail von ${n.von?.adresse ?? "unbekannt"}: ${n.betreff ?? "(ohne Betreff)"}`.slice(0, 2000),
    metadaten: {
      nachricht_id: nachrichtId,
      postfach_id: postfach.id,
      zuordnung: "automatisch",
      ...(z.vorschlag ? { konfidenz: z.vorschlag.konfidenz, grund: z.vorschlag.grund } : {}),
    },
    benutzer_id: null,
  };
}

export async function nachrichtenUebernehmen(
  supabase: SupabaseClient,
  postfach: PostfachKontext,
  nachrichten: EingangsNachricht[],
): Promise<UebernahmeErgebnis> {
  const ergebnis: UebernahmeErgebnis = { neu: 0, uebersprungen: 0, zugeordnet: 0 };
  if (nachrichten.length === 0) return ergebnis;

  const [objekteAntwort, kontakteAntwort] = await Promise.all([
    supabase
      .from("objekte")
      .select("id, objektnummer, strasse, hausnummer, plz, ort, status")
      .eq("mandant_id", postfach.mandant_id)
      .is("geloescht_am", null),
    supabase
      .from("kontakte")
      .select("id, email")
      .eq("mandant_id", postfach.mandant_id)
      .is("geloescht_am", null)
      .not("email", "is", null),
  ]);
  const objekte = (objekteAntwort.data ?? []) as ObjektIndexEintrag[];
  const kontakte = (kontakteAntwort.data ?? []) as KontaktIndexEintrag[];

  for (const n of nachrichten) {
    const z = zuordnen(n.von?.adresse ?? null, n.betreff, n.text, objekte, kontakte);
    const { data, error } = await supabase
      .from("nachrichten")
      .upsert(nachrichtZeile(postfach, n, z), { onConflict: "postfach_id,extern_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Nachricht konnte nicht gespeichert werden: ${error.message}`);
    const eingefuegt = data?.[0];
    if (!eingefuegt) {
      ergebnis.uebersprungen += 1;
      continue;
    }
    ergebnis.neu += 1;

    if (n.anhaenge.length > 0) {
      const { error: anhangFehler } = await supabase.from("nachricht_anhaenge").insert(
        n.anhaenge.map((a) => ({
          mandant_id: postfach.mandant_id,
          nachricht_id: eingefuegt.id,
          extern_id: a.externId,
          dateiname: a.dateiname.slice(0, 300),
          mime: a.mime,
          bytes: a.bytes,
        })),
      );
      if (anhangFehler) throw new Error(`Anhaenge konnten nicht gespeichert werden: ${anhangFehler.message}`);
    }

    if (z.objektId || z.kontaktId) {
      ergebnis.zugeordnet += 1;
      const { error: verlaufFehler } = await supabase.from("aktivitaeten").insert(verlaufsEintrag(postfach, n, z, eingefuegt.id as string));
      if (verlaufFehler) throw new Error(`Verlaufseintrag konnte nicht gespeichert werden: ${verlaufFehler.message}`);
    }
  }
  return ergebnis;
}
