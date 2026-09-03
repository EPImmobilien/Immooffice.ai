import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, Poppins } from "next/font/google";

import "./globals.css";
import "./schriften.css";

/**
 * Schriften werden ueber next/font zur Bauzeit heruntergeladen und danach vom
 * eigenen Server ausgeliefert. Damit entsteht zur Laufzeit KEINE Verbindung zu
 * einem fremden Font-CDN — die IP-Adresse der Nutzerinnen und Nutzer wird nicht
 * an Dritte uebertragen (Master-Prompt Abschnitt 16).
 *
 * Poppins traegt die Wortmarke und damit alle Ueberschriften; Inter ist fuer
 * Fliesstext, Formulare und Tabellen deutlich ruhiger zu lesen.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--schrift-titel",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--schrift-text",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ImmoOffice.ai",
    template: "%s · ImmoOffice.ai",
  },
  description:
    "Maklersoftware für Immobilienmakler und Immobiliensachverständige: Objekte, " +
    "Kontakte, Exposés, Wertermittlung und Portalexport in einer Anwendung.",
  applicationName: "ImmoOffice.ai",
  icons: {
    icon: "/marke/immooffice-icon-dunkel.svg",
  },
  // Standardmaessig nicht indexieren: die Anwendung ist ein geschlossener
  // Arbeitsbereich. Oeffentliche Web-Exposés setzen ihre Robots-Angabe selbst.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1A30" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Der Farbmodus wird ohne JavaScript entschieden (siehe globals.css): ohne
 * ausdrueckliche Wahl gilt die Systemeinstellung. Deshalb gibt es hier kein
 * blockierendes Skript und trotzdem kein Aufblitzen des Hellmodus.
 * `suppressHydrationWarning` deckt das data-modus-Attribut ab, das der
 * Umschalter zur Laufzeit setzt.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Die Nonce der Content-Security-Policy wird von src/middleware.ts gesetzt.
  // Dieser Zugriff ist bewusst: Er macht die Seiten dynamisch, und nur dann
  // kann Next seine eigenen Inline-Skripte mit der Nonce versehen. Statisch
  // erzeugte Seiten koennen keine anfragebezogene Nonce tragen — ihre Skripte
  // wuerden von der Policy blockiert und die Anwendung nie hydratisieren.
  // Oeffentliche Web-Exposés erhalten in Phase 1 eine eigene, statisch
  // auslieferbare Policy (siehe ARCHITECTURE.md).
  await headers();

  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${poppins.variable} ${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
