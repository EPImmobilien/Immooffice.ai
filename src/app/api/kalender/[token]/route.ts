import { NextResponse } from "next/server";

import { icsKalender } from "@/lib/kalender/ics";
import { dienstClient } from "@/lib/supabase/dienst";

export const runtime = "nodejs";

/**
 * Kalender-Abo (ICS-Feed) je Benutzer: Apple-, Google- und Outlook-Kalender
 * abonnieren diese Adresse. Der Token steht nur dem Benutzer selbst zur
 * Verfuegung (Kalender → Einstellungen) und laesst sich dort erneuern.
 */
export async function GET(_anfrage: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32,64}$/.test(token)) return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
  const supabase = dienstClient();
  const { data, error } = await supabase.rpc("kalender_feed", { p_token: token });
  if (error) return NextResponse.json({ fehler: "Nicht verfügbar." }, { status: 503 });
  const zeilen = (data ?? []) as Array<{ id: string; titel: string; art: string; beginnt_am: string; endet_am: string; ganztags: boolean; ort: string | null; notiz: string | null; abgesagt_am: string | null; geaendert_am: string | null; benutzer_name: string }>;
  if (zeilen.length === 0) {
    // Unbekannter Token und leerer Kalender sehen gleich aus — kein Orakel fuer Token-Raten.
    return new NextResponse(icsKalender([], "ImmoOffice.ai"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
  }
  const ics = icsKalender(zeilen.map((z) => ({ id: z.id, titel: z.titel, beginnt_am: z.beginnt_am, endet_am: z.endet_am, ganztags: z.ganztags, ort: z.ort, beschreibung: z.notiz, abgesagt: Boolean(z.abgesagt_am), geaendert_am: z.geaendert_am })), `ImmoOffice.ai – ${zeilen[0]?.benutzer_name ?? ""}`.trim());
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="immooffice-kalender.ics"', "Cache-Control": "private, max-age=300" } });
}
