import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AufgabeDetail, type Verknuepfung } from "@/components/aufgaben/AufgabeDetail";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Marke } from "@/components/ui/Status";
import { AUFGABEN_STATUS, type AufgabeErweitert, type Kommentar, type Schritt, type Tag } from "@/lib/arbeitsmittel";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { kiVerfuegbar } from "@/lib/ki";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Aufgabe" };

export default async function AufgabeSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const { data } = await supabase
    .from("aufgaben")
    .select("*, objekt:objekte(id, objektnummer, bezeichnung), kontakt:kontakte(id, vorname, nachname), zustaendig:benutzer!aufgaben_zustaendig_id_fkey(name), lead:akquise_leads(id, titel), termin:termine(id, titel, beginnt_am), nachricht:nachrichten(id, betreff), vertrag:vertraege(id, titel)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const a = data as unknown as AufgabeErweitert & { objekt: { id: string; objektnummer: string; bezeichnung: string } | null; kontakt: { id: string; vorname: string | null; nachname: string } | null; lead: { id: string; titel: string } | null; termin: { id: string; titel: string; beginnt_am: string } | null; nachricht: { id: string; betreff: string | null } | null; vertrag: { id: string; titel: string } | null };
  const [{ data: schritte }, { data: kommentare }, { data: tags }, { data: benutzer }, { data: objekte }, { data: kontakte }] = await Promise.all([
    supabase.from("aufgaben_schritte").select("id, titel, sortierung, erledigt_am").eq("aufgabe_id", id).order("sortierung"),
    supabase.from("aufgaben_kommentare").select("id, text, system, benutzer_name, erstellt_am").eq("aufgabe_id", id).order("erstellt_am"),
    supabase.from("aufgaben_tags").select("id, name, farbe").order("name"),
    supabase.from("benutzer").select("id, name").eq("aktiv", true).order("name"),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(300),
    supabase.from("kontakte").select("id, vorname, nachname, firma").is("geloescht_am", null).order("nachname").limit(500),
  ]);
  const verknuepfungen: Verknuepfung[] = [];
  if (a.objekt) verknuepfungen.push({ art: "objekt", bezeichnung: `${a.objekt.objektnummer} · ${a.objekt.bezeichnung}`, pfad: `/objekte/${a.objekt.id}` });
  if (a.kontakt) verknuepfungen.push({ art: "kontakt", bezeichnung: [a.kontakt.vorname, a.kontakt.nachname].filter(Boolean).join(" "), pfad: `/kontakte/${a.kontakt.id}` });
  if (a.lead) verknuepfungen.push({ art: "lead", bezeichnung: a.lead.titel, pfad: `/akquise/leads/${a.lead.id}` });
  if (a.termin) verknuepfungen.push({ art: "termin", bezeichnung: a.termin.titel, pfad: "/kalender" });
  if (a.nachricht) verknuepfungen.push({ art: "nachricht", bezeichnung: a.nachricht.betreff ?? "E-Mail", pfad: `/postfach?nachricht=${a.nachricht.id}` });
  if (a.vertrag) verknuepfungen.push({ art: "vertrag", bezeichnung: a.vertrag.titel, pfad: `/vertraege/${a.vertrag.id}` });

  return (
    <>
      <Seitenkopf titel={a.titel} beschreibung={[a.zustaendig?.name ? `Zuständig ${a.zustaendig.name}` : null, a.tags.length > 0 ? a.tags.map((t) => `#${t}`).join(" ") : null].filter(Boolean).join(" · ")}>
        <div className="flex items-center gap-2"><Marke ton={a.status === "erledigt" ? "erfolg" : a.status === "verworfen" ? "fehler" : "info"}>{AUFGABEN_STATUS[a.status]}</Marke><Link href="/aufgaben" className="text-[13px] text-akzent hover:underline">Zu den Aufgaben</Link></div>
      </Seitenkopf>
      <AufgabeDetail
        aufgabe={a}
        schritte={(schritte ?? []) as Schritt[]}
        kommentare={(kommentare ?? []) as Kommentar[]}
        tags={(tags ?? []) as Tag[]}
        verknuepfungen={verknuepfungen}
        benutzer={(benutzer ?? []) as { id: string; name: string }[]}
        objekte={(objekte ?? []) as { id: string; objektnummer: string; bezeichnung: string }[]}
        kontakte={((kontakte ?? []) as Array<{ id: string; vorname: string | null; nachname: string | null; firma: string | null }>).map((k) => ({ id: k.id, name: [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "Kontakt" }))}
        kiVerfuegbar={kiVerfuegbar()}
        darfAendern={hatRecht(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung)}
        darfLoeschen={hatRecht(sitzung.rolle, "kalender", "loeschen", sitzung.uebersteuerung)}
      />
    </>
  );
}
