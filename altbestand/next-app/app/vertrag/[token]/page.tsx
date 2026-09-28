import type { Metadata } from "next";

import { Unterschrift } from "./Unterschrift";
import { serverClient } from "@/lib/supabase/server";
import { SIGNATUR_EINORDNUNG, VERTRAGSARTEN, type Vertragsart } from "@/lib/vertraege";

export const metadata: Metadata = {
  title: "Vertrag unterzeichnen",
  // Ein Vertrag gehört nicht in eine Suchmaschine.
  robots: { index: false, follow: false },
};

interface Antwort {
  zustand: "ok" | "unbekannt";
  titel?: string;
  art?: Vertragsart;
  inhalt?: string;
  status?: string;
  bereits_unterzeichnet?: boolean;
  anbieter?: Record<string, string | null> | null;
}

function textOder(wert: unknown, ersatz = ""): string {
  return typeof wert === "string" && wert !== "" ? wert : ersatz;
}

export default async function VertragUnterzeichnenSeite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await serverClient();
  const { data } = await supabase.rpc("vertrag_oeffnen", { p_token: token });
  const antwort = (data ?? { zustand: "unbekannt" }) as Antwort;

  if (antwort.zustand !== "ok") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16 text-center">
        <h1 className="text-lg font-semibold text-text">
          Vertrag nicht verfügbar
        </h1>
        <p className="mt-2 text-[13px] text-gedaempft">
          Dieser Link ist ungültig oder wurde zurückgezogen.
        </p>
        <p className="mt-6 text-[12px] text-gedaempft">
          Bitte wenden Sie sich an den Absender.
        </p>
      </main>
    );
  }

  const anbieter = antwort.anbieter ?? {};
  const firmenname = textOder(anbieter["firmenname"], "Der Anbieter");
  const widerruf = textOder(anbieter["widerrufsbelehrung"]);
  const impressum = textOder(anbieter["impressum"]);

  return (
    <div className="min-h-dvh bg-hintergrund">
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <p className="text-[12px] uppercase tracking-[0.12em] text-gedaempft">
          {firmenname}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-text">{antwort.titel}</h1>
        <p className="mt-1 text-[13px] text-gedaempft">
          {antwort.art ? VERTRAGSARTEN[antwort.art] : "Vertrag"}
        </p>

        <section className="mt-6 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5 sm:p-7">
          <pre className="font-sans text-[13.5px] leading-relaxed whitespace-pre-wrap text-text">
            {antwort.inhalt}
          </pre>
        </section>

        {widerruf && (
          <section className="mt-5 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
            <h2 className="text-[15px] font-semibold text-text">
              Widerrufsbelehrung
            </h2>
            <pre className="mt-2 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-gedaempft">
              {widerruf}
            </pre>
          </section>
        )}

        {antwort.bereits_unterzeichnet ? (
          <div className="mt-6 rounded-[var(--radius-gross)] border border-erfolg/30 bg-erfolg-schwach p-5">
            <p className="text-[14px] font-medium text-erfolg">
              Dieser Vertrag wurde bereits unterzeichnet.
            </p>
            <p className="mt-1 text-[13px] text-gedaempft">
              Eine Kopie erhalten Sie vom Absender. Bewahren Sie sie zusammen mit
              der Widerrufsbelehrung auf.
            </p>
          </div>
        ) : (
          <Unterschrift token={token} firmenname={firmenname} />
        )}

        {/* Die Einordnung steht auf der Seite, auf der unterschrieben wird —
            nicht nur intern. Wer unterzeichnet, soll wissen, was er tut. */}
        <p className="mt-6 text-[12px] text-gedaempft">{SIGNATUR_EINORDNUNG}</p>

        {impressum && (
          <footer className="mt-8 border-t border-linie pt-6 text-[12px] text-gedaempft">
            <pre className="font-sans whitespace-pre-wrap">{impressum}</pre>
          </footer>
        )}
      </main>
    </div>
  );
}
