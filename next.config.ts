import type { NextConfig } from "next";

/**
 * Die Sicherheits-Kopfzeilen inklusive Content-Security-Policy setzt
 * src/middleware.ts — sie braucht je Anfrage eine frische Nonce und laesst
 * sich deshalb hier nicht statisch definieren. Schriften werden selbst
 * gehostet; ein fremder Font-CDN ist bewusst nirgends erlaubt.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

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
