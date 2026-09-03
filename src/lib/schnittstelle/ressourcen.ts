import "server-only";

import type { NextResponse } from "next/server";
import { z } from "zod";

import { apiAntwort, apiFehler, seitenParameter, type ApiKontext } from "./auth";

/**
 * Gemeinsame Zugriffe der Route Handler. Jede Abfrage traegt den Mandanten
 * des Schluessels — auch dort, wo die ID allein schon eindeutig waere.
 */

export type Tabelle = "objekte" | "kontakte" | "termine";

function idPruefen(id: string): boolean {
  return z.uuid().safeParse(id).success;
}

function datenbankFehler(meldung: string): NextResponse {
  // Constraint-Verletzungen sind Eingabefehler; alles andere ein Serverfehler.
  const t = meldung.toLowerCase();
  if (t.includes("violates") || t.includes("constraint") || t.includes("gehoert nicht") || t.includes("invalid input")) {
    return apiFehler(422, "Die Daten wurden von der Datenbank abgelehnt.", { hinweis: meldung.slice(0, 300) });
  }
  return apiFehler(500, "Die Anfrage konnte nicht verarbeitet werden.");
}

export async function liste(kontext: ApiKontext, tabelle: Tabelle, felder: string, url: URL, weich: boolean): Promise<NextResponse> {
  const p = seitenParameter(url);
  let abfrage = kontext.dienst
    .from(tabelle)
    .select(felder, { count: "exact" })
    .eq("mandant_id", kontext.mandantId)
    .order("geaendert_am", { ascending: false })
    .range(p.von, p.bis);
  if (weich) abfrage = abfrage.is("geloescht_am", null);
  if (p.geaendertSeit) abfrage = abfrage.gte("geaendert_am", p.geaendertSeit);
  const { data, error, count } = await abfrage;
  if (error) return datenbankFehler(error.message);
  const gesamt = count ?? 0;
  return apiAntwort(kontext, { daten: data ?? [], seite: p.seite, groesse: p.groesse, gesamt, weitere: gesamt > p.bis + 1 });
}

export async function einzeln(kontext: ApiKontext, tabelle: Tabelle, felder: string, id: string, weich: boolean): Promise<NextResponse> {
  if (!idPruefen(id)) return apiFehler(404, "Nicht gefunden.");
  let abfrage = kontext.dienst.from(tabelle).select(felder).eq("id", id).eq("mandant_id", kontext.mandantId);
  if (weich) abfrage = abfrage.is("geloescht_am", null);
  const { data, error } = await abfrage.maybeSingle();
  if (error) return datenbankFehler(error.message);
  if (!data) return apiFehler(404, "Nicht gefunden.");
  return apiAntwort(kontext, data);
}

export async function anlegen(kontext: ApiKontext, tabelle: Tabelle, felder: string, werte: Record<string, unknown>): Promise<NextResponse> {
  const { data, error } = await kontext.dienst
    .from(tabelle)
    .insert({ ...werte, mandant_id: kontext.mandantId })
    .select(felder)
    .single();
  if (error) return datenbankFehler(error.message);
  return apiAntwort(kontext, data, 201);
}

export async function aendern(
  kontext: ApiKontext,
  tabelle: Tabelle,
  felder: string,
  id: string,
  werte: Record<string, unknown>,
  weich: boolean,
): Promise<NextResponse> {
  if (!idPruefen(id)) return apiFehler(404, "Nicht gefunden.");
  if (Object.keys(werte).length === 0) return apiFehler(422, "Keine Änderung angegeben.");
  let abfrage = kontext.dienst.from(tabelle).update(werte).eq("id", id).eq("mandant_id", kontext.mandantId);
  if (weich) abfrage = abfrage.is("geloescht_am", null);
  const { data, error } = await abfrage.select(felder).maybeSingle();
  if (error) return datenbankFehler(error.message);
  if (!data) return apiFehler(404, "Nicht gefunden.");
  return apiAntwort(kontext, data);
}

/** Loeschen ist ein Zustand (Aufbewahrungspflichten): geloescht_am setzen. */
export async function weichLoeschen(kontext: ApiKontext, tabelle: "objekte" | "kontakte", id: string): Promise<NextResponse> {
  if (!idPruefen(id)) return apiFehler(404, "Nicht gefunden.");
  const { data, error } = await kontext.dienst
    .from(tabelle)
    .update({ geloescht_am: new Date().toISOString() })
    .eq("id", id)
    .eq("mandant_id", kontext.mandantId)
    .is("geloescht_am", null)
    .select("id")
    .maybeSingle();
  if (error) return datenbankFehler(error.message);
  if (!data) return apiFehler(404, "Nicht gefunden.");
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }) as unknown as NextResponse;
}
