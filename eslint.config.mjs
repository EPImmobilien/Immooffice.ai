import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint-Konfiguration (Flat Config).
 *
 * eslint-config-next 16 liefert bereits fertige Flat-Config-Arrays; die
 * Bruecke ueber FlatCompat wird nicht mehr benoetigt.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "reference/**",
      "out/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Die PDF-Vorlagen verwenden <Image> aus @react-pdf/renderer. Das ist kein
    // HTML-Bild: Ein PDF kennt kein alt-Attribut, und die Regel wuerde nur zu
    // wirkungslosen Attributen fuehren. Die Bildunterschriften in den Vorlagen
    // sind die tatsaechliche Beschreibung.
    files: ["src/lib/expose/vorlage-*.tsx", "src/lib/expose/bausteine.tsx"],
    rules: { "jsx-a11y/alt-text": "off" },
  },
  {
    rules: {
      // Sicherheitsrelevant: kein stiller Typverlust an Systemgrenzen.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
