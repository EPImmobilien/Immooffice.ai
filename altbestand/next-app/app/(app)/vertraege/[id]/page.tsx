import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { VertragBearbeiten } from "@/components/vertraege/VertragBearbeiten";
import { buttonKlassen } from "@/components/ui/Button";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum, zeitpunkt } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import {
  MUSTER_HINWEIS,
  SIGNATUR_EINORDNUNG,
  VERTRAGSARTEN,
  VERTRAGSSTATUS,
  textUnveraendert,
  widerrufMoeglich,
  widerrufsfrist,
  type Unterzeichnung,
  type Vertragsart,
  type Vertragsstatus,
} from "@/lib/vertraege";
import { basisUrlErmitteln } from "@/lib/web-expose";

export const metadata: Metadata = { title: "Vertrag" };

export default async function VertragSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  const { data } = await supabase
    .from("vertraege")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const darfAendern = hatRecht(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung);
  const darfFreigeben = hatRecht(sitzung.rolle, "vertraege", "freigeben", sitzung.uebersteuerung);

  const unterschriften = (
    Array.isArray(data.unterzeichnungen) ? data.unterzeichnungen : []
  ) as Unterzeichnung[];

  const unveraendert = await textUnveraendert(data.inhalt, unterschriften);

  const frist = data.geschlossen_am
    ? widerrufsfrist(data.geschlossen_am, data.verbraucher, data.belehrt_am)
    : null;
  const nochWiderrufbar = widerrufMoeglich(frist, new Date());

  const basis = basisUrlErmitteln(await headers());
  const link = data.token ? `${basis}/vertrag/${data.token}` : null;

  const status = data.status as Vertragsstatus;

  return (
    <>
      <Seitenkopf
        titel={data.titel}
        beschreibung={VERTRAGSARTEN[data.art as Vertragsart]}
      >
        <Link href="/vertraege" className={buttonKlassen({ variante: "sekundaer" })}>
          Zur Übersicht
        </Link>
      </Seitenkopf>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Marke
          ton={
            status === "unterzeichnet"
              ? "erfolg"
              : status === "versendet"
                ? "info"
                : status === "widerrufen" || status === "abgelehnt"
                  ? "fehler"
                  : "neutral"
          }
        >
          {VERTRAGSSTATUS[status]}
        </Marke>
        {unterschriften.length > 0 && (
          <Marke>
            {unterschriften.length}{" "}
            {unterschriften.length === 1 ? "Unterschrift" : "Unterschriften"}
          </Marke>
        )}
      </div>

      <Hinweis ton="warnung" className="mb-5" titel="Was diese Unterschrift ist">
        {SIGNATUR_EINORDNUNG}
      </Hinweis>

      {unveraendert === false && (
        <Hinweis ton="fehler" className="mb-5" titel="Text weicht ab">
          Der gespeicherte Text stimmt nicht mehr mit dem überein, was
          unterzeichnet wurde. Das ist ein Hinweis auf eine versehentliche
          Änderung — ein kryptografischer Manipulationsschutz ist es nicht.
        </Hinweis>
      )}

      {frist && (
        <Hinweis
          ton={frist.regulaer ? "info" : "warnung"}
          className="mb-5"
          titel="Widerrufsrecht"
        >
          {frist.regulaer ? (
            <>
              Die Widerrufsfrist von vierzehn Tagen endet am{" "}
              <strong>{datum(frist.endet)}</strong>
              {nochWiderrufbar ? " — sie läuft noch." : " — sie ist abgelaufen."}
            </>
          ) : (
            <>
              Es ist kein Datum der Widerrufsbelehrung hinterlegt. Ohne
              ordnungsgemäße Belehrung erlischt das Widerrufsrecht nach § 356
              Absatz 3 Satz 2 BGB erst am{" "}
              <strong>{datum(frist.endet)}</strong> — zwölf Monate und vierzehn
              Tage nach Vertragsschluss. Bis dahin besteht das Risiko, den
              Provisionsanspruch zu verlieren.
            </>
          )}
        </Hinweis>
      )}

      <div className="space-y-5">
        <VertragBearbeiten
          vertragId={data.id}
          titel={data.titel}
          inhalt={data.inhalt}
          verbraucher={data.verbraucher}
          belehrtAm={data.belehrt_am}
          geschlossenAm={data.geschlossen_am}
          gesperrt={unterschriften.length > 0}
          status={status}
          link={link}
          darfAendern={darfAendern}
          darfFreigeben={darfFreigeben}
        />

        {unterschriften.length > 0 && (
          <Karte>
            <KarteKopf>
              <KarteTitel>Unterschriften</KarteTitel>
              <KarteBeschreibung>
                Festgehalten sind Name, E-Mail, Zeitpunkt und der Fingerabdruck
                des Textes, wie er zum Zeitpunkt der Unterschrift lautete.
              </KarteBeschreibung>
            </KarteKopf>
            <KarteInhalt>
              <ul className="divide-y divide-linie">
                {unterschriften.map((u, i) => (
                  <li key={i} className="py-3">
                    <p className="text-[14px] text-text">{u.name}</p>
                    <p className="mt-0.5 text-[12px] text-gedaempft">
                      {u.email} · {zeitpunkt(u.unterzeichnet_am)}
                    </p>
                    <p className="zahl mt-1 truncate text-[11px] text-gedaempft">
                      {u.dokument_hash}
                    </p>
                  </li>
                ))}
              </ul>
            </KarteInhalt>
          </Karte>
        )}

        <Hinweis ton="warnung">{MUSTER_HINWEIS}</Hinweis>
      </div>
    </>
  );
}
