import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjektDetail, type ProjektDaten } from "@/components/portal/ProjektDetail";
import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { projektLink, type Einheit, type PortalKunde } from "@/lib/portal/typen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Projekt" };

const KUNDEN_FELDER = "id, art, anzeigename, email, telefon, kontakt_id, aktiv, eingeladen_am, einladung_gueltig_bis, angenommen_am, letzter_login_am, ansprechpartner_id, projekt_id, einheit_id, fortschritt_stufe, fortschritt_notiz, quelle, passwort_hash";

/** Projektakte (Referenz: Neubauprojekte → Projekt mit allen Reitern). */
export default async function ProjektSeite({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, sitzung] = await Promise.all([params, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "portal", "lesen", sitzung.uebersteuerung);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await serverClient();
  const { data: projekt } = await supabase.from("projekte").select("*").eq("id", id).is("geloescht_am", null).maybeSingle();
  if (!projekt) notFound();
  const kundenIds = (await supabase.from("portal_kunden").select("id").eq("projekt_id", id).is("geloescht_am", null)).data?.map((k) => k.id as string) ?? [];
  const [einheiten, ordner, dateien, updates, gewerke, zugaenge, anfragen, merkliste, nachrichten, aktivitaeten, mitarbeiter, objekte] = await Promise.all([
    supabase.from("projekt_einheiten").select("*").eq("projekt_id", id).order("geschoss_index").order("sortierung").order("we_nr"),
    supabase.from("projekt_ordner").select("*").eq("projekt_id", id).order("sortierung").order("name"),
    supabase.from("projekt_dateien").select("*").eq("projekt_id", id).order("erstellt_am", { ascending: false }),
    supabase.from("projekt_updates").select("*").eq("projekt_id", id).order("erstellt_am", { ascending: false }),
    supabase.from("projekt_kontakte").select("*").eq("projekt_id", id).order("sortierung").order("gewerk"),
    supabase.from("portal_kunden").select(KUNDEN_FELDER).eq("projekt_id", id).is("geloescht_am", null).order("erstellt_am", { ascending: false }),
    supabase.from("projekt_anfragen").select("*").eq("projekt_id", id).order("erstellt_am", { ascending: false }),
    supabase.from("projekt_merkliste").select("*").eq("projekt_id", id).order("erstellt_am", { ascending: false }),
    kundenIds.length > 0 ? supabase.from("portal_nachrichten").select("id, kunde_id, richtung, text, gelesen_am, erstellt_am").in("kunde_id", kundenIds).order("erstellt_am") : Promise.resolve({ data: [] }),
    kundenIds.length > 0 ? supabase.from("portal_aktivitaeten").select("id, kunde_id, art, detail, gesehen_am, erstellt_am").in("kunde_id", kundenIds).order("erstellt_am", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
    supabase.from("benutzer").select("id, name").eq("aktiv", true).order("name"),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
  ]);
  const basis = (process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/+$/, "");
  const daten: ProjektDaten = {
    projekt: { ...(projekt as ProjektDaten["projekt"]), vermarktungsart: (projekt.vermarktungsart as "kauf" | "miete") ?? "kauf" },
    einheiten: (einheiten.data ?? []) as Einheit[],
    ordner: (ordner.data ?? []) as ProjektDaten["ordner"],
    dateien: (dateien.data ?? []) as ProjektDaten["dateien"],
    updates: ((updates.data ?? []) as Array<Record<string, unknown>>).map((u) => ({ ...(u as unknown as ProjektDaten["updates"][number]), bilder: (u["bilder"] as string[] | null) ?? [] })),
    gewerke: (gewerke.data ?? []) as ProjektDaten["gewerke"],
    zugaenge: (zugaenge.data ?? []) as unknown as PortalKunde[],
    anfragen: (anfragen.data ?? []) as ProjektDaten["anfragen"],
    merkliste: (merkliste.data ?? []) as ProjektDaten["merkliste"],
    nachrichten: (nachrichten.data ?? []) as ProjektDaten["nachrichten"],
    aktivitaeten: (aktivitaeten.data ?? []) as ProjektDaten["aktivitaeten"],
    mitarbeiter: (mitarbeiter.data ?? []).map((m) => ({ id: m.id as string, name: m.name as string })),
    objekte: (objekte.data ?? []).map((o) => ({ id: o.id as string, bezeichnung: `${o.objektnummer as string} · ${o.bezeichnung as string}` })),
    projektLink: projekt.token ? projektLink(basis, projekt.token as string) : null,
    eigeneId: sitzung.benutzerId,
    darfAendern: hatRecht(sitzung.rolle, "portal", "aendern", sitzung.uebersteuerung),
    darfLoeschen: hatRecht(sitzung.rolle, "portal", "loeschen", sitzung.uebersteuerung),
  };
  return (
    <>
      <Seitenkopf titel={projekt.name as string} beschreibung={[projekt.strasse, [projekt.plz, projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Neubauprojekt"}>
        <Link href="/projekte" className="text-[13px] text-akzent hover:underline">Alle Projekte</Link>
      </Seitenkopf>
      <ProjektDetail {...daten} />
    </>
  );
}
