"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";

import { Einladungen, type EinladungZeile } from "@/components/einstellungen/Einladungen";
import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import type { OnboardingBranding } from "@/app/onboarding/[schritt]/page";
import { istHexfarbe, kontrastPruefen, paletteAbleiten } from "@/lib/branding/farben";
import { SCHRIFTEN, schrift, schriftenNachKategorie } from "@/lib/branding/schriften";
import { LOGO_MAX_BYTES, LOGO_MIME, MARKE_BUCKET, logoPfad, markeUrl } from "@/lib/marke";
import { LETZTER_SCHRITT, SCHRITTE, type SchrittNr } from "@/lib/onboarding";
import { browserClient } from "@/lib/supabase/browser";
import { logoEntfernen, logoErfassen } from "@/server/einstellungen-aktionen";
import {
  onboardingSchrittSpeichern,
  onboardingUeberspringen,
  type OnboardingErgebnis,
} from "@/server/onboarding-aktionen";

const VORGABE_PRIMAER = "#1B2A47";
const VORGABE_AKZENT = "#B5934F";

/**
 * Formular eines Onboarding-Schritts. Ein Bauteil fuer alle acht Schritte,
 * weil Rahmen, Schaltflaechen und Fehlerbehandlung gleich sind und nur die
 * Felder wechseln.
 */
export function OnboardingFormular({
  schritt,
  branding,
  einladungen,
  mandantId,
  supabaseUrl,
  firmenname,
}: {
  schritt: SchrittNr;
  branding: OnboardingBranding | null;
  einladungen: EinladungZeile[];
  mandantId: string;
  supabaseUrl: string;
  firmenname: string;
}) {
  const [zustand, aktion, laeuft] = useActionState<OnboardingErgebnis, FormData>(
    onboardingSchrittSpeichern,
    {},
  );
  const eintrag = SCHRITTE.find((s) => s.nr === schritt)!;
  const letzter = schritt === LETZTER_SCHRITT;

  return (
    <div className="space-y-6 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-6">
      {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}

      {schritt === 4 ? (
        <LogoSchritt branding={branding} mandantId={mandantId} supabaseUrl={supabaseUrl} />
      ) : schritt === 8 ? (
        <Einladungen einladungen={einladungen} eigeneRolle="inhaber" />
      ) : null}

      <form action={aktion} className="space-y-5">
        <input type="hidden" name="schritt" value={schritt} />

        {schritt === 1 && <Firmierung b={branding} />}
        {schritt === 2 && <Anschrift b={branding} />}
        {schritt === 3 && <Impressum b={branding} />}
        {schritt === 5 && <Farben b={branding} firmenname={firmenname} />}
        {schritt === 6 && <Schriften b={branding} firmenname={firmenname} />}
        {schritt === 7 && <Signatur b={branding} firmenname={firmenname} />}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-5">
          <div className="flex gap-2">
            {schritt > 1 && (
              <Link
                href={`/onboarding/${schritt - 1}`}
                className="inline-flex h-10 items-center rounded-[var(--radius)] border border-linie-stark bg-flaeche px-4 text-sm font-medium text-text hover:bg-flaeche-gedaempft"
              >
                Zurück
              </Link>
            )}
          </div>
          <div className="flex gap-2">
            {!eintrag.pflicht && (
              <Button
                type="submit"
                variante="leise"
                formAction={onboardingUeberspringen}
                formNoValidate
                disabled={laeuft}
              >
                {letzter ? "Ohne Einladung abschließen" : "Überspringen"}
              </Button>
            )}
            <Button type="submit" laedt={laeuft}>
              {letzter ? "Einrichtung abschließen" : "Speichern und weiter"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// --- Schritt 1 ---------------------------------------------------------------

function Firmierung({ b }: { b: OnboardingBranding | null }) {
  return (
    <div className="space-y-4">
      <Feld beschriftung="Firmenname" id="o-firmenname" pflicht hinweis="So, wie er im Impressum steht.">
        <Eingabe name="firmenname" defaultValue={b?.firmenname ?? ""} maxLength={200} autoFocus placeholder="Musterstadt Immobilien GmbH" />
      </Feld>
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Rechtsform" id="o-rechtsform" hinweis="Optional">
          <Eingabe name="rechtsform" defaultValue={b?.rechtsform ?? ""} maxLength={60} placeholder="GmbH, e. K., GbR …" />
        </Feld>
        <Feld beschriftung="Vertretungsberechtigte Person" id="o-gf" hinweis="Optional, für das Impressum">
          <Eingabe name="geschaeftsfuehrer" defaultValue={b?.geschaeftsfuehrer ?? ""} maxLength={200} />
        </Feld>
      </div>
    </div>
  );
}

// --- Schritt 2 ---------------------------------------------------------------

function Anschrift({ b }: { b: OnboardingBranding | null }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-3">
          <Feld beschriftung="Straße" id="o-strasse" pflicht>
            <Eingabe name="strasse" defaultValue={b?.strasse ?? ""} autoFocus />
          </Feld>
        </div>
        <Feld beschriftung="Nummer" id="o-hausnummer">
          <Eingabe name="hausnummer" defaultValue={b?.hausnummer ?? ""} />
        </Feld>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Feld beschriftung="PLZ" id="o-plz" pflicht hinweis="Fünf Ziffern">
          <Eingabe name="plz" defaultValue={b?.plz ?? ""} inputMode="numeric" pattern="[0-9]{5}" maxLength={5} className="zahl" />
        </Feld>
        <div className="sm:col-span-3">
          <Feld beschriftung="Ort" id="o-ort" pflicht>
            <Eingabe name="ort" defaultValue={b?.ort ?? ""} />
          </Feld>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Feld beschriftung="Telefon" id="o-telefon">
          <Eingabe name="telefon" type="tel" defaultValue={b?.telefon ?? ""} />
        </Feld>
        <Feld beschriftung="E-Mail" id="o-email" pflicht>
          <Eingabe name="email" type="email" defaultValue={b?.email ?? ""} />
        </Feld>
        <Feld beschriftung="Website" id="o-web">
          <Eingabe name="web" defaultValue={b?.web ?? ""} placeholder="www.beispiel.de" />
        </Feld>
      </div>
    </div>
  );
}

// --- Schritt 3 ---------------------------------------------------------------

function Impressum({ b }: { b: OnboardingBranding | null }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Handelsregister" id="o-hr" hinweis="Gericht und Nummer, etwa „Amtsgericht Kiel, HRB 12345“">
          <Eingabe name="handelsregister" defaultValue={b?.handelsregister ?? ""} maxLength={120} autoFocus />
        </Feld>
        <Feld beschriftung="USt-IdNr." id="o-ust" hinweis="Etwa DE123456789 — nur Format wird geprüft">
          <Eingabe name="ust_id" defaultValue={b?.ust_id ?? ""} maxLength={14} className="zahl" placeholder="DE123456789" />
        </Feld>
      </div>
      <Feld
        beschriftung="Erlaubnisbehörde nach § 34c GewO"
        id="o-behoerde"
        hinweis="Die Behörde, die die Gewerbeerlaubnis erteilt hat. Wird nicht geprüft, nur ins Impressum übernommen."
      >
        <Eingabe name="aufsichtsbehoerde" defaultValue={b?.aufsichtsbehoerde ?? ""} maxLength={200} placeholder="Ordnungsamt der Stadt …" />
      </Feld>
      <Feld beschriftung="Impressum (Volltext)" id="o-impressum" hinweis="Optional — erscheint im Fußbereich veröffentlichter Web-Exposés. Ihre eigene Angabe, ohne rechtliche Prüfung.">
        <Textfeld name="impressum" rows={6} defaultValue={b?.impressum ?? ""} />
      </Feld>
    </div>
  );
}

// --- Schritt 4: Logo (speichert sofort, nicht ueber das Schrittformular) -------

function LogoSchritt({
  branding,
  mandantId,
  supabaseUrl,
}: {
  branding: OnboardingBranding | null;
  mandantId: string;
  supabaseUrl: string;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <LogoFeld
        variante="hell"
        titel="Logo für helle Flächen"
        hinweis="Pflichtfassung, wenn Sie ein Logo nutzen. Erscheint in Exposés, PDF und Web-Exposé."
        pfad={branding?.logo_pfad ?? null}
        mandantId={mandantId}
        supabaseUrl={supabaseUrl}
      />
      <LogoFeld
        variante="dunkel"
        titel="Logo für dunkle Flächen"
        hinweis="Optional. Fehlt es, wird die helle Fassung auf dunklem Grund mit weißer Fläche hinterlegt."
        pfad={branding?.logo_invers_pfad ?? null}
        mandantId={mandantId}
        supabaseUrl={supabaseUrl}
      />
    </div>
  );
}

/** Ein Logo-Feld mit Upload und Entfernen. Wird auch von den Einstellungen genutzt. */
export function LogoFeld({
  variante,
  titel,
  hinweis,
  pfad,
  mandantId,
  supabaseUrl,
}: {
  variante: "hell" | "dunkel";
  titel: string;
  hinweis: string;
  pfad: string | null;
  mandantId: string;
  supabaseUrl: string;
}) {
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler"; text: string } | null>(null);
  const [laeuft, starten] = useTransition();
  const dateiwahl = useRef<HTMLInputElement>(null);
  const url = pfad ? markeUrl(supabaseUrl, pfad) : null;

  async function hochladen(datei: File) {
    setMeldung(null);
    if (!(LOGO_MIME as readonly string[]).includes(datei.type)) {
      setMeldung({ ton: "fehler", text: "Erlaubt sind PNG, JPEG, WebP und SVG." });
      return;
    }
    if (datei.size > LOGO_MAX_BYTES) {
      setMeldung({ ton: "fehler", text: "Das Logo darf höchstens 2 MB groß sein." });
      return;
    }
    const supabase = browserClient();
    const ziel = logoPfad(mandantId, datei.name);
    const { error } = await supabase.storage.from(MARKE_BUCKET).upload(ziel, datei, { contentType: datei.type, upsert: false });
    if (error) {
      setMeldung({ ton: "fehler", text: "Das Logo konnte nicht hochgeladen werden." });
      return;
    }
    const ergebnis = await logoErfassen(ziel, variante);
    if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
    else if (ergebnis.hinweis) setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
    if (dateiwahl.current) dateiwahl.current.value = "";
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-text">{titel}</p>
      <div
        className={
          variante === "dunkel"
            ? "flex h-20 items-center justify-center rounded-[var(--radius)] border border-linie bg-primaer px-4"
            : "flex h-20 items-center justify-center rounded-[var(--radius)] border border-linie bg-white px-4"
        }
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- eigene Datei in wechselnden Formaten, auch SVG
          <img src={url} alt={titel} className="max-h-12" />
        ) : (
          <span className={variante === "dunkel" ? "text-[12px] text-white/70" : "text-[12px] text-gedaempft"}>
            Noch kein Logo
          </span>
        )}
      </div>
      <input
        ref={dateiwahl}
        type="file"
        accept={LOGO_MIME.join(",")}
        disabled={laeuft}
        aria-label={titel}
        onChange={(e) => {
          const datei = e.target.files?.[0];
          if (datei) starten(() => void hochladen(datei));
        }}
        className="w-full text-[13px] text-gedaempft file:mr-3 file:rounded-[var(--radius)] file:border file:border-linie-stark file:bg-flaeche file:px-3 file:py-1.5 file:text-[13px] file:text-text hover:file:border-akzent/50"
      />
      {url && (
        <form
          action={(daten) => {
            setMeldung(null);
            starten(async () => {
              await logoEntfernen(daten);
            });
          }}
        >
          <input type="hidden" name="variante" value={variante} />
          <Button type="submit" variante="leise" groesse="klein" disabled={laeuft}>
            Entfernen
          </Button>
        </form>
      )}
      <p className="text-[12px] text-gedaempft">{hinweis}</p>
      {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}
    </div>
  );
}

// --- Schritt 5: Farben mit Kontrastpruefung ------------------------------------

export function Farben({ b, firmenname }: { b: { farbe_primaer: string | null; farbe_akzent: string | null } | null; firmenname: string }) {
  const [primaer, setPrimaer] = useState(b?.farbe_primaer ?? VORGABE_PRIMAER);
  const [akzent, setAkzent] = useState(b?.farbe_akzent ?? VORGABE_AKZENT);

  const gueltig = istHexfarbe(primaer) && istHexfarbe(akzent);
  const befunde = useMemo(() => (gueltig ? kontrastPruefen(primaer, akzent) : []), [gueltig, primaer, akzent]);
  const palette = useMemo(() => (gueltig ? paletteAbleiten(primaer, akzent) : null), [gueltig, primaer, akzent]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Hauptfarbe" id="o-primaer" hinweis="Flächen, Titel, Preisbänder, Hauptschaltflächen">
          <div className="flex gap-2">
            <input type="color" value={istHexfarbe(primaer) ? primaer : VORGABE_PRIMAER} onChange={(e) => setPrimaer(e.target.value.toUpperCase())} aria-label="Hauptfarbe wählen" className="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius)] border border-linie-stark bg-flaeche" />
            <Eingabe name="farbe_primaer" value={primaer} onChange={(e) => setPrimaer(e.target.value)} maxLength={7} className="zahl" />
          </div>
        </Feld>
        <Feld beschriftung="Akzentfarbe" id="o-akzent" hinweis="Hervorhebungen, Linien, Verweise">
          <div className="flex gap-2">
            <input type="color" value={istHexfarbe(akzent) ? akzent : VORGABE_AKZENT} onChange={(e) => setAkzent(e.target.value.toUpperCase())} aria-label="Akzentfarbe wählen" className="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius)] border border-linie-stark bg-flaeche" />
            <Eingabe name="farbe_akzent" value={akzent} onChange={(e) => setAkzent(e.target.value)} maxLength={7} className="zahl" />
          </div>
        </Feld>
      </div>

      {befunde.map((befund) => (
        <Hinweis key={befund.stelle} ton="warnung">
          <span className="font-medium">{befund.stelle}:</span> Kontrast {befund.verhaeltnis.toFixed(1)} : 1, empfohlen
          mindestens {befund.mindestens} : 1 (WCAG AA).{" "}
          {befund.vorschlag && (
            <button
              type="button"
              className="ml-1 inline-flex items-center gap-1 underline underline-offset-2"
              onClick={() => (befund.ersetzt === "primaer" ? setPrimaer(befund.vorschlag!) : setAkzent(befund.vorschlag!))}
            >
              <span className="inline-block h-3 w-3 rounded-sm border border-linie" style={{ backgroundColor: befund.vorschlag }} />
              Vorschlag {befund.vorschlag} übernehmen
            </button>
          )}
        </Hinweis>
      ))}

      {palette && (
        <Vorschau firmenname={firmenname} primaer={palette.primaer} akzent={palette.akzent} textAufPrimaer={palette.textAufPrimaer} grund={palette.grund} linie={palette.linie} />
      )}
    </div>
  );
}

/** Live-Vorschau (B5): Exposé-Deckblatt, Social-Motiv, E-Mail-Kopf. */
function Vorschau({
  firmenname,
  primaer,
  akzent,
  textAufPrimaer,
  grund,
  linie,
  schriftSerifenlos,
  schriftSerifen,
}: {
  firmenname: string;
  primaer: string;
  akzent: string;
  textAufPrimaer: string;
  grund: string;
  linie: string;
  schriftSerifenlos?: string;
  schriftSerifen?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="overflow-hidden rounded-[var(--radius)] border" style={{ borderColor: linie }}>
        <div className="p-4" style={{ backgroundColor: primaer, color: textAufPrimaer, fontFamily: schriftSerifen }}>
          <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: akzent }}>{firmenname || "Ihr Unternehmen"}</p>
          <p className="mt-2 text-[15px] font-semibold leading-tight">Helle 3-Zimmer-Wohnung mit Südbalkon</p>
          <p className="mt-3 text-[13px]" style={{ color: akzent }}>349.000 €</p>
        </div>
        <p className="px-3 py-1.5 text-[11px] text-gedaempft">Exposé-Deckblatt</p>
      </div>
      <div className="overflow-hidden rounded-[var(--radius)] border" style={{ borderColor: linie }}>
        <div className="aspect-square p-4" style={{ backgroundColor: grund, fontFamily: schriftSerifenlos }}>
          <div className="flex h-full flex-col justify-between rounded-[var(--radius)] border-2 p-3" style={{ borderColor: akzent }}>
            <p className="text-[11px] font-semibold" style={{ color: primaer }}>NEU IM ANGEBOT</p>
            <p className="text-[13px] font-semibold leading-tight" style={{ color: primaer }}>Reihenhaus mit Garten, Kiel</p>
          </div>
        </div>
        <p className="px-3 py-1.5 text-[11px] text-gedaempft">Social-Motiv</p>
      </div>
      <div className="overflow-hidden rounded-[var(--radius)] border" style={{ borderColor: linie }}>
        <div className="p-4" style={{ fontFamily: schriftSerifenlos }}>
          <div className="h-1.5 rounded-full" style={{ backgroundColor: primaer }} />
          <p className="mt-3 text-[12px] text-text">Guten Tag,</p>
          <p className="mt-1 text-[12px] text-gedaempft">vielen Dank für Ihre Anfrage zur Wohnung …</p>
          <p className="mt-3 text-[12px] font-medium" style={{ color: akzent }}>{firmenname || "Ihr Unternehmen"}</p>
        </div>
        <p className="px-3 py-1.5 text-[11px] text-gedaempft">E-Mail</p>
      </div>
    </div>
  );
}

// --- Schritt 6: Schriften ---------------------------------------------------

export function Schriften({ b, firmenname }: { b: { schrift_serifenlos: string | null; schrift_serifen: string | null; farbe_primaer: string | null; farbe_akzent: string | null } | null; firmenname: string }) {
  const [serifenlos, setSerifenlos] = useState(schrift(b?.schrift_serifenlos, "serifenlos").schluessel);
  const [serifen, setSerifen] = useState(schrift(b?.schrift_serifen, "serifen").schluessel);
  const sans = schrift(serifenlos, "serifenlos");
  const serif = schrift(serifen, "serifen");
  const palette = paletteAbleiten(b?.farbe_primaer ?? VORGABE_PRIMAER, b?.farbe_akzent ?? VORGABE_AKZENT);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Serifenlose Schrift" id="o-sans" hinweis="Oberfläche, Tabellen, Fließtext">
          <Auswahl name="schrift_serifenlos" value={serifenlos} onChange={(e) => setSerifenlos(e.target.value)}>
            {schriftenNachKategorie("serifenlos").map((s) => (
              <option key={s.schluessel} value={s.schluessel}>{s.name}</option>
            ))}
          </Auswahl>
        </Feld>
        <Feld beschriftung="Serifenschrift" id="o-serif" hinweis="Titel in Exposés und Dokumenten">
          <Auswahl name="schrift_serifen" value={serifen} onChange={(e) => setSerifen(e.target.value)}>
            {schriftenNachKategorie("serifen").map((s) => (
              <option key={s.schluessel} value={s.schluessel}>{s.name}</option>
            ))}
          </Auswahl>
        </Feld>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Schriftprobe s={sans} />
        <Schriftprobe s={serif} />
      </div>

      <Vorschau
        firmenname={firmenname}
        primaer={palette.primaer}
        akzent={palette.akzent}
        textAufPrimaer={palette.textAufPrimaer}
        grund={palette.grund}
        linie={palette.linie}
        schriftSerifenlos={sans.familie}
        schriftSerifen={serif.familie}
      />

      <p className="text-[12px] text-gedaempft">
        Alle {SCHRIFTEN.length} Schriften stehen unter der SIL Open Font License und werden von
        ImmoOffice.ai selbst ausgeliefert — kein Aufruf fremder Schriftdienste.
      </p>
    </div>
  );
}

function Schriftprobe({ s }: { s: (typeof SCHRIFTEN)[number] }) {
  return (
    <div className="rounded-[var(--radius)] border border-linie p-4" style={{ fontFamily: s.familie }}>
      <p className="text-[20px] leading-tight text-text">Exposé · Wertermittlung · 349.000 €</p>
      <p className="mt-2 text-[13px] text-gedaempft">{s.name} — {s.charakter}</p>
    </div>
  );
}

// --- Schritt 7: Signatur -----------------------------------------------------

function Signatur({ b, firmenname }: { b: OnboardingBranding | null; firmenname: string }) {
  const vorgabe =
    b?.signatur_html ??
    [
      `<p><strong>${firmenname}</strong></p>`,
      `<p>${[b?.strasse, b?.hausnummer].filter(Boolean).join(" ")}${b?.plz || b?.ort ? ` · ${[b?.plz, b?.ort].filter(Boolean).join(" ")}` : ""}</p>`,
      `<p>${[b?.telefon ? `Tel. ${b.telefon}` : null, b?.email, b?.web].filter(Boolean).join(" · ")}</p>`,
    ].join("\n");
  const [html, setHtml] = useState(vorgabe);

  return (
    <div className="space-y-4">
      <Feld beschriftung="Signatur (HTML)" id="o-signatur" hinweis="Wird an E-Mails aus der Anwendung angehängt, wenn Sie das aktivieren. Skripte und Formulare werden entfernt.">
        <Textfeld name="signatur_html" rows={7} value={html} onChange={(e) => setHtml(e.target.value)} className="zahl text-[12px]" />
      </Feld>
      <div className="rounded-[var(--radius)] border border-linie p-4">
        <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-gedaempft">Vorschau</p>
        {/* Die Vorschau zeigt den eigenen, noch ungespeicherten Text des Nutzers.
            Gespeichert wird erst nach serverseitiger Bereinigung. */}
        <div className="prose prose-sm max-w-none text-[13px] text-text" dangerouslySetInnerHTML={{ __html: html.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "") }} />
      </div>
    </div>
  );
}
