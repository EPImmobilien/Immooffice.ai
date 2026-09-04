import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";

export const metadata: Metadata = { title: "Werkzeuge" };

const WERKZEUGE = [
  { pfad: "/werkzeuge/bild-editor", titel: "Bild-Editor", text: "Zuschneiden, Größe, Drehen, Helligkeit/Kontrast/Sättigung, Weichzeichnen oder Verpixeln (Nummernschilder, Gesichter), Text und Logo, Vorher/Nachher — RAW-Dateien (ARW, CR2, NEF, DNG …) werden im Browser entwickelt. KI: Himmel, Störendes entfernen, Home Staging, Optimierung. Als neue Version am Objekt speichern." },
  { pfad: "/werkzeuge/pdf", titel: "PDF-Werkzeuge", text: "Zusammenfügen, teilen, Seiten drehen/löschen/umsortieren, komprimieren, schwärzen (Namen, IBAN, Telefon automatisch finden) — alles im Browser, Dateien verlassen ihn nicht." },
  { pfad: "/werkzeuge/grundriss", titel: "Grundriss-Editor & Aufbereiter", text: "Wände, Türen, Fenster, Räume mit Fläche, Möbel, Maßketten — neu zeichnen, einen vorhandenen Plan hinterlegen und nachzeichnen oder einen Raumscan (RoomPlan-Datei) importieren. Export als PNG/SVG, Ablage als Objektbild." },
  { pfad: "/werkzeuge/wohnflaeche", titel: "Wohnflächenrechner", text: "Wohnfläche nach WoFlV: Räume, Teilflächen, Dachschrägen, Balkone, Abzüge; PDF-Nachweis; Übernahme ins Objekt; Räume aus dem Grundriss." },
];

/** Werkzeugkasten (Referenz-Kachel 12 und 13). Energieausweis auslesen und Entfernungen finden Sie direkt auf der Objektseite. */
export default async function WerkzeugeSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "lesen", sitzung.uebersteuerung);
  return (
    <>
      <Seitenkopf titel="Werkzeuge" beschreibung="Bild, PDF, Grundriss und Wohnfläche — Energieausweis auslesen und Infrastruktur-Entfernungen finden Sie auf der jeweiligen Objektseite." />
      <div className="grid gap-4 sm:grid-cols-2">
        {WERKZEUGE.map((w) => (
          <Link key={w.pfad} href={w.pfad} className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5 transition-colors hover:border-akzent/50">
            <p className="font-titel text-[16px] font-semibold text-text">{w.titel}</p>
            <p className="mt-1 text-[13px] text-gedaempft">{w.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
