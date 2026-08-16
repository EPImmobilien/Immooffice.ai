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
