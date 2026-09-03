import type { Metadata } from "next";
import Link from "next/link";

import { NachrichtDetail } from "@/components/postfach/NachrichtDetail";
import { Nachrichtenliste } from "@/components/postfach/Nachrichtenliste";
import { NeueNachricht } from "@/components/postfach/NeueNachricht";
import type { AnhangZeile, KontaktKurz, NachrichtDetailZeile, NachrichtZeile, ObjektKurz, PostfachZeile } from "@/components/postfach/typen";
import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import { Auswahl, Eingabe } from "@/components/ui/Feld";
import { Karte } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { kiVerfuegbar } from "@/lib/ki";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Postfach" };

interface Parameter {
  nachricht?: string;
  suche?: string;
  postfach?: string;
  ungelesen?: string;
  neu?: string;
  an?: string;
}

const POSTFACH_FELDER = "id, adresse, anzeigename, anbieter, status, benutzer_id, intervall_minuten, signatur_anhaengen, letzter_abruf_am, fehler_text, fehler_zaehler";
const LISTEN_FELDER = "id, postfach_id, ordner, von_adresse, von_name, an, betreff, vorschau, gesendet_am, gelesen, hat_anhaenge, kontakt_id, objekt_id, objekt_vorschlag_id, objekt_vorschlag_konfidenz";

/**
 * Postfach (docs/AUTONOMIE.md Abschnitt 6): Eingang lesen, suchen, zuordnen,
 * antworten. Alles, was ein Mail-Client sonst kann, bleibt beim Anbieter (P3).
 */
export default async function PostfachSeite({ searchParams }: { searchParams: Promise<Parameter> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "postfach", "lesen", sitzung.uebersteuerung);
  const darfSenden = hatRecht(sitzung.rolle, "postfach", "anlegen", sitzung.uebersteuerung);
  const darfAendern = hatRecht(sitzung.rolle, "postfach", "aendern", sitzung.uebersteuerung);

  const supabase = await serverClient();
  const { data: postfaecherRoh } = await supabase.from("postfaecher").select(POSTFACH_FELDER).order("erstellt_am", { ascending: true });
  const postfaecher = (postfaecherRoh ?? []) as PostfachZeile[];

  if (postfaecher.length === 0) {
    return (
      <>
        <Seitenkopf titel="Postfach" beschreibung="Eingang lesen, Nachrichten Objekten und Kontakten zuordnen, aus der Anwendung antworten." />
        <Hinweis titel="Noch kein Postfach verbunden">
          Verbinden Sie Ihr Postfach unter{" "}
          <Link href="/einstellungen/postfaecher" className="font-medium text-akzent hover:underline">Einstellungen → Postfächer</Link>
          {" "}— Microsoft 365, Google oder IMAP.
        </Hinweis>
      </>
    );
  }

  const parameter: Record<string, string> = {};
  if (p.suche) parameter["suche"] = p.suche;
  if (p.postfach) parameter["postfach"] = p.postfach;
  if (p.ungelesen === "1") parameter["ungelesen"] = "1";

  let abfrage = supabase.from("nachrichten").select(LISTEN_FELDER).order("gesendet_am", { ascending: false }).limit(100);
  if (p.postfach) abfrage = abfrage.eq("postfach_id", p.postfach);
  if (p.ungelesen === "1") abfrage = abfrage.eq("gelesen", false).eq("ordner", "eingang");
  const suche = (p.suche ?? "").replace(/[%_,()"'\\]/g, " ").trim();
  if (suche) {
    abfrage = abfrage.or(`betreff.ilike.%${suche}%,von_adresse.ilike.%${suche}%,von_name.ilike.%${suche}%,text.ilike.%${suche}%`);
  }
  const { data: nachrichtenRoh } = await abfrage;
  const nachrichten = (nachrichtenRoh ?? []) as NachrichtZeile[];

  const [{ data: objekteRoh }, { data: kontakteRoh }] = await Promise.all([
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer", { ascending: false }).limit(500),
    supabase.from("kontakte").select("id, vorname, nachname, firma, email").is("geloescht_am", null).order("nachname", { ascending: true }).limit(500),
  ]);
  const objekte = (objekteRoh ?? []) as ObjektKurz[];
  const kontakte = (kontakteRoh ?? []) as KontaktKurz[];

  let detail: NachrichtDetailZeile | null = null;
  let anhaenge: AnhangZeile[] = [];
  if (p.nachricht) {
    const { data } = await supabase
      .from("nachrichten")
      .select(`${LISTEN_FELDER}, cc, text, message_id, inhalt_entfernt_am, zuordnung_art, objekt_vorschlag_grund`)
      .eq("id", p.nachricht)
      .maybeSingle();
    detail = (data as NachrichtDetailZeile | null) ?? null;
    if (detail) {
      const { data: a } = await supabase.from("nachricht_anhaenge").select("id, dateiname, mime, bytes, dokument_id").eq("nachricht_id", detail.id).order("erstellt_am");
      anhaenge = (a ?? []) as AnhangZeile[];
    }
  }
  const objektVon = (id: string | null) => (id ? (objekte.find((o) => o.id === id) ?? null) : null);
  const kontaktVon = (id: string | null) => (id ? (kontakte.find((k) => k.id === id) ?? null) : null);

  const neuParameter = new URLSearchParams({ ...parameter, neu: "1" });

  return (
    <>
      <Seitenkopf titel="Postfach" beschreibung="Eingang lesen, Nachrichten Objekten und Kontakten zuordnen, aus der Anwendung antworten.">
        {darfSenden && (
          <Link href={`/postfach?${neuParameter.toString()}`} className={buttonKlassen({ variante: "primaer", groesse: "klein" })}>
            Neue Nachricht
          </Link>
        )}
        <Link href="/einstellungen/postfaecher" className="text-[13px] text-akzent hover:underline">Postfächer verwalten</Link>
      </Seitenkopf>

      {postfaecher.some((pf) => pf.status === "fehler") && (
        <Hinweis ton="warnung" className="mb-4">
          Mindestens ein Postfach meldet einen Fehler:{" "}
          {postfaecher.filter((pf) => pf.status === "fehler").map((pf) => `${pf.adresse} — ${pf.fehler_text ?? "unbekannt"}`).join(" · ")}
        </Hinweis>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Karte className="overflow-hidden">
          <form method="get" action="/postfach" className="grid gap-2 border-b border-linie p-3 sm:grid-cols-[1fr_auto]">
            <Eingabe name="suche" type="search" placeholder="Betreff, Absender oder Text durchsuchen" defaultValue={p.suche ?? ""} aria-label="Suche" />
            <button type="submit" className={buttonKlassen({ variante: "sekundaer", groesse: "standard" })}>Suchen</button>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-gedaempft sm:col-span-2">
              {postfaecher.length > 1 && (
                <Auswahl name="postfach" defaultValue={p.postfach ?? ""} className="h-8 w-auto py-1 text-[12px]" aria-label="Postfach">
                  <option value="">Alle Postfächer</option>
                  {postfaecher.map((pf) => (
                    <option key={pf.id} value={pf.id}>{pf.anzeigename ?? pf.adresse}</option>
                  ))}
                </Auswahl>
              )}
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" name="ungelesen" value="1" defaultChecked={p.ungelesen === "1"} /> nur ungelesene
              </label>
            </div>
          </form>
          <div className="max-h-[70vh] overflow-y-auto">
            <Nachrichtenliste nachrichten={nachrichten} postfaecher={postfaecher} aktiveId={detail?.id ?? null} parameter={parameter} />
          </div>
        </Karte>

        <Karte className="p-5">
          {p.neu === "1" && darfSenden ? (
            <NeueNachricht postfaecher={postfaecher} an={p.an} />
          ) : detail ? (
            <NachrichtDetail
              nachricht={detail}
              anhaenge={anhaenge}
              objekt={objektVon(detail.objekt_id)}
              kontakt={kontaktVon(detail.kontakt_id)}
              vorschlag={objektVon(detail.objekt_vorschlag_id)}
              objekte={objekte}
              kontakte={kontakte}
              postfaecher={postfaecher}
              darfSenden={darfSenden}
              darfAendern={darfAendern}
              kiVerfuegbar={kiVerfuegbar()}
            />
          ) : (
            <p className="py-12 text-center text-[13px] text-gedaempft">Nachricht auswählen, um sie zu lesen, zuzuordnen oder zu beantworten.</p>
          )}
        </Karte>
      </div>
    </>
  );
}
