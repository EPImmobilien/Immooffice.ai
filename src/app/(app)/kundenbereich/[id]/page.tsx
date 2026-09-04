import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { KundeDetail, type KundeDaten } from "@/components/portal/KundeDetail";
import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { KUNDEN_ART, type PortalKunde } from "@/lib/portal/typen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kundenakte" };

/** Kundenakte eines Zugangs (Eigentuemer, Kaeufer, Projekt-Interessent). */
export default async function KundeSeite({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, sitzung] = await Promise.all([params, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "portal", "lesen", sitzung.uebersteuerung);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await serverClient();
  const { data: kunde } = await supabase.from("portal_kunden").select("id, art, anzeigename, email, telefon, kontakt_id, aktiv, eingeladen_am, einladung_gueltig_bis, angenommen_am, letzter_login_am, ansprechpartner_id, projekt_id, einheit_id, fortschritt_stufe, fortschritt_notiz, quelle, passwort_hash").eq("id", id).is("geloescht_am", null).maybeSingle();
  if (!kunde) notFound();
  const k = kunde as unknown as PortalKunde;
  const [zuordnungen, objekte, vertraege, dokumente, nachrichten, aktivitaeten, antraege, mitarbeiter, projekt] = await Promise.all([
    supabase.from("portal_kunden_objekte").select("objekt_id, vertrag_id").eq("kunde_id", id),
    supabase.from("objekte").select("id, objektnummer, bezeichnung, status").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("vertraege").select("id, titel, objekt_id").eq("art", "maklervertrag").order("erstellt_am", { ascending: false }).limit(200),
    supabase.from("portal_dokumente").select("*").eq("kunde_id", id).order("erstellt_am", { ascending: false }),
    supabase.from("portal_nachrichten").select("id, richtung, text, gelesen_am, erstellt_am").eq("kunde_id", id).order("erstellt_am"),
    supabase.from("portal_aktivitaeten").select("id, art, detail, gesehen_am, erstellt_am").eq("kunde_id", id).order("erstellt_am", { ascending: false }).limit(200),
    supabase.from("verbrauchsausweis_antraege").select("id, status, daten, objekt_id, eingereicht_am, erstellt_am").eq("kunde_id", id).order("erstellt_am", { ascending: false }),
    supabase.from("benutzer").select("id, name").eq("aktiv", true).order("name"),
    k.projekt_id ? supabase.from("projekte").select("id, name").eq("id", k.projekt_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const zug = new Map((zuordnungen.data ?? []).map((z) => [z.objekt_id as string, (z.vertrag_id as string | null) ?? null]));
  const objektIds = [...zug.keys()];
  const { data: punkte } = objektIds.length > 0
    ? await supabase.from("checklisten_punkte").select("titel, pflicht, status, checkliste_id, checklisten!inner(objekt_id, abgeschlossen_am)").in("checklisten.objekt_id", objektIds).is("checklisten.abgeschlossen_am", null)
    : { data: [] };
  const daten: KundeDaten = {
    kunde: k,
    projekt: projekt.data ? { id: projekt.data.id as string, name: projekt.data.name as string } : null,
    objekte: (objekte.data ?? []).map((o) => ({ id: o.id as string, bezeichnung: `${o.objektnummer as string} · ${o.bezeichnung as string}`, status: o.status as string, vertrag_id: zug.get(o.id as string) ?? null, zugeordnet: zug.has(o.id as string) })),
    vertraege: (vertraege.data ?? []).map((v) => ({ id: v.id as string, titel: v.titel as string, objekt_id: (v.objekt_id as string | null) ?? null })),
    dokumente: (dokumente.data ?? []) as KundeDaten["dokumente"],
    nachrichten: (nachrichten.data ?? []) as KundeDaten["nachrichten"],
    aktivitaeten: (aktivitaeten.data ?? []) as KundeDaten["aktivitaeten"],
    antraege: (antraege.data ?? []) as KundeDaten["antraege"],
    checkliste: ((punkte ?? []) as Array<{ titel: string; pflicht: boolean; status: string; checklisten: { objekt_id: string } | { objekt_id: string }[] }>).map((p) => ({ titel: p.titel, pflicht: p.pflicht, status: p.status, objekt_id: (Array.isArray(p.checklisten) ? p.checklisten[0]?.objekt_id : p.checklisten?.objekt_id) ?? "" })),
    mitarbeiter: (mitarbeiter.data ?? []).map((m) => ({ id: m.id as string, name: m.name as string })),
    darfAendern: hatRecht(sitzung.rolle, "portal", "aendern", sitzung.uebersteuerung),
    darfLoeschen: hatRecht(sitzung.rolle, "portal", "loeschen", sitzung.uebersteuerung),
  };
  return (
    <>
      <Seitenkopf titel={k.anzeigename} beschreibung={`${KUNDEN_ART[k.art]} · Kundenakte`}>
        <Link href={k.projekt_id ? `/projekte/${k.projekt_id}` : `/kundenbereich?art=${k.art}`} className="text-[13px] text-akzent hover:underline">{k.projekt_id ? "Zum Projekt" : "Alle Zugänge"}</Link>
      </Seitenkopf>
      <KundeDetail {...daten} />
    </>
  );
}
