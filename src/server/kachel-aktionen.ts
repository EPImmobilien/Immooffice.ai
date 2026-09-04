"use server";

import { revalidatePath } from "next/cache";

import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { kachelEinstellungLesen, type KachelEinstellung } from "@/lib/kacheln";
import { serverClient } from "@/lib/supabase/server";

/** Speichert Reihenfolge und ausgeblendete Kacheln der Startseite fuer den angemeldeten Benutzer. */
export async function kachelnSpeichern(einstellung: KachelEinstellung | null): Promise<{ ok: boolean; fehler?: string }> {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();
  const wert = einstellung ? kachelEinstellungLesen(einstellung) : null;
  const { error } = await supabase.from("benutzer").update({ kacheln: wert }).eq("id", sitzung.benutzerId);
  if (error) return { ok: false, fehler: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}
