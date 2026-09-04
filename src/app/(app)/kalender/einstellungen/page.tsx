import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { KalenderEinstellungen, type SyncPostfach } from "@/components/kalender/KalenderEinstellungen";
import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kalender-Einstellungen" };

export default async function KalenderEinstellungenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const kopf = await headers();
  const basis = (process.env["NEXT_PUBLIC_APP_URL"] ?? `${kopf.get("x-forwarded-proto") ?? "https"}://${kopf.get("x-forwarded-host") ?? kopf.get("host") ?? "localhost:3000"}`).replace(/\/+$/, "");
  const [{ data: ich }, { data: token }, { data: postfaecher }] = await Promise.all([
    supabase.from("benutzer").select("start_adresse, besichtigung_dauer_min, fahrzeit_puffer_min, fahrzeit_aktiv, kalender_farbe").eq("id", sitzung.benutzerId).maybeSingle(),
    supabase.rpc("kalender_token_lesen", { p_erneuern: false }),
    supabase.from("postfaecher").select("id, adresse, anbieter, benutzer_id, status, kalender_sync, kalender_zustand").in("anbieter", ["google", "microsoft"]).neq("status", "getrennt").order("adresse"),
  ]);
  const verwaltung = hatRecht(sitzung.rolle, "postfach", "aendern", sitzung.uebersteuerung);
  const eigene = (postfaecher ?? []).filter((p) => p.benutzer_id === sitzung.benutzerId || (verwaltung && !p.benutzer_id));
  return (
    <>
      <Seitenkopf titel="Kalender-Einstellungen" beschreibung="Fahrzeiten, Standarddauer, Farbe, Kalender-Abo und Abgleich mit Google Kalender oder Outlook.">
        <Link href="/kalender" className="text-[13px] text-akzent hover:underline">Zum Kalender</Link>
      </Seitenkopf>
      <KalenderEinstellungen
        einstellungen={{ start_adresse: (ich?.start_adresse as string | null) ?? null, besichtigung_dauer_min: Number(ich?.besichtigung_dauer_min ?? 60), fahrzeit_puffer_min: Number(ich?.fahrzeit_puffer_min ?? 5), fahrzeit_aktiv: ich?.fahrzeit_aktiv !== false, kalender_farbe: (ich?.kalender_farbe as string | null) ?? null }}
        token={(token as string | null) ?? ""}
        basisUrl={basis}
        postfaecher={eigene.map((p) => ({ id: p.id as string, adresse: p.adresse as string, anbieter: p.anbieter as string, kalender_sync: Boolean(p.kalender_sync), zustand: (p.kalender_zustand as SyncPostfach["zustand"]) ?? null }))}
        routendienst={Boolean(process.env["ROUTING_API_KEY"])}
      />
    </>
  );
}
