"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { objektDubletten } from "@/integrationen/kern/abgleich";
import { kontextErzeugen, type Connector } from "@/integrationen/kern/connector";
import { connectorFinden } from "@/integrationen/kern/registry";
import { objektEntschluesseln, objektVerschluesseln } from "@/integrationen/kern/zugangsdaten";
import { paketOeffnen } from "@/integrationen/openimmo/connector";
import { openImmoLesen } from "@/integrationen/openimmo/lesen";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen, type Sitzung } from "@/lib/auth/sitzung";
import type { SyncNutzlast } from "@/lib/jobs/typen";
import { jobsAusfuehren } from "@/lib/jobs/worker";
import { dienstClient } from "@/lib/supabase/dienst";
import { serverClient } from "@/lib/supabase/server";

/**
 * Integrationen (docs/AUTONOMIE.md 5.3).
 *
 * Zugangsdaten werden hier verschluesselt und danach nie wieder an den
 * Browser gegeben. Zum Pruefen und Abgleichen liest sie ausschliesslich der
 * Server — ueber die Dienstrolle, weil die Spalte fuer angemeldete Benutzer
 * gesperrt ist — und immer mit ausdruecklicher Pruefung des Mandanten.
 */

export interface IntegrationsErgebnis {
  fehler?: string;
  hinweis?: string;
  pruefung?: { ok: boolean; meldung: string };
}

export interface ImportVorschau {
  pfad: string;
  anbieter: string | null;
  anzahl: number;
  mitBildern: number;
  zurueckgezogen: number;
  dubletten: Array<{ fremd_id: string; bezeichnung: string; bestand: string }>;
  hinweise: string[];
}

const RICHTUNG = ["holen", "senden", "beide"] as const;
const INTERVALL = ["manuell", "15min", "stuendlich", "taeglich"] as const;

const stammSchema = z.object({
  bezeichnung: z.string().trim().min(1, "Bitte eine Bezeichnung angeben.").max(120),
  richtung: z.enum(RICHTUNG),
  intervall: z.enum(INTERVALL),
});

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}

/** Zugangsdaten einer gespeicherten Integration — nur serverseitig, nur eigener Mandant. */
async function zugangsdatenLaden(sitzung: Sitzung, integrationId: string) {
  const dienst = dienstClient();
  const { data } = await dienst
    .from("integrationen")
    .select("id, mandant_id, anbieter, konfig, richtung, zugangsdaten_verschluesselt")
    .eq("id", integrationId)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();
  if (!data) return null;

  const connector = connectorFinden(data.anbieter as string) as unknown as Connector<unknown> | null;
  if (!connector) return null;

  const roh = data.zugangsdaten_verschluesselt
    ? objektEntschluesseln(data.zugangsdaten_verschluesselt as string, sitzung.mandantId)
    : {};
  const geprueft = connector.zugangsdatenSchema.safeParse(roh);
  return {
    connector,
    konfig: (data.konfig as Record<string, unknown> | null) ?? {},
    richtung: data.richtung as (typeof RICHTUNG)[number],
    zugangsdaten: geprueft.success ? geprueft.data : null,
  };
}

/** Liest die Anmeldefelder eines Connectors aus dem Formular (`zd_<schluessel>`). */
function zugangsdatenAusFormular(connector: Connector<unknown>, formular: FormData): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const feld of connector.anmeldefelder) werte[feld.schluessel] = text(formular, `zd_${feld.schluessel}`);
  return werte;
}

export async function integrationAnlegen(
  _vorher: IntegrationsErgebnis,
  formular: FormData,
): Promise<IntegrationsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const connector = connectorFinden(text(formular, "anbieter")) as unknown as Connector<unknown> | null;
  if (!connector) return { fehler: "Unbekannter Anbieter." };
  if (connector.faehigkeiten.length === 0) {
    return { fehler: `${connector.name} ist für Phase 4 vorgesehen und noch nicht verfügbar.` };
  }

  const stamm = stammSchema.safeParse({
    bezeichnung: text(formular, "bezeichnung") || connector.name,
    richtung: text(formular, "richtung") || "holen",
    intervall: text(formular, "intervall") || "manuell",
  });
  if (!stamm.success) return { fehler: stamm.error.issues[0]?.message ?? "Bitte die Angaben prüfen." };

  const zugangsdaten = connector.zugangsdatenSchema.safeParse(zugangsdatenAusFormular(connector, formular));
  if (!zugangsdaten.success) {
    return { fehler: zugangsdaten.error.issues[0]?.message ?? "Die Zugangsdaten sind unvollständig." };
  }

  // Erst pruefen, dann speichern: Eine Integration mit falschen Zugangsdaten
  // waere nur eine Fehlerquelle mehr.
  if (connector.anmeldung !== "keine") {
    const pruefung = await connector.verbindungPruefen(
      kontextErzeugen<unknown>({ mandantId: sitzung.mandantId, integrationId: "neu", zugangsdaten: zugangsdaten.data }),
    );
    if (!pruefung.ok) return { fehler: `Verbindung nicht möglich: ${pruefung.meldung}`, pruefung };
  }

  const supabase = await serverClient();
  const { error } = await supabase.from("integrationen").insert({
    mandant_id: sitzung.mandantId,
    anbieter: connector.id,
    bezeichnung: stamm.data.bezeichnung,
    richtung: stamm.data.richtung,
    intervall: stamm.data.intervall,
    zugangsdaten_verschluesselt:
      connector.anmeldung === "keine"
        ? null
        : objektVerschluesseln(zugangsdaten.data as Record<string, unknown>, sitzung.mandantId),
    status: connector.anmeldung === "keine" ? "aktiv" : "aktiv",
    erstellt_von: sitzung.benutzerId,
  });
  if (error) return { fehler: "Die Integration konnte nicht gespeichert werden." };

  revalidatePath("/einstellungen/integrationen");
  redirect("/einstellungen/integrationen");
}

export async function verbindungPruefen(formular: FormData): Promise<IntegrationsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const id = text(formular, "integration_id");
  const geladen = await zugangsdatenLaden(sitzung, id);
  if (!geladen) return { fehler: "Die Integration wurde nicht gefunden." };
  if (geladen.zugangsdaten === null) {
    return { fehler: "Die gespeicherten Zugangsdaten sind unvollständig. Bitte die Integration neu anlegen." };
  }

  const pruefung = await geladen.connector.verbindungPruefen(
    kontextErzeugen<unknown>({ mandantId: sitzung.mandantId, integrationId: id, zugangsdaten: geladen.zugangsdaten, konfig: geladen.konfig }),
  );

  const supabase = await serverClient();
  await supabase
    .from("integrationen")
    .update({ status: pruefung.ok ? "aktiv" : "fehler", fehler_text: pruefung.ok ? null : pruefung.meldung })
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);

  revalidatePath("/einstellungen/integrationen");
  return { pruefung, ...(pruefung.ok ? { hinweis: pruefung.meldung } : { fehler: pruefung.meldung }) };
}

export async function integrationEinstellen(formular: FormData): Promise<IntegrationsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const id = text(formular, "integration_id");
  const stamm = stammSchema.safeParse({
    bezeichnung: text(formular, "bezeichnung"),
    richtung: text(formular, "richtung"),
    intervall: text(formular, "intervall"),
  });
  if (!stamm.success) return { fehler: stamm.error.issues[0]?.message ?? "Bitte die Angaben prüfen." };

  const supabase = await serverClient();
  const { error } = await supabase
    .from("integrationen")
    .update(stamm.data)
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Die Einstellungen konnten nicht gespeichert werden." };

  revalidatePath("/einstellungen/integrationen");
  return { hinweis: "Die Einstellungen wurden gespeichert." };
}

export async function integrationLoeschen(formular: FormData): Promise<IntegrationsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "loeschen", sitzung.uebersteuerung);

  const id = text(formular, "integration_id");
  const supabase = await serverClient();
  // Zuordnungen und Laeufe haengen per Kaskade daran. Die uebernommenen
  // Objekte und Kontakte bleiben — sie gehoeren dem Mandanten, nicht der
  // Integration.
  const { error } = await supabase.from("integrationen").delete().eq("id", id).eq("mandant_id", sitzung.mandantId);
  if (error) return { fehler: "Die Integration konnte nicht entfernt werden." };

  revalidatePath("/einstellungen/integrationen");
  return { hinweis: "Die Integration ist entfernt. Übernommene Objekte und Kontakte bleiben erhalten." };
}

/**
 * Stellt einen Abgleich ein und versucht, ihn sofort auszufuehren.
 *
 * Was im Zeitbudget nicht fertig wird, bleibt in der Warteschlange und wird
 * vom naechsten Aufruf des Arbeiters erledigt — der Nutzer sieht den Lauf
 * mit Status „läuft".
 */
export async function syncStarten(formular: FormData): Promise<IntegrationsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);
  rechtErzwingen(sitzung.rolle, "objekte", "anlegen", sitzung.uebersteuerung);

  const id = text(formular, "integration_id");
  const supabase = await serverClient();
  const { data: integration } = await supabase
    .from("integrationen")
    .select("id, anbieter, richtung, status")
    .eq("id", id)
    .eq("mandant_id", sitzung.mandantId)
    .maybeSingle();
  if (!integration) return { fehler: "Die Integration wurde nicht gefunden." };
  if (integration.anbieter === "openimmo") {
    return { fehler: "OpenImmo wird über eine Datei abgeglichen — bitte oben eine Datei hochladen." };
  }

  const richtung = (RICHTUNG as readonly string[]).includes(text(formular, "richtung"))
    ? (text(formular, "richtung") as SyncNutzlast["richtung"])
    : (integration.richtung as SyncNutzlast["richtung"]);

  return auftragEinstellenUndAnstossen(sitzung, { integration_id: id, richtung, ausloeser: "manuell" });
}

async function auftragEinstellenUndAnstossen(sitzung: Sitzung, nutzlast: SyncNutzlast): Promise<IntegrationsErgebnis> {
  const supabase = await serverClient();

  // Kein zweiter Auftrag, solange einer offen ist.
  const { data: offen } = await supabase
    .from("jobs")
    .select("id")
    .eq("art", "sync")
    .in("status", ["offen", "laeuft"])
    .contains("nutzlast", { integration_id: nutzlast.integration_id })
    .limit(1);
  if (offen && offen.length > 0) {
    return { hinweis: "Für diese Integration läuft bereits ein Abgleich. Bitte kurz warten." };
  }

  const { error } = await supabase.rpc("job_einstellen", { p_art: "sync", p_nutzlast: nutzlast, p_prioritaet: 5 });
  if (error) return { fehler: "Der Abgleich konnte nicht eingeplant werden." };

  let hinweis = "Der Abgleich ist eingeplant und wird in Kürze ausgeführt.";
  try {
    // Direkt versuchen; das Zeitbudget haelt die Server Action unter der
    // Grenze der Plattform. Ohne Dienstschluessel bleibt es beim Zeitplan.
    const ergebnis = await jobsAusfuehren({ zeitbudgetMs: 8_000, maxAnzahl: 1, arbeiter: `sofort-${sitzung.benutzerId.slice(0, 8)}` });
    if (ergebnis.erledigt > 0) hinweis = "Der Abgleich ist abgeschlossen — Ergebnis siehe Läufe.";
    else if (ergebnis.gescheitert > 0) hinweis = "Der Abgleich ist gescheitert — Einzelheiten siehe Läufe. Er wird automatisch erneut versucht.";
  } catch {
    // Ohne SUPABASE_SERVICE_ROLE_KEY laeuft der Arbeiter nur ueber den Zeitplan.
  }

  revalidatePath("/einstellungen/integrationen");
  revalidatePath("/objekte");
  revalidatePath("/kontakte");
  return { hinweis };
}

// --- OpenImmo-Datei ----------------------------------------------------------

/** Findet oder erzeugt die OpenImmo-Integration des Mandanten. */
async function openImmoIntegration(sitzung: Sitzung): Promise<string | null> {
  const supabase = await serverClient();
  const { data: vorhanden } = await supabase
    .from("integrationen")
    .select("id")
    .eq("mandant_id", sitzung.mandantId)
    .eq("anbieter", "openimmo")
    .limit(1)
    .maybeSingle();
  if (vorhanden) return vorhanden.id as string;

  const { data, error } = await supabase
    .from("integrationen")
    .insert({
      mandant_id: sitzung.mandantId,
      anbieter: "openimmo",
      bezeichnung: "OpenImmo-Dateien",
      richtung: "holen",
      intervall: "manuell",
      status: "aktiv",
      erstellt_von: sitzung.benutzerId,
    })
    .select("id")
    .single();
  return error || !data ? null : (data.id as string);
}

/**
 * Liest eine hochgeladene OpenImmo-Datei und zeigt, was sie enthaelt —
 * bevor irgendetwas uebernommen wird (5.3: Erstimport mit Vorschau und
 * Dublettenpruefung).
 */
export async function openImmoVorschau(formular: FormData): Promise<IntegrationsErgebnis & { vorschau?: ImportVorschau }> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);

  const pfad = text(formular, "pfad");
  if (!pfad.startsWith(`${sitzung.mandantId}/`) || pfad.includes("..")) {
    return { fehler: "Die Datei gehört nicht zu diesem Unternehmen." };
  }

  const supabase = await serverClient();
  const { data: datei, error } = await supabase.storage.from("importe").download(pfad);
  if (error || !datei) return { fehler: "Die Datei konnte nicht gelesen werden." };

  let gelesen;
  try {
    const { xml, dateien } = paketOeffnen({ name: pfad, inhalt: new Uint8Array(await datei.arrayBuffer()) });
    gelesen = openImmoLesen(xml, dateien);
  } catch (e) {
    return { fehler: e instanceof Error ? e.message : "Die Datei ist keine OpenImmo-Datei." };
  }

  const { data: bestand } = await supabase
    .from("objekte")
    .select("id, bezeichnung, plz, strasse, hausnummer, ort")
    .eq("mandant_id", sitzung.mandantId)
    .is("geloescht_am", null)
    .limit(5000);

  const objekte = gelesen.objekte.filter((o) => o.aktion !== "DELETE");
  const dubletten = objektDubletten(objekte, (bestand ?? []) as Array<{ id: string; bezeichnung: string; plz: string | null; strasse: string | null; hausnummer: string | null; ort: string | null }>);

  return {
    vorschau: {
      pfad,
      anbieter: gelesen.anbieter.firmenname,
      anzahl: objekte.length,
      mitBildern: objekte.filter((o) => o.bilder.length > 0).length,
      zurueckgezogen: gelesen.objekte.length - objekte.length,
      dubletten: dubletten.map((d) => ({ fremd_id: d.neu.fremd_id, bezeichnung: d.neu.bezeichnung, bestand: d.bestand.bezeichnung })),
      hinweise: [
        ...gelesen.fehler.map((f) => f.meldung),
        ...objekte.filter((o) => o.fremd_id.startsWith("position-")).map((o) => `„${o.bezeichnung}“ hat keine Objektnummer und ist beim nächsten Import nicht wiedererkennbar.`),
      ],
    },
  };
}

/** Uebernimmt die Datei: Auftrag einstellen und sofort anstossen. */
export async function openImmoUebernehmen(formular: FormData): Promise<IntegrationsErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "einstellungen", "aendern", sitzung.uebersteuerung);
  rechtErzwingen(sitzung.rolle, "objekte", "anlegen", sitzung.uebersteuerung);

  const pfad = text(formular, "pfad");
  if (!pfad.startsWith(`${sitzung.mandantId}/`) || pfad.includes("..")) {
    return { fehler: "Die Datei gehört nicht zu diesem Unternehmen." };
  }

  const integrationId = await openImmoIntegration(sitzung);
  if (!integrationId) return { fehler: "Die OpenImmo-Integration konnte nicht angelegt werden." };

  return auftragEinstellenUndAnstossen(sitzung, { integration_id: integrationId, richtung: "holen", ausloeser: "manuell", datei_pfad: pfad });
}
