import type { NextConfig } from "next";

/**
 * Die Sicherheits-Kopfzeilen inklusive Content-Security-Policy setzt
 * src/middleware.ts — sie braucht je Anfrage eine frische Nonce und laesst
 * sich deshalb hier nicht statisch definieren. Schriften werden selbst
 * gehostet; ein fremder Font-CDN ist bewusst nirgends erlaubt.
 */
/**
 * Zu den Schriften der PDF-Erzeugung steht hier absichtlich nichts.
 *
 * Der naheliegende Eintrag waere `outputFileTracingIncludes`, um die
 * .woff-Dateien aus @fontsource in das Funktionsbuendel zu holen. Er wirkt
 * hier nicht: Next wendet diese Liste nur auf webpack-Eintraege an, gebaut
 * wird aber mit Turbopack. Nachgeprueft an den erzeugten .nft.json-Dateien —
 * sie blieben ohne jede Schriftdatei, obwohl der Eintrag gesetzt war.
 *
 * Die Schriften sind deshalb als Base64 Teil des Quelltexts; sie koennen
 * schon im Ansatz nicht fehlen. Siehe src/lib/expose/schriften.ts.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Der Bild-Editor schickt bearbeitete Bilder (bis 4000 px, JPEG) als
  // Server-Action; die Vorgabe von 1 MB reicht dafuer nicht.
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },

  // Deutsch ist die Ausgangssprache. Die Struktur bleibt fuer eine spaetere
  // Internationalisierung offen (Abschnitt 3), ohne sie jetzt zu aktivieren.
  env: {
    NEXT_PUBLIC_STANDARDSPRACHE: "de",
  },

  async headers() {
    return [
      {
        // Gilt auch fuer statische Dateien, die die Middleware bewusst
        // auslaesst.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
