import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LeadDossier } from "@/components/akquise/LeadDossier";
import { Seitenkopf } from "@/components/Seitenkopf";
import { wertindikation } from "@/lib/akquise/preisfinder";
import { leadAdresse, type Aktivitaet, type Kampagne, type LeadZeile, type Quelle, type Stufe, type Vorlage } from "@/lib/akquise/stammdaten";
import { akquiseEinstellungenLaden, vergleichswerteLaden } from "@/lib/akquise/vergleichswerte";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lead" };

const name = (k: { anrede?: string | null; vorname: string | null; nachname: string | null; firma: string | null } | null) => (k ? [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "Kontakt" : "");
const zahl = (w: unknown) => (w === null || w === undefined ? null : Number(w));

export default async function LeadSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const { data } = await supabase
    .from("akquise_leads")
    .select("*, kontakt_ref:kontakte!akquise_leads_kontakt_id_fkey(id, vorname, nachname, firma, email, telefon), tippgeber:kontakte!akquise_leads_tippgeber_kontakt_id_fkey(id, vorname, nachname, firma), objekt_ref:objekte(id, objektnummer, bezeichnung, status), wertermittlung:wertermittlungen(id, bezeichnung), aufnahme:objektaufnahmen(id, bezeichnung)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const roh = data as unknown as LeadZeile & {
    kontakt_ref: { id: string; vorname: string | null; nachname: string | null; firma: string | null; email: string | null; telefon: string | null } | null;
    tippgeber: { id: string; vorname: string | null; nachname: string | null; firma: string | null } | null;
    objekt_ref: { id: string; objektnummer: string; bezeichnung: string; status: string } | null;
    wertermittlung: { id: string; bezeichnung: string } | null;
    aufnahme: { id: string; bezeichnung: string } | null;
  };
  const lead: LeadZeile = { ...roh, wohnflaeche: zahl(roh.wohnflaeche), grundstueck: zahl(roh.grundstueck), wert_indikation: zahl(roh.wert_indikation), angebotspreis: zahl(roh.angebotspreis), provision_satz: zahl(roh.provision_satz), provision_erwartet: zahl(roh.provision_erwartet) };
  const [{ data: stufen }, { data: quellen }, { data: kampagnen }, { data: kontakte }, { data: benutzer }, { data: aktivitaeten }, { data: historie }, { data: laeufe }, { data: vorlagen }, einst, bestand, postfaecher] = await Promise.all([
    supabase.from("akquise_stufen").select("id, pipeline_id, name, zusatz, sortierung, wahrscheinlichkeit, ist_gewonnen, ist_verloren").eq("pipeline_id", lead.pipeline_id).order("sortierung"),
    supabase.from("akquise_quellen").select("id, name, art, kampagne_id, pipeline_id, sortierung, aktiv").order("sortierung"),
    supabase.from("akquise_kampagnen").select("id, name, art, kanal, budget, ausgaben, beginn, ende, notiz, aktiv").order("name"),
    supabase.from("kontakte").select("id, vorname, nachname, firma").is("geloescht_am", null).order("nachname").limit(500),
    supabase.from("benutzer").select("id, name").eq("aktiv", true).order("name"),
    supabase.from("akquise_aktivitaeten").select("*").eq("lead_id", id).order("erstellt_am", { ascending: false }).limit(200),
    supabase.from("akquise_lead_historie").select("id, feld, alt, neu, erstellt_am, benutzer:benutzer(name)").eq("lead_id", id).order("erstellt_am", { ascending: false }).limit(200),
    supabase.from("akquise_laeufe").select("id, geplant_am, status, automation:akquise_automationen(name, kanal)").eq("lead_id", id).order("geplant_am"),
    supabase.from("akquise_vorlagen").select("id, name, kanal, betreff, text, aktiv").order("name"),
    akquiseEinstellungenLaden(supabase),
    vergleichswerteLaden(supabase),
    supabase.from("postfaecher").select("id", { count: "exact", head: true }).eq("status", "aktiv"),
  ]);

  return (
    <>
      <Seitenkopf titel={lead.titel} beschreibung={[leadAdresse(lead), roh.kontakt_ref ? `Eigentümer ${name(roh.kontakt_ref)}` : null].filter(Boolean).join(" · ")}>
        <Link href="/akquise/leads" className="text-[13px] text-akzent hover:underline">Zu den Leads</Link>
      </Seitenkopf>
      <LeadDossier
        lead={lead}
        stufen={(stufen ?? []) as Stufe[]}
        quellen={(quellen ?? []) as Quelle[]}
        kampagnen={((kampagnen ?? []) as Kampagne[]).map((k) => ({ ...k, budget: zahl(k.budget), ausgaben: Number(k.ausgaben) }))}
        kontakte={((kontakte ?? []) as Array<{ id: string; vorname: string | null; nachname: string | null; firma: string | null }>).map((k) => ({ id: k.id, name: name(k) }))}
        benutzer={(benutzer ?? []) as { id: string; name: string }[]}
        kontakt={roh.kontakt_ref ? { id: roh.kontakt_ref.id, name: name(roh.kontakt_ref), email: roh.kontakt_ref.email, telefon: roh.kontakt_ref.telefon } : null}
        tippgeber={roh.tippgeber ? { id: roh.tippgeber.id, name: name(roh.tippgeber) } : null}
        objekt={roh.objekt_ref}
        wertermittlung={roh.wertermittlung}
        aufnahme={roh.aufnahme}
        aktivitaeten={(aktivitaeten ?? []) as Aktivitaet[]}
        historie={(historie ?? []) as unknown as Array<{ id: string; feld: string; alt: string | null; neu: string | null; erstellt_am: string; benutzer: { name: string } | null }>}
        laeufe={(laeufe ?? []) as unknown as Array<{ id: string; geplant_am: string; status: string; automation: { name: string | null; kanal: string } | null }>}
        vorlagen={(vorlagen ?? []) as Vorlage[]}
        indikation={wertindikation(lead, bestand)}
        einstellungen={einst}
        postfachVorhanden={(postfaecher.count ?? 0) > 0}
        darfAendern={hatRecht(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung)}
        darfLoeschen={hatRecht(sitzung.rolle, "akquise", "loeschen", sitzung.uebersteuerung)}
        darfObjekt={hatRecht(sitzung.rolle, "objekte", "anlegen", sitzung.uebersteuerung)}
        darfWertermittlung={hatRecht(sitzung.rolle, "wertermittlung", "anlegen", sitzung.uebersteuerung)}
      />
    </>
  );
}
