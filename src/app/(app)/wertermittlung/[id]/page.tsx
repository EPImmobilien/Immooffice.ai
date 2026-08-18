import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Einordnung } from "@/components/wertermittlung/Einordnung";
import { Rechenblatt, Zahlenfeld } from "@/components/wertermittlung/Rechenblatt";
import { Vergleichsobjekte } from "@/components/wertermittlung/Vergleichsobjekte";
import { buttonKlassen } from "@/components/ui/Button";
import { Hinweis } from "@/components/ui/Status";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum, euro } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import {
  PFLICHTHINWEIS,
  VERFAHREN,
  ertragswert,
  sachwert,
  spanne,
  vergleichswert,
  type ErtragsEingabe,
  type SachwertEingabe,
  type Verfahren,
  type VergleichsEingabe,
} from "@/lib/wertermittlung";

export const metadata: Metadata = { title: "Wertermittlung" };

/** Liest eine Zahl aus den gespeicherten Ansätzen. */
function z(quelle: Record<string, unknown>, feld: string): number | null {
  const wert = quelle[feld];
  return typeof wert === "number" && Number.isFinite(wert) ? wert : null;
}

export default async function RechenblattSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  const { data } = await supabase
    .from("wertermittlungen")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const darfAendern = hatRecht(
    sitzung.rolle,
    "wertermittlung",
    "aendern",
    sitzung.uebersteuerung,
  );

  const vergleichRoh = (data.vergleich ?? {}) as Record<string, unknown>;
  const ertragRoh = (data.ertrag ?? {}) as Record<string, unknown>;
  const sachwertRoh = (data.sachwert ?? {}) as Record<string, unknown>;

  const vergleichEingabe: VergleichsEingabe = {
    wohnflaeche: z(vergleichRoh, "wohnflaeche"),
    objekte: Array.isArray(vergleichRoh["objekte"])
      ? (vergleichRoh["objekte"] as VergleichsEingabe["objekte"])
      : [],
  };

  const ertragEingabe: ErtragsEingabe = {
    jahresrohertrag: z(ertragRoh, "jahresrohertrag"),
    bewirtschaftungsquote: z(ertragRoh, "bewirtschaftungsquote"),
    bodenwert: z(ertragRoh, "bodenwert"),
    liegenschaftszins: z(ertragRoh, "liegenschaftszins"),
    restnutzungsdauer: z(ertragRoh, "restnutzungsdauer"),
  };

  const sachwertEingabe: SachwertEingabe = {
    bruttogrundflaeche: z(sachwertRoh, "bruttogrundflaeche"),
    herstellungskostenProQm: z(sachwertRoh, "herstellungskostenProQm"),
    gesamtnutzungsdauer: z(sachwertRoh, "gesamtnutzungsdauer"),
    alter: z(sachwertRoh, "alter"),
    bodenwert: z(sachwertRoh, "bodenwert"),
    aussenanlagen: z(sachwertRoh, "aussenanlagen"),
    sachwertfaktor: z(sachwertRoh, "sachwertfaktor"),
  };

  const ergebnisVergleich = vergleichswert(vergleichEingabe);
  const ergebnisErtrag = ertragswert(ertragEingabe);
  const ergebnisSachwert = sachwert(sachwertEingabe);

  const bandbreite = spanne([
    ergebnisVergleich.wert,
    ergebnisErtrag.wert,
    ergebnisSachwert.wert,
  ]);

  const fuehrend = data.fuehrendes_verfahren as Verfahren | null;
  const fuehrenderWert =
    fuehrend === "vergleichswert"
      ? ergebnisVergleich.wert
      : fuehrend === "ertragswert"
        ? ergebnisErtrag.wert
        : fuehrend === "sachwert"
          ? ergebnisSachwert.wert
          : null;

  return (
    <>
      <Seitenkopf
        titel={data.bezeichnung}
        beschreibung={`Stichtag ${datum(data.stichtag)}`}
      >
        <Link
          href="/wertermittlung"
          className={buttonKlassen({ variante: "sekundaer" })}
        >
          Zur Übersicht
        </Link>
      </Seitenkopf>

      {/* Der Pflichthinweis steht oben und nicht im Kleingedruckten: Er ist
          keine Fussnote, sondern die Einordnung des gesamten Blattes. */}
      <Hinweis ton="warnung" className="mb-5" titel="Was diese Rechnung ist">
        {PFLICHTHINWEIS}
      </Hinweis>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
          <p className="text-[11px] uppercase tracking-[0.08em] text-gedaempft">
            Bandbreite der gerechneten Verfahren
          </p>
          {bandbreite ? (
            <p className="zahl mt-1 text-[20px] font-semibold text-text">
              {euro(bandbreite.von)}
              {bandbreite.von !== bandbreite.bis && ` – ${euro(bandbreite.bis)}`}
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-gedaempft">
              Noch kein Verfahren vollständig
            </p>
          )}
          <p className="mt-1 text-[12px] text-gedaempft">
            Bewusst kein Durchschnitt: Welches Verfahren trägt, ist eine
            fachliche Entscheidung — keine Rechenoperation.
          </p>
        </div>

        <div className="rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
          <p className="text-[11px] uppercase tracking-[0.08em] text-gedaempft">
            Führendes Verfahren
          </p>
          {fuehrend && fuehrenderWert !== null ? (
            <>
              <p className="zahl mt-1 text-[20px] font-semibold text-text">
                {euro(fuehrenderWert)}
              </p>
              <p className="mt-1 text-[12px] text-gedaempft">
                {VERFAHREN[fuehrend]}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-gedaempft">
              {fuehrend
                ? `${VERFAHREN[fuehrend]} gewählt, aber noch nicht rechenbar`
                : "Noch nicht festgelegt"}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <Rechenblatt
          wertermittlungId={data.id}
          verfahren="vergleichswert"
          titel="Vergleichswertverfahren"
          grundlage="Für selbstgenutzte Wohnungen und Einfamilienhäuser das führende Verfahren, sofern genügend vergleichbare Verkäufe vorliegen."
          ergebnis={ergebnisVergleich}
          darfAendern={darfAendern}
        >
          <Zahlenfeld
            name="vw_wohnflaeche"
            beschriftung="Wohnfläche des Objekts"
            einheit="m²"
            wert={vergleichEingabe.wohnflaeche}
          />
          <Vergleichsobjekte objekte={vergleichEingabe.objekte} />
        </Rechenblatt>

        <Rechenblatt
          wertermittlungId={data.id}
          verfahren="ertragswert"
          titel="Ertragswertverfahren"
          grundlage="Für vermietete Objekte und Anlageimmobilien. Zinssatz und Bewirtschaftungsquote stammen aus der Sammlung des örtlichen Gutachterausschusses."
          ergebnis={ergebnisErtrag}
          darfAendern={darfAendern}
        >
          <Zahlenfeld
            name="jahresrohertrag"
            beschriftung="Jahresrohertrag"
            einheit="€"
            wert={ertragEingabe.jahresrohertrag}
            hinweis="Nachhaltig erzielbare Nettokaltmiete, nicht die aktuelle"
          />
          <Zahlenfeld
            name="bewirtschaftungsquote"
            beschriftung="Bewirtschaftungskosten"
            einheit="% des Rohertrags"
            wert={ertragEingabe.bewirtschaftungsquote}
          />
          <Zahlenfeld
            name="bodenwert"
            beschriftung="Bodenwert"
            einheit="€"
            wert={ertragEingabe.bodenwert}
            hinweis="Bodenrichtwert × Grundstücksfläche"
          />
          <Zahlenfeld
            name="liegenschaftszins"
            beschriftung="Liegenschaftszinssatz"
            einheit="%"
            wert={ertragEingabe.liegenschaftszins}
          />
          <Zahlenfeld
            name="restnutzungsdauer"
            beschriftung="Restnutzungsdauer"
            einheit="Jahre"
            wert={ertragEingabe.restnutzungsdauer}
            schritt="1"
          />
        </Rechenblatt>

        <Rechenblatt
          wertermittlungId={data.id}
          verfahren="sachwert"
          titel="Sachwertverfahren"
          grundlage="Für eigengenutzte Objekte ohne ausreichende Vergleiche. Der Sachwertfaktor kommt vom Gutachterausschuss; ohne ihn bleibt der Wert unangepasst."
          ergebnis={ergebnisSachwert}
          darfAendern={darfAendern}
        >
          <Zahlenfeld
            name="bruttogrundflaeche"
            beschriftung="Bruttogrundfläche"
            einheit="m²"
            wert={sachwertEingabe.bruttogrundflaeche}
          />
          <Zahlenfeld
            name="herstellungskostenProQm"
            beschriftung="Herstellungskosten"
            einheit="€ / m² BGF"
            wert={sachwertEingabe.herstellungskostenProQm}
          />
          <Zahlenfeld
            name="gesamtnutzungsdauer"
            beschriftung="Gesamtnutzungsdauer"
            einheit="Jahre"
            wert={sachwertEingabe.gesamtnutzungsdauer}
            schritt="1"
            hinweis="Bei Wohngebäuden üblicherweise 70 bis 80"
          />
          <Zahlenfeld
            name="alter"
            beschriftung="Alter des Gebäudes"
            einheit="Jahre"
            wert={sachwertEingabe.alter}
            schritt="1"
          />
          <Zahlenfeld
            name="sw_bodenwert"
            beschriftung="Bodenwert"
            einheit="€"
            wert={sachwertEingabe.bodenwert}
          />
          <Zahlenfeld
            name="aussenanlagen"
            beschriftung="Außenanlagen"
            einheit="€"
            wert={sachwertEingabe.aussenanlagen}
            hinweis="Optional"
          />
          <Zahlenfeld
            name="sachwertfaktor"
            beschriftung="Sachwertfaktor"
            wert={sachwertEingabe.sachwertfaktor}
            hinweis="Optional; ohne Angabe wird 1,0 gerechnet"
          />
        </Rechenblatt>

        <Einordnung
          wertermittlungId={data.id}
          fuehrend={fuehrend}
          notiz={data.notiz}
          darfAendern={darfAendern}
        />
      </div>
    </>
  );
}
