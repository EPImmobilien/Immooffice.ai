import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RechnungFormular } from "@/components/rechnungen/RechnungFormular";
import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { rechnungDokumentLaden } from "@/lib/dokument/erzeugen";
import type { Kunde } from "@/lib/rechnungen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rechnung" };

export default async function RechnungSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const geladen = await rechnungDokumentLaden(supabase, sitzung.mandantId, id);
  if (!geladen) notFound();
  const r = geladen.rechnung;
  // Positionen erneut lesen (rechnungDokumentLaden haelt sie nur im Dokument)
  const [{ data: positionen }, { data: absender }, { data: kunden }, { data: objekte }, { data: vertraege }, { data: stornoVon }, { data: storniertDurch }, { data: branding }] = await Promise.all([
    supabase.from("rechnungspositionen").select("id, position, beschreibung, menge, einheit, einzelpreis_netto, mwst_satz, netto").eq("rechnung_id", id).order("position"),
    supabase.from("rechnungs_absender").select("id, name, typ, kleinunternehmer, standard_mwst, aktiv").order("typ").order("sortierung"),
    supabase.from("rechnungskunden").select("id, kontakt_id, anrede, name, zusatz, strasse, plz, ort, land, email, ust_id").order("name").limit(500),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("vertraege").select("id, titel").in("art", ["maklervertrag", "objektnachweis"]).order("erstellt_am", { ascending: false }).limit(200),
    r.storno_von_id ? supabase.from("rechnungen").select("id, rechnungsnummer").eq("id", r.storno_von_id).maybeSingle() : Promise.resolve({ data: null }),
    r.storniert_durch_id ? supabase.from("rechnungen").select("id, rechnungsnummer").eq("id", r.storniert_durch_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("mandant_branding").select("firmenname").eq("mandant_id", sitzung.mandantId).maybeSingle(),
  ]);
  const zahl = (w: unknown) => (w === null || w === undefined ? 0 : Number(w));
  const titel = r.rechnungsnummer ? `${r.typ === "storno" ? "Storno-Rechnung" : "Rechnung"} ${r.rechnungsnummer}` : "Rechnungsentwurf";

  return (
    <>
      <Seitenkopf titel={titel} beschreibung={[r.empfaenger_name || "Ohne Empfänger", r.ist_test ? "Testrechnung" : null].filter(Boolean).join(" · ")}>
        <Link href="/rechnungen" className="text-[13px] text-akzent hover:underline">Zur Übersicht</Link>
      </Seitenkopf>
      <RechnungFormular
        key={id}
        rechnung={r}
        positionen={(positionen ?? []).map((p) => ({ id: p.id as string, position: p.position as number, beschreibung: p.beschreibung as string, menge: zahl(p.menge), einheit: (p.einheit as string | null) ?? null, einzelpreis_netto: zahl(p.einzelpreis_netto), mwst_satz: zahl(p.mwst_satz), netto: zahl(p.netto) }))}
        absender={(absender ?? []).map((a) => ({ id: a.id as string, name: a.name as string, typ: a.typ as string, kleinunternehmer: Boolean(a.kleinunternehmer), standard_mwst: zahl(a.standard_mwst), aktiv: Boolean(a.aktiv) }))}
        kunden={(kunden ?? []) as unknown as Kunde[]}
        objekte={(objekte ?? []).map((o) => ({ id: o.id as string, objektnummer: o.objektnummer as string, bezeichnung: o.bezeichnung as string }))}
        vertraege={(vertraege ?? []).map((v) => ({ id: v.id as string, titel: v.titel as string }))}
        bezuege={{ stornoVon: stornoVon ? { id: stornoVon.id as string, nummer: stornoVon.rechnungsnummer as string | null } : null, storniertDurch: storniertDurch ? { id: storniertDurch.id as string, nummer: storniertDurch.rechnungsnummer as string | null } : null }}
        heute={new Date().toISOString().slice(0, 10)}
        mailAbsender={sitzung.name}
        mailFirma={(branding?.firmenname as string | null) ?? sitzung.mandantName}
        darfAendern={hatRecht(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung)}
        darfFreigeben={hatRecht(sitzung.rolle, "rechnungen", "freigeben", sitzung.uebersteuerung)}
      />
    </>
  );
}
