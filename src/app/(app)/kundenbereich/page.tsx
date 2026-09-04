import type { Metadata } from "next";
import Link from "next/link";

import { KundeEinladen } from "@/components/portal/KundeEinladen";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum, zeitpunkt } from "@/lib/format";
import { KUNDEN_ART, type KundenArt } from "@/lib/portal/typen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kundenbereich" };

/** Kundenbereich verwalten (Referenz-Kachel: Eigentuemer-Portal und Kaeuferportal). */
export default async function KundenbereichSeite({ searchParams }: { searchParams: Promise<{ art?: string; neu?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "portal", "lesen", sitzung.uebersteuerung);
  const darfAendern = hatRecht(sitzung.rolle, "portal", "anlegen", sitzung.uebersteuerung);
  const art: KundenArt = p.art === "kaeufer" ? "kaeufer" : p.art === "interessent" ? "interessent" : "eigentuemer";
  const supabase = await serverClient();
  const [{ data: kunden }, { data: glocke }, { data: nachrichten }, { data: objekte }, { data: mitarbeiter }, { data: zuordnungen }] = await Promise.all([
    supabase.from("portal_kunden").select("id, art, anzeigename, email, aktiv, eingeladen_am, angenommen_am, letzter_login_am, projekt_id, fortschritt_stufe").is("geloescht_am", null).eq("art", art).order("erstellt_am", { ascending: false }),
    supabase.rpc("portal_glocke"),
    supabase.from("portal_nachrichten").select("kunde_id").eq("richtung", "kunde").is("gelesen_am", null),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("benutzer").select("id, name").eq("aktiv", true).order("name"),
    supabase.from("portal_kunden_objekte").select("kunde_id, objekt_id"),
  ]);
  const g = (glocke ?? {}) as { nachrichten?: number; anfragen?: number; uploads?: number; antraege?: number };
  const ungelesen = new Map<string, number>();
  for (const n of nachrichten ?? []) ungelesen.set(n.kunde_id as string, (ungelesen.get(n.kunde_id as string) ?? 0) + 1);
  const objektName = new Map((objekte ?? []).map((o) => [o.id as string, `${o.objektnummer as string} · ${o.bezeichnung as string}`]));
  const objekteJe = new Map<string, string[]>();
  for (const z of zuordnungen ?? []) objekteJe.set(z.kunde_id as string, [...(objekteJe.get(z.kunde_id as string) ?? []), objektName.get(z.objekt_id as string) ?? "Objekt"]);
  const liste = (kunden ?? []) as Array<{ id: string; art: KundenArt; anzeigename: string; email: string; aktiv: boolean; eingeladen_am: string; angenommen_am: string | null; letzter_login_am: string | null; projekt_id: string | null; fortschritt_stufe: number }>;
  return (
    <>
      <Seitenkopf titel="Kundenbereich" beschreibung="Eigentümer und Käufer einladen, Zugänge verwalten, sehen, was Kunden hochgeladen oder gefragt haben.">
        {darfAendern && !p.neu && <Link href={`/kundenbereich?art=${art}&neu=1`} className="text-[13px] text-akzent hover:underline">+ {KUNDEN_ART[art]} einladen</Link>}
      </Seitenkopf>
      <Hinweis ton="info" className="mb-4">Hinweis zum Rahmen: Der Masterprompt schließt einen Kundenbereich aus; dieses Paket ist auf Weisung des Auftraggebers (1:1-Übernahme) gebaut und kann als Ganzes gestrichen werden (E-2026-09-03-36).</Hinweis>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {[["Ungelesene Nachrichten", g.nachrichten ?? 0], ["Offene Projekt-Anfragen", g.anfragen ?? 0], ["Neue Kunden-Uploads", g.uploads ?? 0], ["Eingereichte Anträge", g.antraege ?? 0]].map(([l, n]) => (
          <div key={String(l)} className={`rounded-[var(--radius)] border p-3 ${Number(n) > 0 ? "border-akzent bg-akzent-schwach" : "border-linie bg-flaeche"}`}><p className="text-[11px] uppercase tracking-wide text-gedaempft">{l}</p><p className="font-titel text-xl font-semibold">{n}</p></div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(Object.keys(KUNDEN_ART) as KundenArt[]).map((a) => <Link key={a} href={`/kundenbereich?art=${a}`} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${art === a ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft hover:text-text"}`}>{a === "eigentuemer" ? "Eigentümer-Bereich" : a === "kaeufer" ? "Käufer-Bereich" : "Projekt-Interessenten"}</Link>)}
        <Link href="/projekte" className="rounded-[var(--radius)] border border-linie bg-flaeche px-3 py-1 text-[12px] text-gedaempft hover:text-text">Neubauprojekte</Link>
      </div>
      {p.neu && darfAendern && (
        <Karte className="mb-4"><KarteKopf><KarteTitel>{KUNDEN_ART[art]} einladen</KarteTitel><KarteBeschreibung>{art === "eigentuemer" ? "Zugang zum persönlichen Objekt-Bereich: Vermarktungsstand, Dokumente, Nachrichten, Unterlagen-Checkliste." : "Käufer mit den wichtigsten Informationen zu ihrer Immobilie versorgen: Kaufabwicklung in sieben Schritten, Unterlagen, Nachrichten."}</KarteBeschreibung></KarteKopf><KarteInhalt><KundeEinladen vorgabe={{ art }} objekte={(objekte ?? []).map((o) => ({ id: o.id as string, bezeichnung: objektName.get(o.id as string) ?? "" }))} mitarbeiter={(mitarbeiter ?? []).map((m) => ({ id: m.id as string, name: m.name as string }))} eigeneId={sitzung.benutzerId} /></KarteInhalt></Karte>
      )}
      <Karte>
        <KarteKopf><KarteTitel>{art === "eigentuemer" ? "Eigentümer" : art === "kaeufer" ? "Käufer" : "Interessenten"}</KarteTitel></KarteKopf>
        <KarteInhalt className="text-[13px]">
          {liste.length === 0 && <p className="text-gedaempft">Noch keine Zugänge.</p>}
          <div className="divide-y divide-linie">
            {liste.map((k) => (
              <Link key={k.id} href={`/kundenbereich/${k.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-hintergrund">
                <div>
                  <p className="font-medium">{k.anzeigename} {!k.aktiv && <Marke ton="fehler">gesperrt</Marke>} {ungelesen.get(k.id) ? <Marke ton="warnung">{ungelesen.get(k.id)} neue Nachricht(en)</Marke> : null}</p>
                  <p className="text-[12px] text-gedaempft">{k.email} · {(objekteJe.get(k.id) ?? []).join(", ") || (k.projekt_id ? "Projekt-Zugang" : "kein Objekt")}</p>
                </div>
                <p className="text-[11px] text-gedaempft">eingeladen {datum(k.eingeladen_am)} · {k.letzter_login_am ? `zuletzt ${zeitpunkt(k.letzter_login_am)}` : k.angenommen_am ? "angenommen" : "noch nicht geöffnet"}{art === "kaeufer" ? ` · Stufe ${k.fortschritt_stufe}/7` : ""}</p>
              </Link>
            ))}
          </div>
        </KarteInhalt>
      </Karte>
    </>
  );
}
